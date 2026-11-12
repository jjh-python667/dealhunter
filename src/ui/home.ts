import type { DealRecord } from "../types";
import type { RunRecord } from "../types";
import { NAV_CSS, renderNav } from "./nav";
import { PAGE_CSS } from "./styles";

export type HomeInput = {
  deals: DealRecord[];
  now: Date;
  lang?: "zh" | "en";
  run?: RunRecord | null;
  error?: string;
  preview?: boolean;
};

/**
 * Portal homepage. Placeholder while the homepage work lands: it keeps the route
 * honest (navigation + real counts) but does not invent curated sections.
 */
export function renderHome(input: HomeInput): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const active = input.deals.filter(deal => deal.status === "active").length;
  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}" data-snapshot-at="${input.now.getTime()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="description" content="全球羊毛情报中心：发现公开来源中的 AI 工具、云服务与数字优惠。"><title>全球羊毛情报中心 · GLOBAL DEAL HUNTER</title><style>${PAGE_CSS}${NAV_CSS}</style></head>
<body>${renderNav({ active: "home", lang })}
<main class="workspace" id="main" style="max-width:1180px;margin:0 auto;padding:36px">
  <p class="eyebrow">GLOBAL DEAL HUNTER</p>
  <h1>全球羊毛情报中心</h1>
  <p class="hero-description">正在整理今日精选，稍后回来看看。</p>
  <p class="collection-status">目前有 ${active} 条在册优惠。<a href="/deals">先浏览全部情报</a></p>
  ${input.error ? '<p class="error-banner" role="alert">首页暂时无法载入，请稍后刷新重试。</p>' : ""}
</main></body></html>`;
}

export const HOME_CSS = String.raw``;
