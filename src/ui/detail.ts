import type { DealRecord } from "../types";
import { NAV_CSS, renderNav } from "./nav";
import { PAGE_CSS } from "./styles";

export type DetailInput = {
  deal: DealRecord;
  now: Date;
  lang?: "zh" | "en";
  origin?: string;
  preview?: boolean;
};

/**
 * Shareable deal detail page. Placeholder while the detail work lands: it keeps
 * the route honest and links back to the discovery board.
 */
export function renderDealDetail(input: DetailInput): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const deal = input.deal;
  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="description" content="优惠详情：${escapeForAttribute(deal.title)}"><title>${escapeForAttribute(deal.title)} · GLOBAL DEAL HUNTER</title><style>${PAGE_CSS}${NAV_CSS}</style></head>
<body>${renderNav({ active: "detail", lang })}
<main class="workspace" id="main" style="max-width:1180px;margin:0 auto;padding:36px">
  <p class="eyebrow">DEAL DETAIL</p>
  <h1>${escapeForAttribute(deal.title)}</h1>
  <p class="hero-description">正在整理优惠力度、领取资格、费用与原文证据。</p>
  <p class="collection-status"><a href="/deals">返回全部情报</a></p>
</main></body></html>`;
}

function escapeForAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const DETAIL_CSS = String.raw``;
