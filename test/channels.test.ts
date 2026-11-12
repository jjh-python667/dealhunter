import assert from "node:assert/strict";
import test from "node:test";
import { buildBoard } from "../src/board";
import { renderPage } from "../src/page";
import { CHANNELS } from "../src/routes";
import { CLIENT_SCRIPT } from "../src/ui/client";
import type { DealRecord } from "../src/types";

const now = new Date("2026-11-10T03:00:00Z");

function deal(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {
    id, title: `Offer ${id}`, summary: "Free trial for students", category: "software",
    valueText: "", valueAmount: null, valueCurrency: null, valueTier: "unverified",
    conditions: "", regions: "", startsAt: null, endsAt: null, timeText: "", steps: "",
    officialUrl: "https://example.com/offer", sourceUrl: "https://example.com/feed",
    sourceName: "Example", sourceId: "example", lastVerifiedAt: now.toISOString(),
    riskNote: "", dealType: "unverified", status: "active", publishedAt: null, rankScore: 0,
    firstSeenAt: now.toISOString(), updatedAt: now.toISOString(), archiveReason: "", ...extra,
  };
}

function page(rows: DealRecord[], extra: Partial<Parameters<typeof renderPage>[0]> = {}): string {
  return renderPage({ board: buildBoard(rows, now), deals: rows, now, run: null, checks: [], expand: false, ...extra });
}

function cardCategories(html: string): string[] {
  return [...html.matchAll(/<article [^>]*data-category="([^"]+)"/g)].map(match => match[1]);
}

function cardIds(html: string): string[] {
  return [...html.matchAll(/<article [^>]*data-id="([^"]+)"/g)].map(match => match[1]);
}

test("the AI channel renders only AI cards and marks itself as the current page", () => {
  const rows = [deal("ai-1", { category: "ai" }), deal("vps-1", { category: "vps" }), deal("soft-1", { category: "software" })];
  const html = page(rows, { channel: "ai" });
  assert.match(html, /<html[^>]*data-channel="ai"/);
  assert.deepEqual(cardCategories(html), ["ai"]);
  assert.deepEqual(cardIds(html), ["ai-1"]);
  assert.match(html, /data-nav="ai-tools" aria-current="page"/);
  assert.doesNotMatch(html, /data-nav="(?:home|cloud)" aria-current="page"/);
  assert.match(html, /<title>AI 工具优惠 · GLOBAL DEAL HUNTER<\/title>/);
  assert.match(html, /AI TOOLS · 频道/);
});

test("the cloud channel maps to the vps category and scopes its counts", () => {
  const rows = [
    deal("ai-1", { category: "ai", rankScore: 50 }),
    deal("vps-1", { category: "vps", endsAt: "2026-11-12" }),
    deal("vps-2", { category: "vps", endsAt: "2026-11-11" }),
  ];
  const html = page(rows, { channel: "cloud" });
  assert.match(html, /<html[^>]*data-channel="vps"/);
  assert.deepEqual(cardCategories(html), ["vps", "vps"]);
  assert.equal(cardIds(html).includes("ai-1"), false);
  assert.match(html, /<strong>2<\/strong><span>云服务在册<\/span>/);
  assert.match(html, /data-nav="cloud" aria-current="page"/);
  assert.match(html, /<span>全部情报<\/span><b>2<\/b>/);
});

test("the channel pages hide the category filter but keep every discovery control", () => {
  const html = page([deal("ai-1", { category: "ai" })], { channel: "ai" });
  assert.match(html, /<label class="select-wrap channel-hidden" hidden>/);
  for (const control of [
    'id="q"', 'id="deal-type"', 'id="sort"', 'id="pagination"', 'id="preferences"',
    'id="alerts"', 'id="sources"', 'id="empty-reset"', 'data-evidence="region"',
    'data-evidence="terms"', 'data-evidence="deadline"', 'class="icon-button bookmark"',
  ]) {
    assert.ok(html.includes(control), `missing control: ${control}`);
  }
});

test("the plain /deals dashboard keeps the category filter and every category", () => {
  const rows = [deal("ai-1", { category: "ai" }), deal("vps-1", { category: "vps" }), deal("bank-1", { category: "bank" })];
  const html = page(rows);
  assert.match(html, /<html[^>]*data-channel=""/);
  assert.match(html, /<label class="select-wrap"><span>分类<\/span><select id="category"/);
  assert.doesNotMatch(html, /class="select-wrap channel-hidden"/);
  assert.equal(new Set(cardCategories(html)).size, 3);
  assert.doesNotMatch(html, /data-nav="[a-z-]+" aria-current="page"/);
});

test("an empty channel carries its own empty-state copy for no-JS and the client", () => {
  const html = page([deal("other", { category: "software" })], { channel: "ai" });
  assert.match(html, /data-empty-title="频道里暂时没有匹配的 AI 优惠"/);
  assert.match(html, /data-empty-note="试试更短的关键词，或清除地区、条件与期限筛选。"/);
  assert.match(html, /<h3 id="empty-title">频道里暂时没有匹配的 AI 优惠<\/h3>/);
  assert.doesNotMatch(html, /<section class="empty-state" id="empty-state"[^>]* hidden>/);
  assert.deepEqual(cardIds(html), []);
});

test("archived records stay inside their own channel and keep the archive marker", () => {
  const rows = [
    deal("ai-old", { category: "ai", status: "archived", archiveReason: "活动已结束" }),
    deal("vps-old", { category: "vps", status: "archived" }),
    deal("ai-live", { category: "ai" }),
  ];
  const html = page(rows, { channel: "ai" });
  assert.deepEqual(cardIds(html).sort(), ["ai-live", "ai-old"]);
  assert.doesNotMatch(html, /data-id="vps-old"/);
  assert.match(html, /data-archived="true"/);
  assert.match(html, /活动已结束/);
});

test("channel cards keep the canonical title and detail links", () => {
  const html = page([deal("ai-1", { category: "ai" })], { channel: "ai" });
  assert.match(html, /<a class="card-title-link" href="\/deal\/ai-1">/);
  assert.match(html, /<a class="detail-link" href="\/deal\/ai-1">查看详情/);
});

test("the shared client keeps channel scope, focus, panel and legacy hash hooks", () => {
  for (const hook of [
    "const channel = root.dataset.channel || ''",
    "card.dataset.category !== channel",
    "params.get('focus') === 'search'",
    "['#alerts','#preferences']",
    "categoryValue()",
    "if (!select) return;",
    "'#sec-a'",
    "'#sec-h'",
    "data-set-lang",
    "dh-saved",
    "dh-preferences",
    "#sources",
    "IntersectionObserver",
  ]) {
    assert.ok(CLIENT_SCRIPT.includes(hook), `missing client hook: ${hook}`);
  }
});

test("both channel keys expose their contract copy through the shared route metadata", () => {
  assert.equal(CHANNELS.ai.category, "ai");
  assert.equal(CHANNELS.cloud.category, "vps");
  assert.match(CHANNELS.ai.emptyTitle, /AI 优惠/);
  assert.match(CHANNELS.cloud.emptyTitle, /云服务优惠/);
});
