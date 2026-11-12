import { chineseCopy } from "../content/locale";
import { offerEvidence } from "../content/evidence";
import { formatWhen, isExpired, showSchedule } from "../extract";
import { CATEGORY_LABEL, DEAL_TYPE_LABEL, show } from "../labels";
import { escapeHtml } from "../text";
import type { DealRecord } from "../types";
import { sanitizeUrl } from "../url";
import { DETAIL_CSS } from "./detail-styles";
import { NAV_CSS, renderNav } from "./nav";
import { bilingual, detailPath, evidenceLabel, externalLink, icon } from "./shared";
import { PAGE_CSS } from "./styles";

export type DetailInput = {
  deal: DealRecord;
  now: Date;
  lang?: "zh" | "en";
  origin?: string;
  preview?: boolean;
};

type DealStatus = "active" | "ended" | "archived";

function absoluteDetail(origin: string | undefined, id: string): string {
  const base = (origin ?? "").trim().replace(/\/+$/, "");
  return `${base}${detailPath(id)}`;
}

function metaDescription(deal: DealRecord, title: string): string {
  const copy = chineseCopy(deal);
  const raw = (copy.summary || deal.summary || "").replace(/\s+/g, " ").trim();
  return (raw || `${title}：优惠力度、领取资格、截止时间与原文证据`).slice(0, 180);
}

/**
 * One shareable deal page, server-rendered. The first screen answers the four
 * questions a visitor (or a search result) actually has: how good is the offer,
 * who can claim it, when it ends and where the official entry is. Everything
 * else below is the source evidence behind those claims; anything the source
 * did not state stays "待核实" instead of being filled in.
 */
export function renderDealDetail(input: DetailInput): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const deal = input.deal;
  const copy = chineseCopy(deal);
  const proof = offerEvidence(deal);
  const official = sanitizeUrl(deal.officialUrl);
  const ended = isExpired(deal.endsAt, input.now);
  const archived = deal.status === "archived";
  const status: DealStatus = archived ? "archived" : ended ? "ended" : "active";
  const inactive = status !== "active";

  const title = copy.title || deal.title;
  const pageTitle = `${title} · GLOBAL DEAL HUNTER`;
  const description = metaDescription(deal, title);
  const canonical = absoluteDetail(input.origin, deal.id);

  const channel = deal.category === "ai"
    ? { href: "/ai-tools", label: "AI 工具" }
    : deal.category === "vps"
      ? { href: "/cloud", label: "云服务" }
      : { href: "/deals", label: "全部情报" };
  const breadcrumb = `<nav class="breadcrumb" aria-label="面包屑"><a href="/">首页</a><span class="sep" aria-hidden="true">/</span><a href="${channel.href}">${channel.label}</a><span class="sep" aria-hidden="true">/</span><span aria-current="page">优惠详情</span></nav>`;

  const statusLabel = status === "archived" ? "已归档" : status === "ended" ? "已结束" : "进行中";
  const chips = `<div class="detail-chips"><span class="deal-status" data-status="${status}">${statusLabel}</span><span class="detail-chip">${escapeHtml(CATEGORY_LABEL[deal.category] || deal.category)}</span><span class="detail-chip">${escapeHtml(DEAL_TYPE_LABEL[deal.dealType] || deal.dealType)}</span><span class="detail-chip source">来源 · ${escapeHtml(show(deal.sourceName))}</span></div>`;

  const valueHtml = bilingual(show(deal.valueText), copy.field(deal.valueText));
  const eligibilityRaw = deal.conditions || proof.eligibility;
  const eligibilityHtml = bilingual(show(eligibilityRaw), copy.field(eligibilityRaw));
  const regionHtml = bilingual(show(proof.regionText), copy.field(proof.regionText));
  const deadlineText = deal.endsAt ? formatWhen(deal.endsAt) : show(deal.timeText);
  const deadlineState = ended ? '<span class="deadline-state">已结束</span>' : "";

  const officialCta = official
    ? `<a class="official-cta" href="${escapeHtml(official)}" target="_blank" rel="noopener noreferrer">前往官方领取${icon("external")}</a>`
    : '<span class="official-cta official-disabled">官方入口待核实</span>';
  const officialNote = inactive
    ? '<p class="official-note">活动已结束，入口可能失效；请核对官方域名后再操作。</p>'
    : official
      ? ""
      : '<p class="official-note">来源没有给出可验证的官方链接，本站不补造入口。</p>';

  const archiveBanner = inactive
    ? `<aside class="archive-banner"><strong>${status === "archived" ? "这条优惠已归档" : "这条优惠已结束"}</strong><p>${escapeHtml(deal.archiveReason || "活动已结束，保留记录供查阅")}</p><p class="archive-note">页面保留完整原文证据与来源链接，方便回查。新活动请回到 <a href="/deals">全部情报</a>。</p></aside>`
    : "";

  const actions = `<div class="detail-actions"><button class="detail-action bookmark" type="button" data-id="${escapeHtml(deal.id)}" aria-pressed="false" aria-label="收藏这条情报" title="收藏到此浏览器">${icon("bookmark")}<span>收藏</span></button><button class="detail-action share" type="button" data-share aria-label="复制这条优惠的链接">${icon("share")}<span>分享</span></button></div>`;

  const costs = `<section class="detail-section" id="costs" aria-labelledby="costs-title"><div class="section-head"><h2 id="costs-title">费用与规则</h2><p>只列来源原文明确写出的条件；没有写到的标为「待核实」。</p></div><dl class="detail-dl"><div><dt>是否需要绑卡或付款方式</dt><dd>${evidenceLabel(proof.card, "需要付款方式", "无需绑卡", proof.paymentQuote)}</dd></div><div><dt>是否自动续费或转付费</dt><dd>${evidenceLabel(proof.renewal, "自动续费或转付费", "无自动续费", proof.renewalQuote)}</dd></div><div><dt>试用后价格或计费（原文）</dt><dd>${escapeHtml(show(proof.followup))}</dd></div></dl></section>`;

  const stepsSource = deal.steps.trim();
  const stepsHtml = stepsSource
    ? `<div class="steps-text">${escapeHtml(stepsSource)}</div><p class="section-note">以上为来源原文步骤，本站未改写；若官方页面已变化，请以官方说明为准。</p>`
    : '<p class="pending-block">待核实</p><p class="section-note">来源没有给出领取步骤，本站不补造；请直接以官方活动页说明为准。</p>';
  const steps = `<section class="detail-section" id="steps" aria-labelledby="steps-title"><div class="section-head"><h2 id="steps-title">领取步骤</h2><p>来源原文</p></div>${stepsHtml}</section>`;

  const sourceRow = externalLink(deal.sourceUrl, `${icon("globe")}<span>${escapeHtml(show(deal.sourceName))}</span>`, "source-link");
  const officialRow = official ? externalLink(deal.officialUrl, escapeHtml(official), "official-link") : "待核实";
  const evidence = `<section class="detail-section" id="evidence" aria-labelledby="evidence-title"><div class="section-head"><h2 id="evidence-title">原文证据</h2><p>可回溯的来源摘录与时间</p></div><blockquote class="source-excerpt"><p>${escapeHtml(show(deal.summary))}</p></blockquote>${copy.summary ? `<p class="excerpt-translation">中文摘录：${escapeHtml(copy.summary)}</p>` : ""}<dl class="detail-dl evidence-list"><div><dt>来源</dt><dd>${sourceRow}</dd></div><div><dt>来源发布时间</dt><dd>${escapeHtml(show(formatWhen(deal.publishedAt)))}</dd></div><div><dt>本站首次收录</dt><dd>${escapeHtml(show(formatWhen(deal.firstSeenAt)))}</dd></div><div><dt>最后来源核验</dt><dd>${escapeHtml(show(formatWhen(deal.lastVerifiedAt)))}</dd></div><div><dt>活动时间</dt><dd>${escapeHtml(showSchedule(deal))}</dd></div><div><dt>官方链接</dt><dd>${officialRow}</dd></div>${deal.riskNote.trim() ? `<div><dt>风险提示</dt><dd class="risk-inline">${escapeHtml(deal.riskNote)}</dd></div>` : ""}</dl></section>`;

  const footer = '<footer class="detail-footer"><p><a href="/deals">← 返回全部情报</a> · <a href="/deals?view=saved">我的收藏</a> · <a href="/">回到首页</a></p><p>金额、资格与期限以来源原文和官方活动页为准；本站只做公开信息整理。</p></footer>';

  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(pageTitle)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:site_name" content="GLOBAL DEAL HUNTER"><title>${escapeHtml(pageTitle)}</title><style>${PAGE_CSS}${NAV_CSS}${DETAIL_CSS}</style></head>
<body><a class="skip" href="#main">跳到正文</a>${renderNav({ active: "detail", lang })}
<main class="detail-page" id="main">
  ${input.preview ? '<p class="preview-label">本机预览 · 线上数据快照</p>' : ""}
  ${breadcrumb}
  ${archiveBanner}
  <article class="detail-hero" data-id="${escapeHtml(deal.id)}">
    <header class="detail-head">${chips}<h1 class="detail-title">${bilingual(deal.title, copy.title)}</h1></header>
    <dl class="detail-vitals">
      <div class="vital"><dt>优惠力度</dt><dd class="detail-value">${valueHtml}</dd></div>
      <div class="vital"><dt>领取资格</dt><dd>${eligibilityHtml}</dd><dd class="vital-sub"><span>适用地区</span>${regionHtml}</dd></div>
      <div class="vital"><dt>截止时间</dt><dd class="detail-deadline">${escapeHtml(deadlineText)}${deadlineState}</dd></div>
      <div class="vital vital-official"><dt>官方入口</dt><dd class="official-row">${officialCta}${officialNote}</dd></div>
    </dl>
    ${actions}
    <noscript><p class="noscript">收藏与分享需要 JavaScript；优惠信息、费用与原文证据无需脚本即可阅读。</p></noscript>
  </article>
  ${costs}
  ${steps}
  ${evidence}
  ${footer}
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>${DETAIL_SCRIPT}</script>
</body></html>`;
}

/**
 * Detail-page behaviour: bookmark toggling shares the site-wide `dh-saved`
 * localStorage key (a JSON array of deal ids), share copies the current URL and
 * every result is announced through the same toast used by the discovery board.
 * No third-party code, no inline event handlers.
 */
export const DETAIL_SCRIPT = String.raw`
(function () {
  var KEY = "dh-saved";
  var toastTimer = 0;
  function toast(message) {
    var node = document.getElementById("toast");
    if (!node) return;
    clearTimeout(toastTimer);
    node.textContent = message;
    toastTimer = setTimeout(function () { node.textContent = ""; }, 2600);
  }
  function readSaved() {
    try {
      var parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(function (id) { return typeof id === "string"; }) : [];
    } catch (error) {
      return [];
    }
  }
  function persistSaved(ids) {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
      return true;
    } catch (error) {
      return false;
    }
  }
  var bookmark = document.querySelector(".detail-actions .bookmark[data-id]");
  if (bookmark) {
    var id = bookmark.getAttribute("data-id") || "";
    function paint(saved) {
      bookmark.setAttribute("aria-pressed", saved ? "true" : "false");
      bookmark.setAttribute("aria-label", saved ? "取消收藏这条情报" : "收藏这条情报");
      bookmark.title = saved ? "取消收藏" : "收藏到此浏览器";
      var label = bookmark.querySelector("span");
      if (label) label.textContent = saved ? "已收藏" : "收藏";
    }
    paint(readSaved().indexOf(id) >= 0);
    bookmark.addEventListener("click", function () {
      var ids = readSaved();
      var index = ids.indexOf(id);
      if (index >= 0) ids.splice(index, 1); else ids.push(id);
      var canPersist = persistSaved(ids);
      paint(ids.indexOf(id) >= 0);
      toast((ids.indexOf(id) >= 0 ? "已收藏" : "已取消收藏") + (canPersist ? " · 仅此浏览器" : " · 本次会话有效，浏览器未允许保存"));
    });
    addEventListener("storage", function (event) {
      if (event.key === KEY || event.key === null) paint(readSaved().indexOf(id) >= 0);
    });
  }
  document.querySelectorAll("[data-share]").forEach(function (button) {
    button.addEventListener("click", function () {
      var url = location.href;
      function fallback() {
        toast("复制失败，请手动复制地址：" + url);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast("链接已复制，可以分享给朋友");
        }, fallback);
      } else {
        fallback();
      }
    });
  });
})();
`;
