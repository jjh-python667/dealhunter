import assert from "node:assert/strict";
import test from "node:test";
import { buildBoard } from "../src/board";
import worker from "../src/index";
import { renderPage } from "../src/page";
import { FAVICON_SVG, robotsTxt, sitemapXml } from "../src/seo";
import type { DealRecord } from "../src/types";
import { renderDealDetail } from "../src/ui/detail";
import { renderHome } from "../src/ui/home";

const now = new Date("2026-11-10T03:00:00Z");
const origin = "https://dealhunter.example";

function deal(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {
    id, title: `Offer ${id}`, summary: "Free trial for students", category: "ai",
    valueText: "", valueAmount: null, valueCurrency: null, valueTier: "unverified",
    conditions: "", regions: "", startsAt: null, endsAt: null, timeText: "", steps: "",
    officialUrl: "https://example.com/offer", sourceUrl: "https://example.com/feed", sourceName: "Example",
    sourceId: "example", lastVerifiedAt: now.toISOString(), riskNote: "", dealType: "free",
    status: "active", publishedAt: now.toISOString(), rankScore: 1, firstSeenAt: now.toISOString(),
    updatedAt: now.toISOString(), archiveReason: "", ...extra,
  };
}

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
    archive_reason: entry.archiveReason,
  };
}

class ListingDb {
  constructor(private deals: DealRecord[], private fail = false) {}
  prepare(sql: string) {
    const db = this;
    return {
      bind() { return this; },
      async all() {
        if (db.fail) throw new Error("D1 down");
        if (sql.includes("FROM deals") && sql.includes("ORDER BY COALESCE")) {
          return { results: db.deals.map(rowOf) };
        }
        return { results: [] };
      },
      async first() { return null; },
      async run() { return { success: true }; },
    };
  }
}

function fetchPath(path: string, db: ListingDb = new ListingDb([deal("ai-deal-1"), deal("cloud-deal-1", { category: "vps" })])): Promise<Response> {
  return worker.fetch!(new Request(`${origin}${path}`), { DB: db } as unknown as Env);
}

test("homepage and channel HTML publish a lang-free canonical and Open Graph title", () => {
  const home = renderHome({ deals: [deal("one", { category: "software" })], now, origin });
  assert.match(home, /<link rel="canonical" href="https:\/\/dealhunter\.example\/">/);
  assert.match(home, /<meta property="og:type" content="website">/);
  assert.match(home, /<meta property="og:title" content="全球羊毛情报中心 · GLOBAL DEAL HUNTER">/);
  assert.match(home, /<meta property="og:locale" content="zh_CN">/);
  assert.match(home, /<meta name="twitter:card" content="summary">/);
  assert.match(home, /<link rel="alternate" hreflang="en" href="https:\/\/dealhunter\.example\/\?lang=en">/);
  assert.match(home, /<link rel="icon" href="\/favicon\.svg">/);
  assert.doesNotMatch(home, /<link rel="canonical" href="[^"]*\?/);
  assert.doesNotMatch(home, /og:image/);

  const channel = renderPage({
    board: buildBoard([deal("ai-1")], now),
    deals: [deal("ai-1")],
    checks: [],
    run: null,
    now,
    expand: false,
    lang: "en",
    origin,
    channel: "ai",
  });
  assert.match(channel, /<link rel="canonical" href="https:\/\/dealhunter\.example\/ai-tools">/);
  assert.match(channel, /<meta property="og:title" content="AI tool deals · GLOBAL DEAL HUNTER">/);
  assert.match(channel, /<meta property="og:locale" content="en_US">/);
  assert.match(channel, /<meta name="twitter:card" content="summary">/);
  assert.match(channel, /hreflang="zh-CN" href="https:\/\/dealhunter\.example\/ai-tools"/);
  assert.doesNotMatch(channel, /og:image/);
});

test("detail JSON-LD quotes only stored fields and keeps twitter card plus locale", () => {
  const bare = renderDealDetail({ deal: deal("plain", { category: "software", valueAmount: null }), now, origin });
  assert.match(bare, /"@type":"Article"/);
  assert.match(bare, /"headline":"Offer plain"/);
  assert.doesNotMatch(bare, /"price"/);

  const priced = renderDealDetail({
    deal: deal("priced", { category: "software", valueAmount: 50, valueCurrency: "USD", endsAt: "2026-12-31" }),
    now,
    origin,
    lang: "en",
  });
  assert.match(priced, /<meta property="og:locale" content="en_US">/);
  assert.match(priced, /<meta name="twitter:card" content="summary">/);
  assert.match(priced, /"price":50/);
  assert.match(priced, /"priceCurrency":"USD"/);
  assert.match(priced, /"priceValidUntil":"2026-12-31"/);
  assert.doesNotMatch(priced, /<script>alert/);
});

test("robots.txt names the user agent and this origin's sitemap", () => {
  const body = robotsTxt(origin);
  assert.match(body, /^User-agent: \*$/m);
  assert.match(body, /^Allow: \/$/m);
  assert.match(body, /^Sitemap: https:\/\/dealhunter\.example\/sitemap\.xml$/m);
});

test("sitemap lists the public routes and skips archived deals", () => {
  const xml = sitemapXml(origin, [
    deal("live"),
    deal("gone", { status: "archived" }),
  ]);
  for (const path of ["/", "/deals", "/ai-tools", "/cloud", "/deal/live"]) {
    assert.match(xml, new RegExp(`<loc>https://dealhunter\\.example${path === "/" ? "/" : path}</loc>`));
  }
  assert.doesNotMatch(xml, /\/deal\/gone/);
  assert.doesNotMatch(xml, /没有找到这条优惠/);
  assert.match(FAVICON_SVG, /<svg/);
  assert.doesNotMatch(FAVICON_SVG, /<html|没有找到这条优惠/);
});

test("robots, sitemap, and favicon are readable assets, not the HTML 404", async () => {
  const robots = await fetchPath("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type") ?? "", /^text\/plain/);
  assert.match(robots.headers.get("cache-control") ?? "", /public, max-age=/);
  const robotsBody = await robots.text();
  assert.match(robotsBody, /User-agent: \*/);
  assert.match(robotsBody, /Sitemap: https:\/\/dealhunter\.example\/sitemap\.xml/);
  assert.doesNotMatch(robotsBody, /没有找到这条优惠/);

  const sitemap = await fetchPath("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type") ?? "", /^application\/xml/);
  const xml = await sitemap.text();
  for (const path of ["https://dealhunter.example/", "https://dealhunter.example/deals", "https://dealhunter.example/ai-tools", "https://dealhunter.example/cloud", "https://dealhunter.example/deal/ai-deal-1"]) {
    assert.ok(xml.includes(`<loc>${path}</loc>`), path);
  }
  assert.doesNotMatch(xml, /没有找到这条优惠/);

  const archived = await fetchPath("/sitemap.xml", new ListingDb([
    deal("live-id"),
    deal("archived-id", { status: "archived" }),
  ]));
  const archivedXml = await archived.text();
  assert.match(archivedXml, /\/deal\/live-id</);
  assert.doesNotMatch(archivedXml, /archived-id/);

  const icon = await fetchPath("/favicon.svg");
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type") ?? "", /^image\/svg\+xml/);
  const svg = await icon.text();
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /<html|没有找到这条优惠/);

  const ico = await fetchPath("/favicon.ico");
  assert.equal(ico.status, 302);
  assert.equal(ico.headers.get("location"), "/favicon.svg");

  const home = await fetchPath("/");
  assert.match(home.headers.get("cache-control") ?? "", /no-store/);
  assert.match(home.headers.get("content-security-policy") ?? "", /img-src 'none'/);
});

test("a sitemap database failure stays a legal sitemap and not an HTML 404", async () => {
  const response = await fetchPath("/sitemap.xml", new ListingDb([], true));
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /^application\/xml/);
  const xml = await response.text();
  assert.match(xml, /<urlset/);
  assert.match(xml, /<loc>https:\/\/dealhunter\.example\/deals<\/loc>/);
  assert.doesNotMatch(xml, /没有找到这条优惠|<html/);
});
