import assert from "node:assert/strict";
import test from "node:test";
import { formatWhen } from "../src/extract";
import { renderDealDetail, type DetailInput } from "../src/ui/detail";
import { DETAIL_CSS } from "../src/ui/detail-styles";
import type { DealRecord } from "../src/types";

const now = new Date("2026-11-10T03:00:00Z");

function deal(id: string, extra: Partial<DealRecord> = {}): DealRecord {
  return {
    id,
    title: `Offer ${id}`,
    summary: "Free for everyone, no credit card required. Does not automatically renew.",
    category: "software",
    valueText: "",
    valueAmount: null,
    valueCurrency: null,
    valueTier: "unverified",
    conditions: "",
    regions: "",
    startsAt: null,
    endsAt: null,
    timeText: "",
    steps: "",
    officialUrl: "https://example.com/offer",
    sourceUrl: "https://example.com/feed",
    sourceName: "Example",
    sourceId: "example",
    lastVerifiedAt: now.toISOString(),
    riskNote: "",
    dealType: "unverified",
    status: "active",
    publishedAt: null,
    rankScore: 0,
    firstSeenAt: now.toISOString(),
    updatedAt: now.toISOString(),
    archiveReason: "",
    ...extra,
  };
}

function detail(row: DealRecord, extra: Partial<DetailInput> = {}): string {
  return renderDealDetail({ deal: row, now, ...extra });
}

test("the first screen answers value, eligibility, deadline and official entry", () => {
  const html = detail(deal("hero", {
    valueText: "free",
    conditions: "New customers only",
    regions: "United States",
    endsAt: "2026-12-31",
  }));
  assert.match(html, /<main class="detail-page" id="main">/);
  assert.match(html, /data-active="detail"/);
  for (const label of ["优惠力度", "领取资格", "截止时间", "官方入口"]) {
    assert.match(html, new RegExp(label), label);
  }
  // 优惠力度 + 中文对照
  assert.match(html, /<dd class="detail-value"><span class="t-en" lang="en">free<\/span><span class="t-zh" lang="zh-CN">免费<\/span><\/dd>/);
  // 领取资格与地区
  assert.match(html, /New customers only/);
  assert.match(html, /United States/);
  // 截止时间
  assert.match(html, /<dd class="detail-deadline">2026-12-31<\/dd>/);
  // 官方入口
  assert.match(html, /<a class="official-cta" href="https:\/\/example\.com\/offer" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /前往官方领取/);
  // 状态、分类、类型、来源
  assert.match(html, /<span class="deal-status" data-status="active">进行中<\/span>/);
  assert.match(html, /软件与数字服务/);
  assert.match(html, /来源 · Example/);
  // 面包屑：其它类别回全部情报
  assert.match(html, /<nav class="breadcrumb" aria-label="面包屑"><a href="\/">首页<\/a>.*<a href="\/deals">全部情报<\/a>.*<span aria-current="page">优惠详情<\/span><\/nav>/);
});

test("AI and cloud categories breadcrumb into their own channel pages", () => {
  const ai = detail(deal("ai", { category: "ai" }));
  assert.match(ai, /<a href="\/ai-tools">AI 工具<\/a>/);
  const cloud = detail(deal("cloud", { category: "vps" }));
  assert.match(cloud, /<a href="\/cloud">云服务<\/a>/);
});

test("official links are sanitized to canonical https and open in a safe new window", () => {
  const html = detail(deal("link", {
    officialUrl: "https://Example.COM/offer/?utm_source=feed&id=42#frag",
  }));
  assert.match(html, /href="https:\/\/example\.com\/offer\?id=42" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /utm_source/);
  // 官方链接也出现在原文证据区
  assert.match(html, /<dt>官方链接<\/dt><dd><a class="official-link" href="https:\/\/example\.com\/offer\?id=42" target="_blank" rel="noopener noreferrer"/);
});

test("a missing or unsafe official link stays 待核实 instead of inventing an entry", () => {
  for (const url of ["", "javascript:alert(1)", "data:text/html,bad", "https://bit.ly/tracked"]) {
    const html = detail(deal("nolink", { officialUrl: url }));
    assert.doesNotMatch(html, /href="(?:javascript:|data:)/, url);
    assert.match(html, /<span class="official-cta official-disabled">官方入口待核实<\/span>/, url);
    assert.match(html, /本站不补造入口/, url);
  }
});

test("ended deals still render in full and say so before the reader clicks", () => {
  const html = detail(deal("ended", {
    endsAt: "2026-11-01",
    summary: "Free trial ends soon.",
    steps: "1. Visit the page\n2. Sign up",
  }));
  assert.match(html, /<span class="deal-status" data-status="ended">已结束<\/span>/);
  assert.match(html, /<span class="deadline-state">已结束<\/span>/);
  assert.match(html, /<aside class="archive-banner"><strong>这条优惠已结束<\/strong><p>活动已结束，保留记录供查阅<\/p>/);
  assert.match(html, /活动已结束，入口可能失效/);
  // 页面仍可读：官方入口、费用、步骤、原文证据都还在
  assert.match(html, /href="https:\/\/example\.com\/offer"/);
  assert.match(html, /id="costs"/);
  assert.match(html, /id="steps"/);
  assert.match(html, /id="evidence"/);
});

test("archived deals keep their archive reason and stay readable", () => {
  const html = detail(deal("archived", {
    status: "archived",
    endsAt: "2026-12-31",
    archiveReason: "官方活动页已下线，记录保留备查。",
  }));
  assert.match(html, /<span class="deal-status" data-status="archived">已归档<\/span>/);
  assert.match(html, /<strong>这条优惠已归档<\/strong>/);
  assert.match(html, /官方活动页已下线，记录保留备查。/);
  assert.match(html, /活动已结束，入口可能失效/);
  assert.match(html, /id="costs"/);
  assert.match(html, /id="evidence"/);
});

test("archive banner falls back to the standard wording when no reason is stored", () => {
  const html = detail(deal("archived-empty", { status: "archived", archiveReason: "" }));
  assert.match(html, /活动已结束，保留记录供查阅/);
  assert.doesNotMatch(html, /undefined/);
});

test("fees, renewal, trial follow-up and their original quotes all appear in #costs", () => {
  const row = deal("costs", {
    summary: "Available worldwide. No credit card required. Does not automatically renew. After the trial ends $9.99 per month.",
    endsAt: "2026-12-31",
  });
  const html = detail(row);
  assert.match(html, /id="costs"/);
  assert.match(html, /<dt>是否需要绑卡或付款方式<\/dt><dd>无需绑卡<small class="evidence-quote">No credit card required<\/small><\/dd>/);
  assert.match(html, /<dt>是否自动续费或转付费<\/dt><dd>无自动续费<small class="evidence-quote">Does not automatically renew<\/small><\/dd>/);
  assert.match(html, /<dt>试用后价格或计费（原文）<\/dt><dd>After the trial ends \$9\.99 per month<\/dd>/);
});

test("costs without source evidence stay 待核实", () => {
  const html = detail(deal("unknown-costs", { summary: "A launch announcement without commercial terms." }));
  assert.match(html, /<dt>是否需要绑卡或付款方式<\/dt><dd>待核实<\/dd>/);
  assert.match(html, /<dt>是否自动续费或转付费<\/dt><dd>待核实<\/dd>/);
  assert.match(html, /<dt>试用后价格或计费（原文）<\/dt><dd>待核实<\/dd>/);
});

test("source steps keep their line breaks; missing steps are not invented", () => {
  const withSteps = detail(deal("steps", { steps: "1. Visit the page\n2. Sign up\n3. Claim the credit" }));
  assert.match(withSteps, /<div class="steps-text">1\. Visit the page\n2\. Sign up\n3\. Claim the credit<\/div>/);
  assert.match(withSteps, /以上为来源原文步骤，本站未改写/);

  const withoutSteps = detail(deal("no-steps", { steps: "" }));
  assert.match(withoutSteps, /<p class="pending-block">待核实<\/p>/);
  assert.match(withoutSteps, /来源没有给出领取步骤，本站不补造/);
});

test("the evidence section carries excerpt, source, timestamps, official link and risk note", () => {
  const row = deal("evidence", {
    summary: "Free trial for students. Ends on 2026-12-31.",
    publishedAt: "2026-11-01T00:00:00Z",
    lastVerifiedAt: "2026-11-09T12:00:00Z",
    riskNote: "金融类优惠请先核对官方域名与地区资格。",
  });
  const html = detail(row);
  assert.match(html, /id="evidence"/);
  assert.match(html, /<blockquote class="source-excerpt"><p>Free trial for students\. Ends on 2026-12-31\.<\/p><\/blockquote>/);
  assert.match(html, /<dt>来源<\/dt><dd><a class="source-link" href="https:\/\/example\.com\/feed" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, new RegExp(`<dt>来源发布时间</dt><dd>${formatWhen(row.publishedAt)}</dd>`));
  assert.match(html, new RegExp(`<dt>本站首次收录</dt><dd>${formatWhen(row.firstSeenAt)}</dd>`));
  assert.match(html, new RegExp(`<dt>最后来源核验</dt><dd>${formatWhen(row.lastVerifiedAt)}</dd>`));
  assert.match(html, /<dt>官方链接<\/dt><dd><a class="official-link"/);
  assert.match(html, /<dt>风险提示<\/dt><dd class="risk-inline">金融类优惠请先核对官方域名与地区资格。<\/dd>/);
});

test("missing fields are reported as 待核实 instead of being filled in", () => {
  const html = detail(deal("bare", {
    summary: "",
    valueText: "",
    conditions: "",
    regions: "",
    endsAt: null,
    timeText: "",
    steps: "",
    officialUrl: "",
    publishedAt: null,
    riskNote: "",
  }));
  assert.match(html, /<dd class="detail-value">待核实<\/dd>/);
  assert.match(html, /<dd class="detail-deadline">待核实<\/dd>/);
  assert.match(html, /<blockquote class="source-excerpt"><p>待核实<\/p><\/blockquote>/);
  assert.match(html, /<dt>来源发布时间<\/dt><dd>待核实<\/dd>/);
  assert.match(html, /官方入口待核实/);
  assert.match(html, /来源没有给出领取步骤/);
  assert.equal((html.match(/待核实/g) || []).length >= 6, true);
});

test("hostile content is escaped and never becomes executable markup", () => {
  const html = detail(deal('bad" onmouseover="alert(1)', {
    title: "<script>alert(1)</script>",
    summary: '<img src=x onerror="alert(1)">',
    steps: '1. <b onmouseover="alert(2)">click</b>\n2. done',
    sourceName: "<svg onload=alert(3)>",
    archiveReason: "<script>alert(4)</script>",
    riskNote: "<script>alert(5)</script>",
    officialUrl: "javascript:alert(6)",
    sourceUrl: "data:text/html,bad",
    status: "archived",
  }));
  assert.doesNotMatch(html, /href="(?:javascript:|data:)/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<svg onload/);
  assert.doesNotMatch(html, /<script>alert\([1-9]\)/);
  // 每个真实标签的属性值抹掉后再查内联事件处理器；转义后的文本里出现 on* 字样是安全的。
  for (const tag of html.match(/<[^>]+>/g) ?? []) {
    assert.doesNotMatch(tag.replace(/="[^"]*"/g, '=""'), /\son[a-z]+\s*=/i, tag.slice(0, 120));
  }
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.match(html, /&lt;b onmouseover=&quot;alert\(2\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /data-id="bad&quot; onmouseover=&quot;alert\(1\)"/);
});

test("canonical and Open Graph point at the shareable detail URL", () => {
  const html = detail(deal("og-1", { title: "OG Deal", zhTitle: "OG 优惠", zhSummary: "人人免费" }), {
    origin: "https://dealhunter.example",
  });
  assert.match(html, /<link rel="canonical" href="https:\/\/dealhunter\.example\/deal\/og-1">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta property="og:title" content="OG 优惠 · GLOBAL DEAL HUNTER">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/dealhunter\.example\/deal\/og-1">/);
  assert.match(html, /<meta property="og:description" content="人人免费">/);
  assert.match(html, /<title>OG 优惠 · GLOBAL DEAL HUNTER<\/title>/);
});

test("canonical falls back to the detail path and strips trailing origin slashes", () => {
  assert.match(detail(deal("rel")), /<link rel="canonical" href="\/deal\/rel">/);
  assert.match(
    detail(deal("slash"), { origin: "https://dealhunter.example/" }),
    /<link rel="canonical" href="https:\/\/dealhunter\.example\/deal\/slash">/,
  );
  assert.match(
    detail(deal("a b"), { origin: "https://dealhunter.example" }),
    /<link rel="canonical" href="https:\/\/dealhunter\.example\/deal\/a%20b">/,
  );
});

test("bookmark and share controls use the site-wide key, clipboard and a toast", () => {
  const html = detail(deal("save-me"));
  assert.match(html, /<button class="detail-action bookmark" type="button" data-id="save-me" aria-pressed="false" aria-label="收藏这条情报" title="收藏到此浏览器">/);
  assert.match(html, /<button class="detail-action share" type="button" data-share/);
  assert.match(html, /<div class="toast" id="toast" role="status" aria-live="polite"><\/div>/);
  const script = html.slice(html.lastIndexOf("<script>"));
  assert.match(script, /var KEY = "dh-saved"/);
  assert.match(script, /localStorage\.getItem\(KEY\)/);
  assert.match(script, /localStorage\.setItem\(KEY, JSON\.stringify\(ids\)\)/);
  assert.match(script, /navigator\.clipboard\.writeText/);
  assert.match(script, /location\.href/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /toast/);
});

test("sections keep the fixed costs → steps → evidence order and embed the design system in order", () => {
  const html = detail(deal("order"));
  const costs = html.indexOf('id="costs"');
  const steps = html.indexOf('id="steps"');
  const evidence = html.indexOf('id="evidence"');
  assert.equal(costs > 0 && steps > costs && evidence > steps, true);
  assert.equal(html.indexOf('class="detail-vitals"') < costs, true);
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  assert.equal(style.indexOf(".topnav{") < style.indexOf(".detail-page{"), true);
  assert.match(style, /--gold:#e9bd76/);
});

test("DETAIL_CSS is mobile-safe, reduced-motion aware and dependency-free", () => {
  assert.match(DETAIL_CSS, /@media\(max-width:600px\)/);
  assert.match(DETAIL_CSS, /@media\(max-width:380px\)/);
  assert.match(DETAIL_CSS, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(DETAIL_CSS, /\.detail-vitals\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(DETAIL_CSS, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(DETAIL_CSS, /overflow-wrap:anywhere/);
  assert.doesNotMatch(DETAIL_CSS, /@import|url\(|https?:\/\//);
});

test("preview and language switches keep the page honest", () => {
  const html = detail(deal("preview"), { preview: true, lang: "en" });
  assert.match(html, /本机预览 · 线上数据快照/);
  assert.match(html, /<html lang="zh-CN" data-lang="en">/);
  assert.match(html, /data-set-lang-server="zh"/);
  assert.doesNotMatch(html, /undefined/);
});

test("claim-status feedback copy follows the page language", () => {
  const zh = detail(deal("feedback-language"), { lang: "zh" });
  const en = detail(deal("feedback-language"), {
    lang: "en",
    feedback: { works: 3, expired: 0, unknown: 0, total: 3, lastAt: null, worksBrowsers: 3, worksNetworks: 2, expiredNetworks: 0, display: "positive" },
  });
  assert.match(zh, /领取状态反馈/);
  assert.match(zh, /还能领/);
  assert.match(zh, /提交反馈/);
  assert.doesNotMatch(zh, /Claim status feedback/);

  assert.match(en, /Claim status feedback/);
  assert.match(en, /Still claimable/);
  assert.match(en, /Expired/);
  assert.match(en, /Not sure/);
  assert.match(en, /Submit feedback/);
  assert.match(en, /One vote per offer version/);
  assert.match(en, /Visitors reported this offer as claimable/);
  assert.match(en, /Eligibility varies by region and account/);
  assert.doesNotMatch(en, /领取状态反馈/);
});
