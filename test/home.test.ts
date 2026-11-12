import assert from "node:assert/strict";
import test from "node:test";
import { evidenceStrength, selectFeatured } from "../src/content/featured";
import type { DealRecord } from "../src/types";
import { HOME_SCRIPT, renderHome } from "../src/ui/home";
import { HOME_CSS } from "../src/ui/home-styles";

const now = new Date("2026-11-10T03:00:00Z");

function deal(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {
    id, title: `Offer ${id}`, summary: "A public discount for new users", category: "software",
    valueText: "", valueAmount: null, valueCurrency: null, valueTier: "unverified",
    conditions: "", regions: "", startsAt: null, endsAt: null, timeText: "", steps: "",
    officialUrl: "https://example.com/offer", sourceUrl: "https://example.com/feed", sourceName: "Example",
    sourceId: "example", lastVerifiedAt: now.toISOString(), riskNote: "", dealType: "free",
    status: "active", publishedAt: null, rankScore: 0, firstSeenAt: now.toISOString(),
    updatedAt: now.toISOString(), archiveReason: "", ...extra,
  };
}

/** Enough written evidence (value + conditions + deadline + fresh verification) to be featured. */
function strong(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return deal(id, { valueText: "$50", valueTier: "money", conditions: "New users only", endsAt: "2026-11-20", ...extra });
}

function home(rows: DealRecord[], extra: Partial<Parameters<typeof renderHome>[0]> = {}): string {
  return renderHome({ deals: rows, now, ...extra });
}

function between(html: string, startId: string, endMarker: string): string {
  const start = html.indexOf(`id="${startId}"`);
  const end = html.indexOf(endMarker, start + 1);
  assert.ok(start >= 0, `expected a section with id ${startId}`);
  assert.ok(end > start, `expected marker ${endMarker} after #${startId}`);
  return html.slice(start, end);
}

/* -------------------------------------------------------------------------- */
/* Page shell                                                                  */
/* -------------------------------------------------------------------------- */

test("the homepage renders the portal shell: skip link, nav, hero, snapshot", () => {
  const html = home([strong("one")]);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="zh-CN" data-lang="zh" data-snapshot-at="\d+">/);
  assert.match(html, /<a class="skip" href="#main">/);
  assert.match(html, /<header class="topnav"[^>]*data-active="home"/);
  assert.match(html, /<main class="portal" id="main">/);
  assert.match(html, /<header class="portal-hero">/);
  assert.match(html, /<h1 id="portal-title">全球羊毛情报中心<\/h1>/);
  assert.match(html, /<p class="eyebrow">GLOBAL DEAL HUNTER<\/p>/);
  assert.match(html, /<title>全球羊毛情报中心 · GLOBAL DEAL HUNTER<\/title>/);
  assert.match(html, /data-snapshot-at="/);
});

test("the four curated sections appear in the fixed order", () => {
  const html = home([strong("one")]);
  const order = ["#today-featured", "#latest", "#ending", "#for-you"];
  const positions = ["id=\"today-featured\"", "id=\"latest\"", "id=\"ending\"", "id=\"for-you\""]
    .map(marker => html.indexOf(marker));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, `sections out of order: ${order.join(" → ")}`);
  for (const marker of positions) assert.ok(marker > html.indexOf('<main class="portal"'), "sections live inside main");
  assert.match(html, /<h2 id="today-featured-title">今日精选<\/h2>/);
  assert.match(html, /<h2 id="latest-title">最新收录<\/h2>/);
  assert.match(html, /<h2 id="ending-title">即将截止<\/h2>/);
  assert.match(html, /<h2 id="for-you-title">适合我<\/h2>/);
});

test("the hero search form works without JavaScript and posts to /deals", () => {
  const html = home([strong("one")]);
  assert.match(html, /<form class="portal-search" action="\/deals" method="get" role="search">/);
  assert.match(html, /<input id="portal-q" name="q" type="search"[^>]*maxlength="160"/);
  assert.match(html, /<button type="submit" aria-label="搜索全部情报">/);
});

test("the title entrance animation exists and is disabled for reduced motion", () => {
  assert.match(HOME_CSS, /@media\(prefers-reduced-motion:no-preference\)/);
  assert.match(HOME_CSS, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(HOME_CSS, /\.portal-hero h1\{animation:title-opening 860ms/);
  assert.match(HOME_CSS, /\.featured-secondary-card\.enter\{animation:card-reveal/);
  assert.match(HOME_CSS, /prefers-reduced-motion:reduce[^}]*animation:none!important/s);
});

test("the page carries a no-JS hint and a non-JS readable card list", () => {
  const html = home([strong("one")]);
  assert.match(html, /<noscript>/);
  assert.match(html, /启用 JavaScript/);
  assert.match(html, /<div class="toast" id="toast" role="status" aria-live="polite"><\/div>/);
});

/* -------------------------------------------------------------------------- */
/* Featured section                                                            */
/* -------------------------------------------------------------------------- */

test("featured renders exactly one primary and two to three supporting picks", () => {
  const rows = [
    strong("alpha", { category: "ai" }),
    strong("bravo", { category: "vps" }),
    strong("charlie", { category: "software" }),
    strong("delta", { category: "bank" }),
  ];
  const html = home(rows);
  const featured = between(html, "today-featured", "id=\"latest\"");
  assert.equal((featured.match(/class="featured-primary"/g) || []).length, 1);
  const secondary = (featured.match(/class="featured-secondary-card enter"/g) || []).length;
  assert.ok(secondary >= 2 && secondary <= 3, `expected 2-3 secondary picks, got ${secondary}`);
  for (const row of rows) assert.match(featured, new RegExp(`/deal/${row.id}"`), "every featured pick has a detail link");
  assert.match(featured, /class="featured-title-link" href="\/deal\//);
  assert.match(featured, /class="portal-more" href="\/deal\/[^"]+">查看详情/);
  assert.match(featured, /style="--delay:0ms"/);
  assert.match(featured, /style="--delay:80ms"/);
});

test("the primary pick answers value, eligibility, region and deadline", () => {
  const rows = [
    strong("primary", {
      title: "Primary offer", valueText: "$50", valueTier: "money",
      conditions: "New users only", regions: "United Kingdom", endsAt: "2026-11-20",
    }),
    strong("second", { category: "vps", endsAt: "2026-11-21" }),
    strong("third", { category: "software", endsAt: "2026-11-22" }),
  ];
  const html = home(rows);
  const featured = between(html, "today-featured", "id=\"latest\"");
  const primary = featured.slice(featured.indexOf('<article class="featured-primary"'));
  assert.match(primary, /<dt>优惠力度<\/dt><dd class="portal-value">[\s\S]*?\$50[\s\S]*?<\/dd>/);
  assert.match(primary, /<dt>领取资格<\/dt><dd>New users only<\/dd>/);
  assert.match(primary, /<dt>适用地区<\/dt><dd>United Kingdom<\/dd>/);
  assert.match(primary, /<dt>截止时间<\/dt><dd>2026-11-20<\/dd>/);
});

test("thin evidence leaves the featured section empty instead of inventing a pick", () => {
  const rows = [deal("weak-one", { lastVerifiedAt: "2026-01-01T00:00:00Z" }), deal("weak-two", { lastVerifiedAt: "2026-01-01T00:00:00Z" })];
  const html = home(rows);
  const featured = between(html, "today-featured", "id=\"latest\"");
  assert.doesNotMatch(featured, /class="featured-primary"/);
  assert.doesNotMatch(featured, /featured-secondary-card/);
  assert.match(featured, /<p class="section-empty">/);
  assert.match(featured, /证据不足时留空/);
});

test("archived and expired records never enter the curated sections", () => {
  const rows = [
    strong("keep-me"),
    deal("zzz-archived", { status: "archived", valueText: "$50", valueTier: "money", conditions: "New users only", endsAt: "2026-11-20" }),
    strong("zzz-expired", { endsAt: "2026-11-01" }),
  ];
  const html = home(rows);
  assert.doesNotMatch(html, /zzz-archived/);
  assert.doesNotMatch(html, /zzz-expired/);
  const selection = selectFeatured(rows, now);
  assert.deepEqual(selection.secondary.map(row => row.id), []);
  assert.equal(selection.primary?.id, "keep-me");
});

test("selectFeatured is evidence-first, de-duplicated and empty-friendly", () => {
  const thin = deal("thin", { lastVerifiedAt: "2026-01-01T00:00:00Z" });
  assert.equal(evidenceStrength(thin, now), 0);
  assert.deepEqual(selectFeatured([thin], now), { primary: null, secondary: [] });
  assert.deepEqual(selectFeatured([], now), { primary: null, secondary: [] });

  const rows = [
    strong("low", { valueText: "free", valueTier: "qualitative", conditions: "", endsAt: null, category: "ai" }),
    strong("high", { category: "ai", steps: "1. Sign up\n2. Claim", rankScore: 100 }),
    strong("other", { category: "vps" }),
    strong("third", { category: "software" }),
    strong("expired", { endsAt: "2026-10-01" }),
    deal("draft", { status: "archived", valueText: "$50" }),
  ];
  const selection = selectFeatured(rows, now);
  assert.equal(selection.primary?.id, "high");
  assert.ok(selection.secondary.length >= 2 && selection.secondary.length <= 3);
  const ids = [selection.primary!.id, ...selection.secondary.map(row => row.id)];
  assert.equal(new Set(ids).size, ids.length, "no pick repeats");
  assert.ok(!ids.includes("expired") && !ids.includes("draft"));
});

test("featured keeps secondary picks in different categories when possible", () => {
  const rows = [
    strong("best", { category: "ai", steps: "1. Go\n2. Claim", rankScore: 500 }),
    strong("ai-two", { category: "ai", rankScore: 400 }),
    strong("cloud", { category: "vps" }),
    strong("software", { category: "software" }),
  ];
  const selection = selectFeatured(rows, now);
  const categories = selection.secondary.map(row => row.category);
  assert.equal(new Set(categories).size, categories.length, "secondary picks avoid repeating the same category");
});

/* -------------------------------------------------------------------------- */
/* Latest                                                                      */
/* -------------------------------------------------------------------------- */

test("latest lists at most six records ordered by publication or first-seen time", () => {
  const rows = Array.from({ length: 8 }, (_, index) => deal(String(index).padStart(2, "0"), {
    publishedAt: `2026-11-0${index + 1}T00:00:00Z`,
  }));
  const html = home(rows);
  const latest = between(html, "latest", "id=\"ending\"");
  assert.equal((latest.match(/class="portal-card"/g) || []).length, 6);
  const ids = [...latest.matchAll(/data-id="([^"]+)" data-category=/g)].map(match => match[1]);
  assert.deepEqual(ids, ["07", "06", "05", "04", "03", "02"]);
  assert.match(latest, /class="portal-value"/);
  assert.match(latest, /<time datetime="/);
});

test("latest falls back to first-seen time and stays empty without active records", () => {
  const rows = [deal("older", { firstSeenAt: "2026-11-01T00:00:00Z" }), deal("newer", { firstSeenAt: "2026-11-09T00:00:00Z" })];
  const latest = between(home(rows), "latest", "id=\"ending\"");
  const ids = [...latest.matchAll(/data-id="([^"]+)" data-category=/g)].map(match => match[1]);
  assert.deepEqual(ids, ["newer", "older"]);

  const empty = between(home([]), "latest", "id=\"ending\"");
  assert.match(empty, /<p class="section-empty">/);
  assert.equal((empty.match(/class="portal-card"/g) || []).length, 0);
});

/* -------------------------------------------------------------------------- */
/* Ending soon                                                                 */
/* -------------------------------------------------------------------------- */

test("ending lists at most four soon-ending records with deadline and countdown", () => {
  const rows = [
    deal("soon-today", { endsAt: "2026-11-10" }),
    deal("soon-tomorrow", { endsAt: "2026-11-11" }),
    deal("soon-3", { endsAt: "2026-11-15" }),
    deal("soon-4", { endsAt: "2026-11-16" }),
    deal("soon-5", { endsAt: "2026-11-17" }),
    deal("later", { endsAt: "2026-11-30" }),
  ];
  const html = home(rows);
  const ending = between(html, "ending", "id=\"for-you\"");
  assert.equal((ending.match(/class="ending-title"/g) || []).length, 4);
  assert.match(ending, /<ul class="ending-list">/);
  assert.match(ending, /2026-11-11/);
  assert.match(ending, /明天截止/);
  assert.match(ending, /今天截止/);
  assert.doesNotMatch(ending, /later/);
  assert.doesNotMatch(ending, /2026-11-30/);
});

test("ending stays empty when nothing has a calendar deadline", () => {
  const html = home([deal("no-deadline", { timeText: "for a limited time" })]);
  const ending = between(html, "ending", "id=\"for-you\"");
  assert.match(ending, /<p class="section-empty">/);
  assert.doesNotMatch(ending, /class="ending-list"/);
});

/* -------------------------------------------------------------------------- */
/* For you                                                                     */
/* -------------------------------------------------------------------------- */

test("for-you renders at most twelve filterable candidates with the preference data attributes", () => {
  const rows = Array.from({ length: 20 }, (_, index) => deal(`candidate-${index}`, {
    category: (["ai", "vps", "software", "bank", "crypto"] as const)[index % 5],
    regions: index % 4 === 0 ? "United Kingdom" : "",
    rankScore: 100 - index,
  }));
  const html = home(rows);
  const forYou = between(html, "for-you", "class=\"portal-footer\"");
  const cards = (forYou.match(/class="portal-card"/g) || []).length;
  assert.ok(cards > 0 && cards <= 12, `expected 1-12 candidates, got ${cards}`);
  assert.match(forYou, /data-id="[^"]+" data-category="[^"]+" data-regions="[^"]*" data-card="(?:yes|no|unknown|conflict)" data-renewal="(?:yes|no|unknown|conflict)" data-archived="(?:true|false)" data-starts="\d+"/);
  assert.match(forYou, /data-regions="gb"/);
  assert.match(forYou, /class="for-you-empty" hidden/);
  assert.match(forYou, /href="\/deals#preferences">去设置偏好/);
});

test("for-you keeps one candidate per category before filling the strongest extras", () => {
  const categories = ["ai", "vps", "software", "bank", "crypto", "ucard", "other"] as const;
  const rows = [
    ...categories.map((category, index) => deal(`seed-${category}`, { category, rankScore: 500 - index })),
    ...Array.from({ length: 6 }, (_, index) => deal(`extra-ai-${index}`, { category: "ai", rankScore: 400 - index })),
    ...Array.from({ length: 6 }, (_, index) => deal(`extra-vps-${index}`, { category: "vps", rankScore: 300 - index })),
    ...Array.from({ length: 6 }, (_, index) => deal(`extra-software-${index}`, { category: "software", rankScore: 200 - index })),
  ];
  const forYou = between(home(rows), "for-you", "class=\"portal-footer\"");
  const picked = [...forYou.matchAll(/data-id="([^"]+)" data-category="([^"]+)"/g)].map(match => ({ id: match[1], category: match[2] }));
  assert.equal(picked.length, 12);
  const seen = new Set(picked.map(entry => entry.category));
  for (const category of categories) assert.ok(seen.has(category), `missing category candidate ${category}`);
  const counts = new Map<string, number>();
  for (const entry of picked) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  assert.ok(Math.max(...counts.values()) <= 3, "no category may take more than three slots");
});

/* -------------------------------------------------------------------------- */
/* Client behaviours + safety                                                  */
/* -------------------------------------------------------------------------- */

test("the home script wires saved bookmarks and explains they stay on this browser", () => {
  assert.match(HOME_SCRIPT, /'dh-saved'/);
  assert.match(HOME_SCRIPT, /aria-pressed/);
  assert.match(HOME_SCRIPT, /已收藏 · 仅此浏览器/);
  assert.match(HOME_SCRIPT, /\.bookmark\[data-id\]/);
  assert.match(HOME_SCRIPT, /#toast/);
});

test("the home script filters for-you candidates with the radar preference shape", () => {
  assert.match(HOME_SCRIPT, /'dh-preferences'/);
  assert.match(HOME_SCRIPT, /preferences\.region/);
  assert.match(HOME_SCRIPT, /preferences\.category/);
  assert.match(HOME_SCRIPT, /preferences\.noCard/);
  assert.match(HOME_SCRIPT, /preferences\.noRenewal/);
  assert.match(HOME_SCRIPT, /\.for-you-empty/);
  assert.match(HOME_SCRIPT, /regionLabels/);
  assert.match(HOME_SCRIPT, /适用/);
});

test("legacy dashboard anchors are forwarded to /deals from the homepage script", () => {
  for (const hash of ["#sec-a", "#sec-b", "#sec-c", "#sec-d", "#sec-e", "#sec-f", "#sec-g", "#sec-h", "#sources", "#alerts", "#preferences"]) {
    assert.ok(HOME_SCRIPT.includes(`'${hash}'`), `missing legacy hash ${hash}`);
  }
  assert.match(HOME_SCRIPT, /location\.pathname === '\/'/);
  assert.match(HOME_SCRIPT, /location\.replace\('\/deals' \+ location\.search \+ location\.hash\)/);
});

test("hostile titles, summaries and URLs are escaped on the homepage", () => {
  const rows = [deal('bad" onmouseover="alert(1)', {
    title: "<script>alert(1)</script>",
    summary: "Free trial <img src=x onerror=alert(1)> javascript:alert(1)",
    zhTitle: '<img src=x onerror="alert(1)">',
    zhSummary: '免费试用 <svg onload="alert(1)">',
    officialUrl: "javascript:alert(1)",
    sourceUrl: "data:text/html,bad",
  })];
  const html = home(rows);
  assert.doesNotMatch(html, /href="(?:javascript:|data:)/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<svg onload=/);
  assert.match(html, /data-id="bad&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&lt;svg onload=/);
});

test("internal detail links are stable and shareable, external links are sanitized", () => {
  const html = home([strong("share-me", { sourceUrl: "https://example.com/feed?utm_source=x&ref=invite" })]);
  assert.match(html, /href="\/deal\/share-me"/);
  assert.match(html, /href="https:\/\/example\.com\/feed"/);
  assert.doesNotMatch(html, /utm_source|ref=invite/);
});

test("the footer points to the channels, the archive and the source log", () => {
  const html = home([strong("one")]);
  const footer = html.slice(html.indexOf('class="portal-footer"'));
  for (const href of ["/deals", "/ai-tools", "/cloud", "/deals?view=archived", "/deals#sources", "/deals#alerts"]) {
    assert.ok(footer.includes(`href="${href}"`), `missing footer link ${href}`);
  }
});

test("english renders switch the document language and keep the original excerpt", () => {
  const rows = [deal("en-one", { summary: "Free trial for students", zhSummary: "面向学生的免费试用" })];
  const zh = renderHome({ deals: rows, now, lang: "zh" });
  const en = renderHome({ deals: rows, now, lang: "en" });
  assert.match(zh, /data-lang="zh"/);
  assert.match(en, /data-lang="en"/);
  assert.match(en, /Free trial for students/);
  assert.match(zh, /面向学生的免费试用/);
});
