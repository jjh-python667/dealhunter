import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index";
import type { DealRecord } from "../src/types";

const now = new Date("2026-11-10T03:00:00Z");

function deal(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {
    id, title: `Offer ${id}`, category: "ai", summary: "Free trial for students", valueText: "$50",
    valueAmount: 50, valueCurrency: "USD", valueTier: "money", conditions: "New users only",
    regions: "United States", startsAt: null, endsAt: null, timeText: "", steps: "",
    officialUrl: "https://example.com/offer", sourceUrl: "https://example.com/feed", sourceName: "Example",
    sourceId: "example", lastVerifiedAt: now.toISOString(), riskNote: "", dealType: "free",
    status: "active", publishedAt: now.toISOString(), rankScore: 1000,
    firstSeenAt: now.toISOString(), updatedAt: now.toISOString(), archiveReason: "", ...extra,
  };
}

const aiDeal = deal("ai-deal-1", { title: "AI Offer <script>alert(1)</script>", category: "ai" });
const cloudDeal = deal("cloud-deal-1", { category: "vps", title: "Cloud Offer", officialUrl: "https://cloud.example/offer" });
const deals = [aiDeal, cloudDeal];

function rowOf(entry: DealRecord) {
  return {
    id: entry.id, title: entry.title, category: entry.category, summary: entry.summary,
    value_text: entry.valueText, value_amount: entry.valueAmount, value_currency: entry.valueCurrency,
    value_tier: entry.valueTier, conditions: entry.conditions, regions: entry.regions,
    starts_at: entry.startsAt, ends_at: entry.endsAt, time_text: entry.timeText, steps: entry.steps,
    official_url: entry.officialUrl, source_name: entry.sourceName, source_url: entry.sourceUrl,
    source_id: entry.sourceId, last_verified_at: entry.lastVerifiedAt, risk_note: entry.riskNote,
    deal_type: entry.dealType, status: entry.status, published_at: entry.publishedAt,
    rank_score: entry.rankScore, first_seen_at: entry.firstSeenAt, updated_at: entry.updatedAt,
    archive_reason: entry.archiveReason, zh_title: entry.zhTitle ?? "", zh_summary: entry.zhSummary ?? "",
  };
}

class FakeStatement {
  constructor(private db: FakeDb, private sql: string, private params: unknown[] = []) {}
  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.sql, values);
  }
  async first<T>(): Promise<T | null> {
    const sql = this.sql;
    if (sql.includes("FROM deals WHERE id =")) {
      const id = String(this.params[0]);
      const entry = this.db.deals.find(candidate => candidate.id === id);
      return (entry ? rowOf(entry) : null) as T | null;
    }
    return null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes("FROM deals") && this.sql.includes("ORDER BY COALESCE")) {
      return { results: this.db.deals.map(rowOf) as T[] };
    }
    return { results: [] };
  }
  async run(): Promise<unknown> {
    return { success: true };
  }
}

class FakeDb {
  constructor(public deals: DealRecord[]) {}
  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

const env = { DB: new FakeDb(deals) } as unknown as Env;

async function fetchPath(path: string): Promise<Response> {
  return worker.fetch!(new Request(`https://dealhunter.example${path}`), env);
}

test("the portal homepage is server-rendered with real navigation and fresh cards", async () => {
  const response = await fetchPath("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'self'/);
  const html = await response.text();
  assert.match(html, /<header class="topnav"/);
  assert.match(html, /href="\/ai-tools"/);
  assert.match(html, /href="\/cloud"/);
  assert.match(html, /href="\/deals\?view=saved"/);
  assert.match(html, /href="\/deals#alerts"/);
});

test("the discovery dashboard keeps its toolbar, cards and detail links", async () => {
  const html = await (await fetchPath("/deals?lang=en")).text();
  assert.match(html, /id="q"/);
  assert.match(html, /id="deal-list"/);
  assert.match(html, /id="category"/);
  assert.match(html, /data-channel=""/);
  assert.match(html, /href="\/deal\/ai-deal-1"/);
  assert.match(html, /href="\/deal\/cloud-deal-1"/);
});

test("each channel only renders its own category and marks itself active", async () => {
  const ai = await (await fetchPath("/ai-tools")).text();
  assert.match(ai, /data-channel="ai"/);
  assert.match(ai, /data-nav="ai-tools"[^>]*aria-current="page"/);
  assert.match(ai, /href="\/deal\/ai-deal-1"/);
  assert.doesNotMatch(ai, /href="\/deal\/cloud-deal-1"/);

  const cloud = await (await fetchPath("/cloud")).text();
  assert.match(cloud, /data-channel="vps"/);
  assert.match(cloud, /data-nav="cloud"[^>]*aria-current="page"/);
  assert.match(cloud, /href="\/deal\/cloud-deal-1"/);
  assert.doesNotMatch(cloud, /href="\/deal\/ai-deal-1"/);
});

test("a deal detail URL opens directly and escapes hostile titles", async () => {
  const response = await fetchPath("/deal/ai-deal-1");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Offer &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("known and unknown deal ids produce the right status", async () => {
  assert.equal((await fetchPath("/deal/does-not-exist")).status, 404);
  assert.equal((await fetchPath("/nope")).status, 404);
  assert.equal((await fetchPath("/deal/")).status, 404);
});

test("legacy dashboard links are redirected with every filter preserved", async () => {
  const response = await fetchPath("/?view=ending&q=cloud&page=2&lang=en");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/deals?view=ending&q=cloud&page=2&lang=en");
});

test("public APIs still answer without touching the portal routes", async () => {
  const health = await fetchPath("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, worker: "dealhunter" });
  const board = await fetchPath("/api/board");
  assert.equal(board.status, 200);
  const payload = (await board.json()) as { board: { activeCount: number } };
  assert.equal(payload.board.activeCount, 2);
  assert.equal((await fetchPath("/api/nope")).status, 404);
});
