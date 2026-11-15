import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildBoard } from "../src/board";
import { chineseCopy } from "../src/content/locale";
import { protectProperNouns } from "../src/content/glossary";
import { ZH_GUIDES } from "../src/content/zh-guides";
import { renderPage, uniqueDeals } from "../src/page";
import type { Board, DealRecord } from "../src/types";
import { renderDealDetail } from "../src/ui/detail";
import { renderHome } from "../src/ui/home";

const snapshot = JSON.parse(readFileSync("preview/snapshot.json", "utf8")) as { board: Board; generatedAt: string };
const rows = uniqueDeals(snapshot.board);
const azure = rows.find(row => row.sourceId === "azure-account")!;

test("every record in the supplied snapshot has a Chinese title, summary and introduction", () => {
  assert.equal(rows.length, 28);
  for (const row of rows) {
    const copy = chineseCopy(row);
    assert.match(copy.title, /[\u3400-\u9fff]/, row.sourceId);
    assert.match(copy.summary, /[\u3400-\u9fff]/, row.sourceId);
    assert.match(copy.intro, /[\u3400-\u9fff]/, row.sourceId);
    assert.equal(copy.edited, true);
    assert.equal(copy.machine, false);
  }
});

test("Chinese display never mutates the source records", () => {
  const original = JSON.stringify(azure);
  const copy = chineseCopy(azure);
  assert.notEqual(copy.title, azure.title);
  assert.equal(JSON.stringify(azure), original);
  assert.equal(copy.field(azure.conditions), copy.summary);
});

test("changed title or summary immediately invalidates the old edited translation", () => {
  for (const changed of [{...azure,title:azure.title+" Updated"},{...azure,summary:azure.summary+" Revised"}]) {
    const copy = chineseCopy(changed);
    assert.equal(copy.edited, false);
    assert.equal(copy.title, "");
    assert.equal(copy.summary, "");
  }
});

test("stored translations apply only when no edited guide matches", () => {
  const guided = chineseCopy({ ...azure, zhTitle: "后台提供的中文标题", zhSummary: "后台提供的中文摘要" });
  assert.equal(guided.title, "微软 Azure 免费账户与按量付费方案");
  assert.equal(guided.summary, "部分服务对所有 Azure 客户长期免费，另有部分服务仅向新客户免费提供 12 个月。");
  assert.equal(guided.edited, true);
  assert.equal(guided.machine, false);

  const missed = chineseCopy({
    ...azure,
    title: `${azure.title} x`,
    zhTitle: "后台提供的中文标题",
    zhSummary: "后台提供的中文摘要",
  });
  assert.equal(missed.edited, false);
  assert.equal(missed.machine, true);
  assert.equal(missed.title, "后台提供的中文标题");
  assert.equal(missed.summary, "后台提供的中文摘要");
});

test("a matching guide outranks a bad stored translation for Railway, Monzo, Gemini, and Starling", () => {
  const now = new Date("2026-11-15T07:15:00Z");
  for (const [sourceId, badTitle] of [
    ["railway-pricing", "铁路价格"],
    ["monzo-account", "现行账户 找到合适的现行账户"],
    ["vercel-changelog", "双胞胎4碳现在在AI Gateway上可用"],
    ["starling-home", "斯大林获奖的银行账户"],
    ["anthropic-news", "新闻室 - 人类"],
  ] as const) {
    const guide = ZH_GUIDES.find((item) => item.sourceId === sourceId && (sourceId !== "vercel-changelog" || item.sourceTitle.includes("Gemini 4 Carbon")));
    assert.ok(guide, sourceId);
    const row = {
      ...azure,
      id: sourceId,
      sourceId: guide.sourceId,
      sourceName: guide.sourceId,
      title: guide.sourceTitle,
      summary: guide.sourceSummary,
      zhTitle: badTitle,
      zhSummary: "坏的机器摘要",
      status: "active" as const,
      endsAt: null,
    };
    const copy = chineseCopy(row);
    assert.equal(copy.title, guide.titleZh, sourceId);
    assert.equal(copy.summary, guide.summaryZh, sourceId);
    assert.equal(copy.intro, guide.introZh, sourceId);
    assert.equal(copy.edited, true, sourceId);
    assert.equal(copy.machine, false, sourceId);
    assert.doesNotMatch(copy.title, /铁路价格|斯大林|双胞胎4碳|新闻室 - 人类|现行账户 找到合适的现行账户/);

    const home = renderHome({ deals: [row], now, lang: "zh" });
    const detail = renderDealDetail({ deal: row, now, lang: "zh" });
    assert.match(home, new RegExp(guide.titleZh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(detail, new RegExp(guide.titleZh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(home, new RegExp(badTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(detail, new RegExp(badTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("glossary fixes observed mistranslations only when the source names the term", () => {
  const samples: Array<[string, string, RegExp, RegExp]> = [
    ["Newsroom \\ Anthropic and a note", "新闻室 - 人类", /人类/, /Anthropic/],
    ["Pricing | Railway", "铁路价格", /铁路/, /Railway/],
    ["Starling | Award-winning bank accounts", "斯大林获奖的银行账户", /斯大林/, /Starling/],
    ["Pricing · Cloudflare Workers docs", "Cloudflare 工人文件", /工人/, /Cloudflare Workers/],
    ["Gemini 4 Carbon now available", "双胞胎4碳现在在AI Gateway上可用", /双胞胎/, /Gemini 4 Carbon/],
    ["Pricing | Railway until 2026-11-30 for $5", "截止 2026 年 11 月 30 日的铁路价格 $5", /铁路/, /2026 年 11 月 30 日/],
  ];
  for (const [source, chinese, absent, present] of samples) {
    const fixed = protectProperNouns(chinese, source);
    assert.doesNotMatch(fixed, absent, chinese);
    assert.match(fixed, present, chinese);
  }
  const row: DealRecord = {
    ...azure,
    sourceId: "not-a-guide",
    title: "Pricing | Railway",
    summary: "Start with a trial",
    zhTitle: "铁路价格",
    zhSummary: "铁路试用",
  };
  const copy = chineseCopy(row);
  assert.equal(copy.edited, false);
  assert.equal(copy.machine, true);
  assert.equal(copy.title, "Railway价格");
  assert.doesNotMatch(copy.summary, /铁路/);
  assert.match(copy.summary, /Railway/);
});

test("unknown metadata is not guessed and an explicit deadline is not called missing", () => {
  assert.equal(chineseCopy(azure).field(""),undefined);
  assert.equal(chineseCopy(azure).field("New eligibility requirement"),undefined);
  const vercel = rows.find(row=>row.sourceId==="vercel-changelog")!;
  const now=new Date(snapshot.generatedAt);
  const html=renderPage({board:buildBoard([vercel],now),deals:[vercel],checks:[],run:null,now,expand:false});
  assert.doesNotMatch(html,/未给出日历截止日/);
  assert.match(html,/本站中文整理/);
  assert.doesNotMatch(html,/class="mt t-zh"[^>]*>机器翻译/);
});
