import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { saveSnapshots, serveSnapshot, snapshotBoundary } from "../src/snapshots";
import type { DealRecord } from "../src/types";

const now = Date.parse("2026-11-13T02:00:00Z");

test("edge hits skip D1 and query strings do not multiply cache keys", async () => {
  let reads = 0;
  const db = {
    prepare: () => ({
      bind: () => ({
        all: async () => {
          reads++;
          return { results: [{generated_at: now, valid_until: now + 60_000, html_gzip: [...gzipSync("cached")]}], meta: {rows_read: 1} };
        },
      }),
    }),
  } as unknown as D1Database;
  const entries = new Map<string, Response>();
  const cache = {
    match: async (request: Request) => entries.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => { entries.set(request.url, response); },
  };
  const opts = {
    page: "ai" as const, lang: "zh" as const, db, cache, now,
    live: async () => new Response("live"),
    html: (body: string) => new Response(body),
  };
  const first = await serveSnapshot({ ...opts, request: new Request("https://example.com/ai-tools?q=a") });
  assert.equal(first.headers.get("x-dealhunter-cache"), "SNAPSHOT");
  assert.equal(await first.text(), "cached");
  const second = await serveSnapshot({ ...opts, request: new Request("https://example.com/ai-tools?q=b") });
  assert.equal(second.headers.get("x-dealhunter-cache"), "EDGE");
  assert.equal(second.headers.get("cache-control"), "no-store");
  assert.equal(second.headers.get("server-timing"), "snapshot_d1_rows;dur=0");
  const bypass = await serveSnapshot({ ...opts, request: new Request("https://example.com/ai-tools", {headers: {authorization: "Bearer test"}}) });
  assert.equal(await bypass.text(), "live");
  assert.equal(reads, 1);
});

test("an older snapshot survives a live read failure only before its validity boundary", async () => {
  const db = {
    prepare: () => ({bind: () => ({all: async () => ({
      results: [{generated_at: now - 30 * 60_000, valid_until: now + 1000, html_gzip: [...gzipSync("last good")]}],
      meta: {rows_read: 1},
    })})}),
  } as unknown as D1Database;
  const opts = {
    request: new Request("https://example.com/"), page: "home" as const, lang: "en" as const, db,
    live: async () => new Response("unavailable", {status: 503}),
    html: (body: string) => new Response(body),
  };
  const stale = await serveSnapshot({ ...opts, now });
  assert.equal(stale.headers.get("x-dealhunter-cache"), "STALE");
  assert.equal(await stale.text(), "last good");
  const expired = await serveSnapshot({ ...opts, now: now + 1000 });
  assert.equal(expired.status, 503);
  assert.equal(expired.headers.get("x-dealhunter-cache"), "LIVE");
  const endsAt = new Date(now + 2000).toISOString();
  assert.equal(snapshotBoundary([{status:"active", endsAt} as DealRecord], now), now + 2001);
});

test("late snapshot refreshes cannot overwrite a newer batch", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("migrations/0004_portal_snapshots.sql", "utf8"));
    const db = {
      prepare: (sql: string) => ({
        bind: (key: string, generated: number, valid: number, body: ArrayBuffer) =>
          () => sqlite.prepare(sql).run(key, generated, valid, new Uint8Array(body)),
      }),
      batch: async (statements: Array<() => void>) => { statements.forEach(run => run()); },
    } as unknown as D1Database;
    const pages = [{page: "home", lang: "zh", html: "new"}, {page: "ai", lang: "en", html: "channel"}] as const;
    await saveSnapshots(db, now, now + 60_000, [...pages]);
    await saveSnapshots(db, now - 1, now + 100_000, [{...pages[0], html: "old"}]);
    const row = sqlite.prepare("SELECT generated_at, valid_until FROM portal_snapshots WHERE snapshot_key = 'v1:home:zh'").get();
    assert.equal(row?.generated_at, now);
    assert.equal(row?.valid_until, now + 60_000);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_snapshots").get()?.count, 2);
  } finally {
    sqlite.close();
  }
});
