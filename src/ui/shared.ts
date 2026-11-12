import { formatWhen, isExpired, showSchedule } from "../extract";
import { CATEGORY_LABEL, DEAL_TYPE_LABEL, PENDING, show } from "../labels";
import { escapeHtml } from "../text";
import type { DealRecord } from "../types";
import { sanitizeUrl } from "../url";
import { chineseCopy } from "../content/locale";
import { offerEvidence, offerRevision } from "../content/evidence";

export const ICONS: Record<string, string> = {
  radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m12 12 7-7M12 2v2M2 12h2m8 8v2m8-10h2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  chart: '<path d="M4 20V12m8 8V4m8 16V8M2 20h20"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v12h14V8m-10 4h6"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 4-2 5-2 5h16s-2-1-2-5"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m0-10H4v16h16v-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  check: '<path d="m5 12 5 5L19 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.5"/>',
};

export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.grid}</svg>`;
}

export function stamp(value: string | null): number {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : 0;
}

export function hasSourceText(value: string | null | undefined): boolean {
  return show(value) !== PENDING;
}

/** Preserve both source and translation; missing translations fall back to the source. */
export function bilingual(original: string, zh: string | undefined): string {
  if (!zh || !zh.trim()) return escapeHtml(original);
  return `<span class="t-en" lang="en">${escapeHtml(original)}</span><span class="t-zh" lang="zh-CN">${escapeHtml(zh)}</span>`;
}

export function hasTranslation(deal: DealRecord): boolean {
  return Boolean(deal.zhTitle?.trim() || deal.zhSummary?.trim());
}

export function externalLink(raw: string, body: string, className = ""): string {
  const url = sanitizeUrl(raw);
  return url
    ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="在新窗口打开来源">${body}</a>`
    : `<span class="${className}">${body}</span>`;
}

export function evidenceLabel(value: string, yes: string, no: string, quote: string): string {
  const label = value === "yes" ? yes : value === "no" ? no : value === "conflict" ? "来源表述有冲突" : PENDING;
  return escapeHtml(label) + (quote ? `<small class="evidence-quote">${escapeHtml(quote)}</small>` : "");
}

/** Stable, shareable path for one deal. */
export function detailPath(id: string): string {
  return `/deal/${encodeURIComponent(id)}`;
}

export type CardOptions = {
  sections: string;
  archived: boolean;
  hidden: boolean;
  open: boolean;
};

/**
 * The one canonical deal card. It is shared by the discovery dashboard, the
 * AI / cloud channels and the portal homepage, so that a deal never renders two
 * different ways for the same visitor.
 */
export function renderCard(deal: DealRecord, options: CardOptions): string {
  const copy = chineseCopy(deal);
  const proof = offerEvidence(deal);
  const searchable = [deal.title, deal.summary, deal.zhTitle, deal.zhSummary, deal.sourceName, proof.regionText,
    copy.title, copy.summary, copy.intro, copy.field(deal.regions), copy.field(deal.conditions),
    CATEGORY_LABEL[deal.category], DEAL_TYPE_LABEL[deal.dealType], deal.category, deal.regions, deal.conditions]
    .filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
  const value = bilingual(show(deal.valueText), copy.field(deal.valueText));
  const source = externalLink(deal.sourceUrl, `${icon("globe")}<span>${escapeHtml(deal.sourceName)}</span>`, "source-link");
  const destination = sanitizeUrl(deal.officialUrl) || sanitizeUrl(deal.sourceUrl);
  const mtLabel = copy.edited
    ? (copy.machine ? "中文整理 · 含机器译文" : "本站中文整理")
    : (deal.zhTitle?.trim() && deal.zhSummary?.trim() ? "机器翻译" : "部分内容已翻译");
  const translated = copy.title || copy.summary
    ? `<span class="mt t-zh" title="中文内容按收录原文翻译与整理，金额与条件以来源原文为准">${mtLabel} · 原文可查</span><span class="t-en">来源原文</span>`
    : `<span title="暂无可用译文时，完整保留来源原文">原文展示</span>`;
  const deadline = deal.endsAt ? formatWhen(deal.endsAt) : show(deal.timeText);
  const durationZh = !deal.startsAt && !deal.endsAt ? copy.field(deal.timeText) : undefined;
  return `<article class="card${options.archived ? " archived" : ""}" data-id="${escapeHtml(deal.id)}" data-search="${escapeHtml(searchable)}" data-category="${escapeHtml(deal.category)}" data-type="${deal.dealType}" data-sections="${options.sections}" data-archived="${options.archived}" data-rank="${Number.isFinite(deal.rankScore) ? deal.rankScore : 0}" data-stamp="${stamp(deal.publishedAt ?? deal.firstSeenAt)}" data-start="${stamp(deal.startsAt)}" data-deadline="${proof.deadline || Number.MAX_SAFE_INTEGER}"${options.hidden ? " hidden" : ""}>
    <div class="card-top"><span class="category-dot"></span><span class="category-label">${escapeHtml(CATEGORY_LABEL[deal.category] ?? deal.category)}</span><span class="type-chip${deal.dealType === "free" ? " free" : ""}">${escapeHtml(DEAL_TYPE_LABEL[deal.dealType])}</span>${options.archived ? '<span class="archive-chip">已归档</span>' : ""}<button class="icon-button bookmark" type="button" aria-label="收藏这条情报" aria-pressed="false" title="收藏到此浏览器">${icon("bookmark")}</button></div>
    <h3><a class="card-title-link" href="${detailPath(deal.id)}">${bilingual(deal.title, copy.title)}</a></h3>
    <div class="content-summary"><span class="intro-label">内容简介</span><p class="excerpt t-zh">${escapeHtml(copy.intro)}</p><p class="excerpt t-en">${escapeHtml(deal.summary || "来源没有提供摘要。")}</p></div>
    <dl class="facts" data-first-seen="${stamp(deal.firstSeenAt)}" data-region-known="${hasSourceText(proof.regionText)}" data-terms-known="${hasSourceText(deal.conditions || proof.eligibility)}" data-deadline-known="${proof.deadline !== 0}" data-regions="${proof.regions.join(" ")}" data-card="${proof.card}" data-renewal="${proof.renewal}" data-student="${proof.student}" data-revision="${offerRevision(deal, proof)}"><div><dt>原文优惠</dt><dd class="offer-value">${value}</dd></div><div><dt>参与条件</dt><dd>${bilingual(show(deal.conditions || proof.eligibility), copy.field(deal.conditions || proof.eligibility))}</dd></div><div><dt>适用地区</dt><dd>${bilingual(show(proof.regionText), copy.field(proof.regionText))}</dd></div><div><dt>${deal.endsAt ? "截止日期" : "时间说明"}</dt><dd>${deal.endsAt ? escapeHtml(deadline) : bilingual(deadline, copy.field(deal.timeText))}</dd></div></dl>
    <p class="recommendation-reason" hidden></p>
    <p class="translation-line">${translated}<span>条目核验 <time datetime="${escapeHtml(deal.lastVerifiedAt)}">${escapeHtml(show(formatWhen(deal.lastVerifiedAt)))}</time></span></p>
    <p class="saved-deadline" hidden>收藏提醒 · 7 天内截止</p>
    ${deal.riskNote ? '<span class="risk-flag">涉及金融或加密资产 · 请先查看风险与资格</span>' : ""}
    <div class="card-bottom">${source}<a class="detail-link" href="${detailPath(deal.id)}">查看详情 ${icon("arrow")}</a>${externalLink(destination, `查看原文 ${icon("external")}`, "visit")}</div>
    <details class="deal-details"${options.open ? " open" : ""}><summary>费用、领取步骤与原文 ${icon("down")}</summary><div class="details-body"><dl class="full">
      <div><dt>是否需要绑卡或付款方式</dt><dd>${evidenceLabel(proof.card, "需要付款方式", "无需绑卡", proof.paymentQuote)}</dd></div>
      <div><dt>是否自动续费或转付费</dt><dd>${evidenceLabel(proof.renewal, "自动续费或转付费", "无自动续费", proof.renewalQuote)}</dd></div>
      <div><dt>试用后价格或计费（原文）</dt><dd>${escapeHtml(show(proof.followup))}</dd></div>
      <div><dt>活动名称</dt><dd>${bilingual(deal.title, copy.title)}</dd></div>
      <div class="t-zh"><dt>中文导读（本站整理）</dt><dd>${escapeHtml(copy.intro)}</dd></div>
      <div><dt>来源原文摘录</dt><dd>${escapeHtml(show(deal.summary))}</dd></div>
      ${copy.summary ? `<div class="t-zh"><dt>摘录译文</dt><dd>${escapeHtml(copy.summary)}</dd></div>` : ""}
      <div><dt>开始及截止时间</dt><dd>${bilingual(showSchedule(deal), durationZh ? `${durationZh}（未给出日历截止日）` : undefined)}</dd></div>
      <div><dt>参与条件</dt><dd>${bilingual(show(deal.conditions), copy.field(deal.conditions))}</dd></div>
      <div><dt>适用国家或地区</dt><dd>${bilingual(show(proof.regionText), copy.field(proof.regionText))}</dd></div>
      <div><dt>参与步骤（来源原文）</dt><dd>${escapeHtml(show(deal.steps))}</dd></div>
      <div><dt>官方活动链接</dt><dd>${sanitizeUrl(deal.officialUrl) ? externalLink(deal.officialUrl, escapeHtml(sanitizeUrl(deal.officialUrl))) : "待核实"}</dd></div>
      <div><dt>信息来源</dt><dd>${externalLink(deal.sourceUrl, escapeHtml(deal.sourceName))}</dd></div>
      <div><dt>来源发布时间</dt><dd>${escapeHtml(show(formatWhen(deal.publishedAt)))}</dd></div>
      <div><dt>本站发现时间</dt><dd>${escapeHtml(show(formatWhen(deal.firstSeenAt)))}</dd></div>
      <div><dt>最后来源核验</dt><dd>${escapeHtml(show(formatWhen(deal.lastVerifiedAt)))}</dd></div>
      ${options.archived ? `<div><dt>归档说明</dt><dd>${escapeHtml(deal.archiveReason || "活动已结束，保留记录供查阅。")}</dd></div>` : ""}
    </dl>${deal.riskNote ? `<p class="risk">${escapeHtml(deal.riskNote)}</p>` : ""}</div></details>
  </article>`;
}

/** Archived means the collector marked it archived, or its calendar deadline has passed. */
export function dealIsArchived(deal: DealRecord, now: Date): boolean {
  return deal.status === "archived" || isExpired(deal.endsAt, now);
}
