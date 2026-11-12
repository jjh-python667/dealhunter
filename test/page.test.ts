import assert from "node:assert/strict";
import test from "node:test";
import { buildBoard } from "../src/board";
import { formatWhen } from "../src/extract";
import { renderPage, uniqueDeals } from "../src/page";
import { offerEvidence, offerRevision } from "../src/content/evidence";
import type { DealRecord } from "../src/types";

const now = new Date("2026-11-10T03:00:00Z");
function deal(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {id,title:`Offer ${id}`,summary:"Free trial for students",category:"software",valueText:"",valueAmount:null,
    valueCurrency:null,valueTier:"unverified",conditions:"",regions:"",startsAt:null,endsAt:null,timeText:"",steps:"",
    officialUrl:"https://example.com/offer",sourceUrl:"https://example.com/feed",sourceName:"Example",sourceId:"example",
    lastVerifiedAt:now.toISOString(),riskNote:"",dealType:"unverified",status:"active",publishedAt:null,rankScore:0,
    firstSeenAt:now.toISOString(),updatedAt:now.toISOString(),archiveReason:"",...extra};
}
function page(rows: DealRecord[], extra: Partial<Parameters<typeof renderPage>[0]> = {}) {
  return renderPage({board:buildBoard(rows,now),deals:rows,now,run:null,checks:[],expand:false,...extra});
}

test("a deal in several views is rendered once, without losing its memberships", () => {
  const rows = [deal("ai",{category:"ai",endsAt:"2026-11-12",rankScore:100})];
  const board = buildBoard(rows,now);
  assert.equal(uniqueDeals(board).length,1);
  const html = page(rows);
  assert.equal((html.match(/<article /g) || []).length,1);
  assert.match(html,/data-sections="A B C G"/);
});

test("all supplied records stay searchable beyond the old 80-item feed cap", () => {
  const rows = Array.from({length:100},(_,i)=>deal(String(i).padStart(3,"0"),{
    publishedAt:"2026-10-01T00:00:00Z",
  }));
  const html = page(rows);
  assert.equal((html.match(/<article /g) || []).length,100);
  assert.match(html,/data-id="099"/);
});

test("expired active records inherit the archive state from the board", () => {
  const html = page([deal("expired",{endsAt:"2026-11-01"})]);
  assert.match(html,/<article class="card archived"[^>]+data-archived="true"[^>]+ hidden>/);
  assert.match(html,/已归档/);
});

test("unsafe source links and hostile translated text never become executable markup", () => {
  const html = page([deal('bad" onmouseover="alert(1)',{
    title:"<script>alert(1)</script>",zhTitle:'<img src=x onerror="alert(1)">',
    officialUrl:"javascript:alert(1)",sourceUrl:"data:text/html,bad",
  })]);
  assert.doesNotMatch(html,/href="(?:javascript:|data:)/);
  assert.doesNotMatch(html,/<img src=x/);
  assert.doesNotMatch(html,/<script>alert\(1\)/);
  assert.match(html,/&lt;img src=x/);
  assert.match(html,/data-id="bad&quot; onmouseover=&quot;alert\(1\)"/);
});

test("source-only and partially translated records retain their original fields", () => {
  const html = page([deal("partial",{zhTitle:"试用优惠"}),deal("original")]);
  assert.match(html,/部分内容已翻译/);
  assert.match(html,/Free trial for students/);
  assert.match(html,/原文展示/);
  assert.match(html,/data-set-lang="en"/);
});

test("the first render has twelve active cards and no automatic expanded details", () => {
  const html = page(Array.from({length:20},(_,i)=>deal(String(i))));
  const articles = html.match(/<article[^>]+>/g) || [];
  assert.equal(articles.filter(article=>!article.endsWith(" hidden>")).length,12);
  assert.doesNotMatch(html,/<details class="deal-details" open>/);
});

test("public error pages do not disclose internal database errors or admin instructions", () => {
  const html = page([],{dbError:"SQLITE_ERROR secret internal database path"});
  assert.match(html,/情报暂时无法载入/);
  assert.doesNotMatch(html,/SQLITE_ERROR|ADMIN_TOKEN|migrate:local|secret internal/);
});

test("unknown dates and regions remain pending and source risk notes remain accessible", () => {
  const html = page([deal("risk",{category:"bank",riskNote:"原始风险说明，不能删除。"})]);
  assert.match(html,/待核实/);
  assert.match(html,/原始风险说明，不能删除。/);
  assert.match(html,/请先查看风险与资格/);
});

test("shared date formatter preserves date-only values and Beijing midnight conversion", () => {
  assert.equal(formatWhen(null), "");
  assert.equal(formatWhen("2026-11-10"), "2026-11-10");
  assert.equal(formatWhen("2026-11-10T16:30:00Z"), "2026/11/11 00:30 北京时间");
  assert.equal(formatWhen("unknown"), "unknown");
});

test("translated offer details retain the original excerpt and precise deadline", () => {
  const html = page([deal("translated", {
    zhSummary: "面向学生的免费试用",
    endsAt: "2026-11-10T16:30:00Z",
  })]);
  assert.match(html, /<dt>来源原文摘录<\/dt><dd>Free trial for students<\/dd>/);
  assert.match(html, /<dt>摘录译文<\/dt><dd>面向学生的免费试用<\/dd>/);
  assert.match(html, /<dt>截止日期<\/dt><dd>2026\/11\/11 00:30 北京时间<\/dd>/);
});

test("source status distinguishes the failed attempt from the last successful collection", () => {
  const html = page([], {
    checks: [{
      sourceId: "example", sourceUrl: "https://example.com/feed", httpStatus: null,
      ok: false, error: "TimeoutError at internal hostname", itemsSeen: 0, itemsKept: 0,
      checkedAt: now.toISOString(),
    }],
    sourceSuccess: new Map([["example", "2026-11-09T03:00:00Z"]]),
  });
  assert.match(html, /请求超时/);
  assert.match(html, /最近尝试 2026\/11\/10 11:00 北京时间/);
  assert.match(html, /最近成功 2026\/11\/09 11:00 北京时间/);
  assert.doesNotMatch(html, /internal hostname/);
});

test("payment and renewal flags require source evidence and surface conflicting terms", () => {
  const offer = deal("terms", {
    summary: "Available in the UK. No credit card required. Does not automatically renew.",
    endsAt: "2026-11-12",
  });
  const evidence = offerEvidence(offer);
  assert.equal(evidence.card, "no");
  assert.equal(evidence.renewal, "no");
  assert.deepEqual(evidence.regions, ["gb"]);
  assert.equal(evidence.deadline, Date.parse("2026-11-12T23:59:59.999Z"));
  const conflict = { ...offer, summary: offer.summary + " A credit card is required. It automatically renews." };
  assert.equal(offerEvidence(conflict).card, "conflict");
  assert.equal(offerEvidence(conflict).renewal, "conflict");
  assert.match(page([conflict]), /来源表述有冲突/);
  assert.equal(offerEvidence(deal("unknown")).card, "unknown");
  assert.equal(offerRevision(offer, evidence), offerRevision({ ...offer, lastVerifiedAt: "2026-11-12" }, evidence));
  assert.notEqual(offerRevision(offer, evidence), offerRevision(conflict, offerEvidence(conflict)));
});

test("the shared navigation and canonical detail links are rendered on the dashboard", () => {
  const html = page([deal("linked")]);
  assert.match(html, /<header class="topnav" data-active="deals">/);
  assert.match(html, /<a class="card-title-link" href="\/deal\/linked">/);
  assert.match(html, /<a class="detail-link" href="\/deal\/linked">查看详情/);
  assert.match(html, /<html[^>]*data-channel=""/);
});

test("the plain /deals dashboard keeps its category filter and all categories", () => {
  const rows = [deal("ai", { category: "ai" }), deal("vps", { category: "vps" })];
  const html = page(rows);
  assert.match(html, /<label class="select-wrap"><span>分类<\/span><select id="category"/);
  assert.doesNotMatch(html, /class="select-wrap channel-hidden"/);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.doesNotMatch(html, /data-nav="[a-z-]+" aria-current="page"/);
});
