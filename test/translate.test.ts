import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { collectionToken, finishRun, insertDeal, insertRun, insertSourceCheck, listDeals, recentSourceChecks, saveCollectedDeal, updateDeal, type QueryDb, type QueryStatement } from "../src/db";
import { scheduledSources, SOURCES } from "../src/sources";
import { runCollection } from "../src/collect";
import { bilingual, renderPage } from "../src/page";
import { buildBoard } from "../src/board";
import { ENGINE, acceptable, clip, limitsFromEnv, needsTranslation, runTranslation, type TranslatorBinding } from "../src/translate";
import type { DealRecord } from "../src/types";

function memoryDb(): QueryDb {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of ["0001_init.sql", "0002_translation.sql"]) {
    sqlite.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
  }
  return {
    prepare(sql: string): QueryStatement {
      let values: Array<string | number | null> = [];
      const stmt: QueryStatement = {
        bind(...next) {
          values = next;
          return stmt;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...values) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...values) as T[] };
        },
        async run() {
          return sqlite.prepare(sql).run(...values);
        },
      };
      return stmt;
    },
  };
}

function deal(id: string, title: string, summary: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {
    id, title, category: "ai", summary, valueText: "", valueAmount: null, valueCurrency: null, valueTier: "unverified",
    conditions: "", regions: "", startsAt: null, endsAt: null, timeText: "", steps: "", officialUrl: "https://example.com/" + id,
    sourceName: "Example", sourceUrl: "https://example.com/feed", sourceId: "example", lastVerifiedAt: "2026-11-10T00:00:00Z",
    riskNote: "", dealType: "unverified", status: "active", publishedAt: null, rankScore: 0,
    firstSeenAt: "2026-11-10T01:00:00Z", updatedAt: "2026-11-10T01:00:00Z", archiveReason: "", ...extra,
  };
}

function fakeAi(): TranslatorBinding & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async run(_model, input) {
      calls.push(input.text);
      return { translated_text: `译文：${input.text.length}字符的英文` };
    },
  };
}

test("a full hour covers each source and checks priority feeds every quarter", () => {
  const rounds = [0, 15, 30, 45].map(minute => scheduledSources(Date.UTC(2026, 10, 12, 12, minute)));
  assert.deepEqual(new Set(rounds.flatMap(round => round.map(source => source.id))), new Set(SOURCES.map(source => source.id)));
  assert.ok(rounds.every(round => round.some(source => source.id === "openai-news") && round.length <= 12));
});

test("recent status merges staggered runs and update token advances only for completed runs", async () => {
  const db = memoryDb();
  for (const [id, sources] of [["first", ["a", "b"]], ["second", ["b"]]] as const) {
    const time = id === "first" ? "2026-11-12T01:00:00Z" : "2026-11-12T01:15:00Z";
    await insertRun(db, { id, trigger: "cron", cron: null, startedAt: time });
    for (const sourceId of sources) await insertSourceCheck(db, id, {
      sourceId, sourceUrl: "https://example.com/feed", httpStatus: 200, ok: id === "first",
      error: "", itemsSeen: 1, itemsKept: 1, checkedAt: time,
    });
    if (id === "first") await finishRun(db, {
      id, finishedAt: time, ok: true, inserted: 1, updated: 0, archived: 0, skipped: 0, error: null,
    });
  }
  assert.equal(await collectionToken(db), "first");
  assert.deepEqual((await recentSourceChecks(db)).map(row => [row.sourceId, row.ok]), [["a", true], ["b", false]]);
});

test("collection deduplicates stable IDs and protects a newer revision and its first-seen time", async () => {
  const db = memoryDb();
  const initial = deal("same", "First", "Free trial");
  assert.equal(await saveCollectedDeal(db, initial), "inserted");
  await saveCollectedDeal(db, { ...initial, title: "New", firstSeenAt: "2026-11-13", updatedAt: "2026-11-13" });
  await saveCollectedDeal(db, { ...initial, title: "Late stale update" });
  const rows = await listDeals(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.title, "New");
  assert.equal(rows[0]?.firstSeenAt, initial.firstSeenAt);
});

test("a successful HTTP response with an invalid feed records a source failure", async () => {
  const db = memoryDb();
  const report = await runCollection(db, {
    trigger: "test", sources: [SOURCES[0]!],
    fetchImpl: async () => new Response("<html>Maintenance</html>"),
  });
  assert.equal(report.checks[0]?.ok, false);
  assert.equal(report.checks[0]?.httpStatus, 200);
});

test("language detection skips Chinese and empty text", () => {
  assert.equal(needsTranslation("Get $300 free credit"), true);
  assert.equal(needsTranslation("免费领取 300 美元额度"), false);
  assert.equal(needsTranslation(""), false);
  assert.equal(needsTranslation("$5"), false);
  assert.equal(acceptable("hello", "hello"), false);
  assert.equal(acceptable("hello", "你好"), true);
  assert.ok(clip("word ".repeat(200), 50).length <= 51);
});

test("env overrides cannot raise caps above hard ceilings", () => {
  const limits = limitsFromEnv({ TRANSLATE_BATCH: "999", TRANSLATE_DAILY_MAX: "100000", TRANSLATE_MAX_CHARS: "nope" });
  assert.equal(limits.batchRows, 12);
  assert.equal(limits.dailyMaxRows, 150);
  assert.equal(limits.maxChars, 480);
});

test("translation stores Chinese in new columns, in small batches, and stops at the daily cap", async () => {
  const db = memoryDb();
  for (let i = 0; i < 5; i += 1) await insertDeal(db, deal(`d${i}`, `Free credit offer ${i}`, `Sign up and get $${i}00 credit`));
  await insertDeal(db, deal("cn", "中文标题已经是中文", "中文摘要"));
  const ai = fakeAi();
  const now = new Date("2026-11-10T03:00:00Z");
  const limits = { batchRows: 2, dailyMaxRows: 3, maxChars: 480, maxAttempts: 3 };

  const first = await runTranslation(db, ai, { now, limits });
  assert.equal(first.translated, 2);
  assert.equal(first.skipped, 1); // Chinese row is marked skip without a model call
  assert.equal(ai.calls.length, 4);

  const second = await runTranslation(db, ai, { now, limits });
  assert.equal(second.translated, 1); // only 1 room left under the daily cap of 3
  const third = await runTranslation(db, ai, { now, limits });
  assert.equal(third.reason, "daily_cap_reached");
  assert.equal(ai.calls.length, 6);

  const nextDay = await runTranslation(db, ai, { now: new Date("2026-11-11T03:00:00Z"), limits });
  assert.equal(nextDay.translated, 2);

  const deals = await listDeals(db);
  const done = deals.filter((d) => d.zhTitle);
  assert.equal(done.length, 5);
  assert.ok(done.every((d) => d.zhTitle?.startsWith("译文")));
});

test("no AI binding or disabled flag means zero model calls", async () => {
  const db = memoryDb();
  await insertDeal(db, deal("a", "Free trial", "Try it free for 30 days"));
  assert.equal((await runTranslation(db, undefined, {})).reason, "no_ai_binding");
  const ai = fakeAi();
  assert.equal((await runTranslation(db, ai, { enabled: false })).reason, "disabled");
  assert.equal(ai.calls.length, 0);
});

test("model errors stop the batch and retry at most maxAttempts times", async () => {
  const db = memoryDb();
  await insertDeal(db, deal("a", "Free trial", "Try it free"));
  let calls = 0;
  const broken: TranslatorBinding = { async run() { calls += 1; throw new Error("4006: daily free allocation used up"); } };
  const limits = { batchRows: 5, dailyMaxRows: 50, maxChars: 480, maxAttempts: 2 };
  const r1 = await runTranslation(db, broken, { limits });
  assert.match(r1.reason, /model_error/);
  await runTranslation(db, broken, { limits });
  const r3 = await runTranslation(db, broken, { limits });
  assert.equal(r3.candidates, 0);
  assert.equal(calls, 2);
});

test("changed English text clears the old translation; unchanged text keeps it", async () => {
  const db = memoryDb();
  await insertDeal(db, deal("a", "Free trial", "Try it free"));
  await runTranslation(db, fakeAi(), {});
  await updateDeal(db, deal("a", "Free trial", "Try it free", { lastVerifiedAt: "2026-11-10T05:00:00Z" }));
  assert.ok((await listDeals(db))[0].zhTitle);
  await updateDeal(db, deal("a", "Free trial extended", "Try it free"));
  const [row] = await listDeals(db);
  assert.equal(row.title, "Free trial extended");
  assert.equal(row.zhTitle, "");
  const pending = await db.prepare("SELECT zh_status, zh_engine FROM deals WHERE id = 'a'").first<{ zh_status: string | null; zh_engine: string }>();
  assert.equal(pending?.zh_status, null);
  assert.equal(pending?.zh_engine, ENGINE);
});

test("page renders a 中/EN toggle, defaults to Chinese, and falls back to the original", () => {
  assert.equal(bilingual("Hello <b>", ""), "Hello &lt;b&gt;");
  assert.match(bilingual("Hello", "你好"), /class="t-en" lang="en">Hello<\/span><span class="t-zh" lang="zh-CN">你好/);
  const now = new Date("2026-11-10T03:00:00Z");
  const board = buildBoard([deal("a", "Free trial", "Try it", { zhTitle: "免费试用", zhSummary: "试试看" }), deal("b", "No translation yet", "x")], now);
  const page = renderPage({ board, checks: [], run: null, now, expand: false });
  assert.match(page, /data-lang="zh"/);
  assert.match(page, /data-set-lang="en"/);
  assert.match(page, /免费试用/);
  assert.match(page, /No translation yet/);
  assert.match(renderPage({ board, checks: [], run: null, now, expand: false, lang: "en" }), /data-lang="en"/);
});
