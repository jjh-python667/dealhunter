const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { gzipSync } = require("node:zlib");
const { Miniflare } = require("miniflare");

const requests = Number(process.env.BENCH_REQUESTS || 200);
const concurrency = Number(process.env.BENCH_CONCURRENCY || 20);
assert.ok(Number.isSafeInteger(requests) && Number.isSafeInteger(concurrency) && requests >= concurrency && concurrency > 0);

function p95(values) {
  return Math.round([...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] * 10) / 10;
}

async function benchmark(runtime, mode, headers) {
  const results = await Promise.all(Array.from({length: concurrency}, async (_, index) => {
    const samples = [];
    for (let i = index; i < requests; i += concurrency) {
      const started = performance.now();
      const response = await runtime.dispatchFetch("http://localhost/", {headers});
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      samples.push({
        ms: performance.now() - started,
        status: response.headers.get("x-dealhunter-cache"),
        rows: Number(response.headers.get("server-timing")?.split("dur=")[1]),
      });
    }
    return samples;
  }));
  const samples = results.flat();
  const hits = samples.filter(sample => sample.status === "EDGE").length;
  if (mode === "warm") assert.equal(hits, requests);
  return {
    mode, requests, concurrency, p95Ms: p95(samples.map(sample => sample.ms)),
    edgeHitRate: hits / requests,
    measuredD1Rows: samples.reduce((sum, sample) => sum + sample.rows, 0) / requests,
  };
}

async function main() {
  const config = {
    name: "snapshot-benchmark", compatibilityDate: "2026-11-10", compatibilityFlags: ["nodejs_compat"],
    cache: {enabled: true},
    manifest: {mainModule: "index.js", modules: {"index.js": {type: "esm", contents: readFileSync("dist/index.js", "utf8")}}},
    env: {DB: {type: "d1", id: "snapshot-benchmark-local"}},
  };
  const runtime = new Miniflare({workers: [{config}], resourceTmpPath: process.env.TEMP});
  try {
    const db = await runtime.getD1Database("DB");
    for (const file of readdirSync("migrations").filter(name => name.endsWith(".sql")).sort()) {
      const sql = readFileSync("migrations/" + file, "utf8").replace(/^\s*--.*$/gm, "");
      for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const snapshot = JSON.parse(readFileSync("preview/snapshot.json", "utf8"));
    const deals = [...new Map(snapshot.board.feed.map(deal => [deal.id, deal])).values()];
    await db.batch(deals.map(deal => db.prepare(`INSERT INTO deals
      (id, title, category, summary, value_text, value_tier, conditions, regions, starts_at, ends_at, official_url,
      source_name, source_url, source_id, last_verified_at, deal_type, status, published_at, rank_score, first_seen_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      deal.id, deal.title, deal.category, deal.summary, deal.valueText, deal.valueTier, deal.conditions, deal.regions,
      deal.startsAt, deal.endsAt, deal.officialUrl, deal.sourceName, deal.sourceUrl, deal.sourceId,
      deal.lastVerifiedAt, deal.dealType, deal.status, deal.publishedAt, deal.rankScore, deal.firstSeenAt, deal.updatedAt,
    )));
    const baseline = {authorization: "Benchmark bypass"};
    const html = await (await runtime.dispatchFetch("http://localhost/", {headers: baseline})).text();
    assert.match(html, /id="recommendations"/);
    const now = Date.now();
    await db.prepare(`INSERT INTO portal_snapshots VALUES (?, ?, ?, ?)`)
      .bind("v1:home:zh", now, now + 20 * 60_000, Uint8Array.from(gzipSync(html)).buffer).run();
    const cold = await runtime.dispatchFetch("http://localhost/");
    assert.equal(cold.headers.get("x-dealhunter-cache"), "SNAPSHOT");
    assert.equal(await cold.text(), html);
    const warmed = await runtime.dispatchFetch("http://localhost/");
    assert.equal(warmed.headers.get("x-dealhunter-cache"), "EDGE");
    await warmed.arrayBuffer();
    const live = await benchmark(runtime, "live", baseline);
    const warm = await benchmark(runtime, "warm");
    const detection = deals.flatMap(deal => {
      const elapsed = Date.parse(deal.firstSeenAt) - Date.parse(deal.publishedAt);
      return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed / 60_000] : [];
    });
    console.log(JSON.stringify({
      fixtureDeals: deals.length, coldD1Rows: cold.headers.get("server-timing"),
      live, warm, sampleDiscovery: {samples: detection.length, p95Minutes: detection.length ? p95(detection) : null},
    }, null, 2));
  } finally {
    await runtime.dispose();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
