import assert from "node:assert/strict";
import test from "node:test";
import { dealTermsVersion, feedbackHashes } from "../src/feedback";
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

type FakeFeedback = {
  id: number;
  dealId: string;
  termsVersion: string;
  vote: string;
  browserHash: string;
  networkHash: string;
  createdAt: string;
  reviewStatus: string;
  reviewNote: string;
  reviewedAt: string | null;
};

class FakeStatement {
  constructor(private db: FakeDb, private sql: string, private params: unknown[] = []) {}
  bind(...values: unknown[]) {
    return new FakeStatement(this.db, this.sql, values);
  }
  async first<T>(): Promise<T | null> {
    const sql = this.sql;
    if (sql.includes("FROM deals WHERE id =")) {
      if (this.db.failDetail) throw new Error("D1_ERROR: database is unavailable");
      const id = String(this.params[0]);
      const entry = this.db.deals.find(candidate => candidate.id === id);
      return (entry ? rowOf(entry) : null) as T | null;
    }
    if (sql.includes("INSERT INTO deal_feedback")) {
      const [dealId, termsVersion, vote, browserHash, networkHash, createdAt] = this.params.map(String);
      if (this.db.feedback.some(row => row.dealId === dealId && row.termsVersion === termsVersion && row.browserHash === browserHash)) {
        return null;
      }
      const id = this.db.feedbackSeq + 1;
      this.db.feedbackSeq = id;
      this.db.feedback.push({
        id, dealId: dealId!, termsVersion: termsVersion!, vote: vote!, browserHash: browserHash!,
        networkHash: networkHash!, createdAt: createdAt!, reviewStatus: "pending", reviewNote: "", reviewedAt: null,
      });
      return { id } as T;
    }
    if (sql.includes("FROM deal_feedback") && sql.includes("COUNT(*)")) {
      const [hash, since] = this.params.map(String);
      const field: "browserHash" | "networkHash" = sql.includes("network_hash") ? "networkHash" : "browserHash";
      const n = this.db.feedback.filter(row => row[field] === hash && row.createdAt >= since!).length;
      return { n } as T;
    }
    if (sql.includes("UPDATE deal_feedback SET review_status")) {
      const [status, note, reviewedAt, id] = this.params;
      const row = this.db.feedback.find(candidate => candidate.id === Number(id));
      if (!row) return null;
      row.reviewStatus = String(status);
      row.reviewNote = String(note);
      row.reviewedAt = String(reviewedAt);
      return { id: row.id } as T;
    }
    return null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes("FROM deal_feedback") && this.sql.includes("GROUP BY vote")) {
      const [dealId, termsVersion, since] = this.params.map(String);
      const rows = this.db.feedback.filter(row =>
        row.dealId === dealId && row.termsVersion === termsVersion && row.createdAt >= since! &&
        (row.reviewStatus === "pending" || row.reviewStatus === "kept"));
      const results = (["works", "expired", "unknown"] as const)
        .map(vote => {
          const subset = rows.filter(row => row.vote === vote);
          if (!subset.length) return null;
          return {
            vote,
            total: subset.length,
            browsers: new Set(subset.map(row => row.browserHash)).size,
            networks: new Set(subset.map(row => row.networkHash)).size,
            last_at: subset[subset.length - 1]!.createdAt,
          };
        })
        .filter(Boolean) as T[];
      return { results };
    }
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
  feedback: FakeFeedback[] = [];
  feedbackSeq = 0;
  constructor(public deals: DealRecord[], public failDetail = false) {}
  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

const env = { DB: new FakeDb(deals), FEEDBACK_PEPPER: "worker-test-pepper" } as unknown as Env;

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

test("a database failure on a deal page returns 503 with an honest message, not 404", async () => {
  const failingEnv = { DB: new FakeDb(deals, true) } as unknown as Env;
  const response = await worker.fetch!(new Request("https://dealhunter.example/deal/ai-deal-1"), failingEnv);
  assert.equal(response.status, 503);
  const html = await response.text();
  assert.match(html, /数据暂时不可用，请稍后再试/);
  assert.match(html, /503 · SERVICE UNAVAILABLE/);
  assert.doesNotMatch(html, /没有找到这条优惠/);
  assert.doesNotMatch(html, /D1_ERROR|database is unavailable/);
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

/* ---------------------------------------------------------------------- */
/* Anonymous "can I still claim it?" feedback                              */
/* ---------------------------------------------------------------------- */

const FEEDBACK_BROWSER = "browser-test-0000001";
const TEST_PEPPER = "worker-test-pepper";

function feedbackBody(deal: DealRecord = aiDeal, vote = "works", browserId = FEEDBACK_BROWSER) {
  return { dealId: deal.id, termsVersion: dealTermsVersion(deal), vote, browserId };
}

async function postFeedback(body: unknown, customEnv: Env = env): Promise<Response> {
  return worker.fetch!(new Request("https://dealhunter.example/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), customEnv);
}

async function postReview(body: unknown, customEnv: Env, token?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return worker.fetch!(new Request("https://dealhunter.example/api/admin/feedback/review", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }), customEnv);
}

test("feedback is stored anonymously and shown as an idempotent form on the detail page", async () => {
  const db = new FakeDb(deals);
  const localEnv = { DB: db, FEEDBACK_PEPPER: TEST_PEPPER } as unknown as Env;
  const first = await postFeedback(feedbackBody(), localEnv);
  assert.equal(first.status, 200);
  const firstData = (await first.json()) as { ok: boolean; created: boolean; summary: { works: number; display: string } };
  assert.equal(firstData.ok, true);
  assert.equal(firstData.created, true);
  assert.equal(firstData.summary.works, 1);
  assert.equal(firstData.summary.display, "none");
  assert.equal(db.feedback.length, 1);

  const duplicate = await postFeedback(feedbackBody(), localEnv);
  assert.equal(duplicate.status, 200);
  const duplicateData = (await duplicate.json()) as { created: boolean };
  assert.equal(duplicateData.created, false);
  assert.equal(db.feedback.length, 1);

  const detail = await worker.fetch!(new Request("https://dealhunter.example/deal/ai-deal-1"), localEnv);
  const html = await detail.text();
  assert.match(html, /领取状态反馈/);
  assert.match(html, /data-terms-version="[a-z0-9]+"/);
  for (const vote of ["works", "expired", "unknown"]) assert.match(html, new RegExp(`value="${vote}"`));
  assert.match(html, /还没有足够反馈/);
});

test("feedback rejects invalid payloads and stale versions without writing", async () => {
  const db = new FakeDb(deals);
  const localEnv = { DB: db, FEEDBACK_PEPPER: TEST_PEPPER } as unknown as Env;
  const invalidVote = await postFeedback(feedbackBody(aiDeal, "maybe"), localEnv);
  assert.equal(invalidVote.status, 400);
  assert.equal(((await invalidVote.json()) as { error: string }).error, "invalid_vote");

  const invalidBrowser = await postFeedback({ ...feedbackBody(), browserId: "short" }, localEnv);
  assert.equal(invalidBrowser.status, 400);
  assert.equal(((await invalidBrowser.json()) as { error: string }).error, "invalid_browser");

  const unknownDeal = await postFeedback({ ...feedbackBody(), dealId: "nope-deal" }, localEnv);
  assert.equal(unknownDeal.status, 404);

  const stale = await postFeedback({ ...feedbackBody(), termsVersion: "stale0version" }, localEnv);
  assert.equal(stale.status, 409);
  assert.equal(((await stale.json()) as { error: string }).error, "stale_version");
  assert.equal(db.feedback.length, 0);

  const getAttempt = await worker.fetch!(new Request("https://dealhunter.example/api/feedback"), localEnv);
  assert.equal(getAttempt.status, 405);

  const invalidJson = await worker.fetch!(new Request("https://dealhunter.example/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  }), localEnv);
  assert.equal(invalidJson.status, 400);
});

test("only the admin token can move a feedback row into review", async () => {
  const db = new FakeDb(deals);
  const unconfigured = { DB: db, FEEDBACK_PEPPER: TEST_PEPPER } as unknown as Env;
  const seed = await postFeedback(feedbackBody(), unconfigured);
  assert.equal(seed.status, 200);
  const id = db.feedback[0]!.id;

  const noToken = await postReview({ id, status: "held", note: "official page says ended" }, unconfigured);
  assert.equal(noToken.status, 503);

  const configured = { DB: db, ADMIN_TOKEN: "test-admin-token", FEEDBACK_PEPPER: TEST_PEPPER } as unknown as Env;
  const wrongToken = await postReview({ id, status: "held" }, configured, "wrong-token");
  assert.equal(wrongToken.status, 401);

  const accepted = await postReview({ id, status: "held", note: "official page says ended" }, configured, "test-admin-token");
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true });
  assert.equal(db.feedback[0]!.reviewStatus, "held");
  assert.equal(db.feedback[0]!.reviewNote, "official page says ended");

  const missing = await postReview({ id: 999, status: "held" }, configured, "test-admin-token");
  assert.equal(missing.status, 404);
});

test("feedback refuses writes when FEEDBACK_PEPPER is not configured", async () => {
  const db = new FakeDb(deals);
  const noPepperEnv = { DB: db } as unknown as Env;
  const response = await postFeedback(feedbackBody(), noPepperEnv);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "feedback_unavailable" });
  assert.equal(db.feedback.length, 0);

  // The detail page only aggregates stored rows; it must stay readable without
  // the secret and must never silently hash with a fallback salt.
  const detail = await worker.fetch!(new Request("https://dealhunter.example/deal/ai-deal-1"), noPepperEnv);
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /领取状态反馈/);
});

test("a burst from one browser is rate limited before another row is written", async () => {
  const db = new FakeDb(deals);
  const localEnv = { DB: db, FEEDBACK_PEPPER: TEST_PEPPER } as unknown as Env;
  const { browserHash } = await feedbackHashes({ browserId: FEEDBACK_BROWSER, networkKey: "unknown", now: new Date(), pepper: TEST_PEPPER });
  for (let index = 0; index < 3; index += 1) {
    db.feedback.push({
      id: index + 1, dealId: `other-deal-${index}`, termsVersion: "abc123", vote: "works",
      browserHash, networkHash: `network-${index}`, createdAt: new Date().toISOString(),
      reviewStatus: "pending", reviewNote: "", reviewedAt: null,
    });
  }
  db.feedbackSeq = 3;
  const response = await postFeedback(feedbackBody(), localEnv);
  assert.equal(response.status, 429);
  const data = (await response.json()) as { error: string; scope?: string };
  assert.equal(data.error, "rate_limited");
  assert.equal(data.scope, "browser");
  assert.equal(db.feedback.length, 3);
});

test("the network-layer limit stops a visitor from rotating the browser id", async () => {
  const db = new FakeDb(deals);
  const localEnv = { DB: db, FEEDBACK_PEPPER: TEST_PEPPER } as unknown as Env;
  const { networkHash } = await feedbackHashes({ browserId: FEEDBACK_BROWSER, networkKey: "unknown", now: new Date(), pepper: TEST_PEPPER });
  for (let index = 0; index < 10; index += 1) {
    db.feedback.push({
      id: index + 1, dealId: `other-deal-${index}`, termsVersion: "abc123", vote: "works",
      browserHash: `seed-browser-${String(index).padStart(4, "0")}`, networkHash, createdAt: new Date().toISOString(),
      reviewStatus: "pending", reviewNote: "", reviewedAt: null,
    });
  }
  db.feedbackSeq = 10;
  const response = await postFeedback(feedbackBody(), localEnv);
  assert.equal(response.status, 429);
  const data = (await response.json()) as { error: string; scope?: string };
  assert.equal(data.error, "rate_limited");
  assert.equal(data.scope, "network");
  assert.equal(db.feedback.length, 10);
});
