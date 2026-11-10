import { formatWhen, showSchedule } from "./extract";
import { CATEGORIES, CATEGORY_LABEL, DEAL_TYPES, DEAL_TYPE_LABEL, show } from "./labels";
import { escapeHtml } from "./text";
import type { Board, BoardSectionId, DealRecord, RunRecord, SourceCheck } from "./types";
import { sanitizeUrl } from "./url";
import { chineseCopy } from "./content/locale";
import { CLIENT_SCRIPT } from "./ui/client";
import { PAGE_CSS } from "./ui/styles";

const SECTION_ORDER: BoardSectionId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
const SHORT_DATE = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", timeZone: "Asia/Shanghai",
});
const ICONS: Record<string, string> = {
  radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m12 12 7-7M12 2v2M2 12h2m8 8v2m8-10h2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  chart: '<path d="M4 20V12m8 8V4m8 16V8M2 20h20"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  archive: '<rect x="3" y="3" width="18" height="5" rx="1.5"/><path d="M5 8v12h14V8m-10 4h6"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m0-10H4v16h16v-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/>',
};

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.grid}</svg>`;
}

/** Preserve both source and translation; missing translations fall back to the source. */
export function bilingual(original: string, zh: string | undefined): string {
  if (!zh || !zh.trim()) return escapeHtml(original);
  return `<span class="t-en" lang="en">${escapeHtml(original)}</span><span class="t-zh" lang="zh-CN">${escapeHtml(zh)}</span>`;
}

export function hasTranslation(deal: DealRecord): boolean {
  return Boolean(deal.zhTitle?.trim() || deal.zhSummary?.trim());
}

/** Old callers may only supply a board. The dashboard supplies all DB rows as well. */
export function uniqueDeals(board: Board, deals?: DealRecord[]): DealRecord[] {
  const rows = deals ?? [...board.feed, ...SECTION_ORDER.flatMap(id => board.sections[id])];
  return [...new Map(rows.map(deal => [deal.id, deal])).values()].sort((a, b) =>
    (b.publishedAt ?? b.firstSeenAt).localeCompare(a.publishedAt ?? a.firstSeenAt) || a.id.localeCompare(b.id),
  );
}

function stamp(value: string | null): number {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : 0;
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间待核实" : SHORT_DATE.format(date);
}

function externalLink(raw: string, body: string, className = ""): string {
  const url = sanitizeUrl(raw);
  return url
    ? `<a class="${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="在新窗口打开来源">${body}</a>`
    : `<span class="${className}">${body}</span>`;
}

function card(deal: DealRecord, options: { sections: string; archived: boolean; hidden: boolean; open: boolean }): string {
  const copy = chineseCopy(deal);
  const searchable = [deal.title, deal.summary, deal.zhTitle, deal.zhSummary, deal.sourceName,
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
  const deadline = deal.endsAt ? shortDate(deal.endsAt) : show(deal.timeText);
  const durationZh = !deal.startsAt && !deal.endsAt ? copy.field(deal.timeText) : undefined;
  return `<article class="card${options.archived ? " archived" : ""}" data-id="${escapeHtml(deal.id)}" data-search="${escapeHtml(searchable)}" data-category="${deal.category}" data-type="${deal.dealType}" data-sections="${options.sections}" data-archived="${options.archived}" data-rank="${Number.isFinite(deal.rankScore) ? deal.rankScore : 0}" data-stamp="${stamp(deal.publishedAt ?? deal.firstSeenAt)}" data-deadline="${stamp(deal.endsAt) || Number.MAX_SAFE_INTEGER}"${options.hidden ? " hidden" : ""}>
    <div class="card-top"><span class="category-dot"></span><span class="category-label">${escapeHtml(CATEGORY_LABEL[deal.category])}</span><span class="type-chip${deal.dealType === "free" ? " free" : ""}">${escapeHtml(DEAL_TYPE_LABEL[deal.dealType])}</span>${options.archived ? '<span class="archive-chip">已归档</span>' : ""}<button class="icon-button bookmark" type="button" aria-label="收藏这条情报" aria-pressed="false" title="收藏到此浏览器">${icon("bookmark")}</button></div>
    <h3>${bilingual(deal.title, copy.title)}</h3>
    <div class="content-summary"><span class="intro-label">内容简介</span><p class="excerpt t-zh">${escapeHtml(copy.intro)}</p><p class="excerpt t-en">${escapeHtml(deal.summary || "来源没有提供摘要。")}</p></div>
    <dl class="facts"><div><dt>来源标值</dt><dd class="offer-value">${value}</dd></div><div><dt>${deal.endsAt ? "截止日期" : "时间说明"}</dt><dd>${deal.endsAt ? escapeHtml(deadline) : bilingual(deadline, copy.field(deal.timeText))}</dd></div><div><dt>适用地区</dt><dd>${bilingual(show(deal.regions), copy.field(deal.regions))}</dd></div><div><dt>参与条件</dt><dd>${bilingual(show(deal.conditions), copy.field(deal.conditions))}</dd></div></dl>
    <p class="translation-line">${translated}<time datetime="${escapeHtml(deal.lastVerifiedAt)}">${escapeHtml(shortDate(deal.lastVerifiedAt))} 来源核验</time></p>
    ${deal.riskNote ? '<span class="risk-flag">涉及金融或加密资产 · 请先查看风险与资格</span>' : ""}
    <div class="card-bottom">${source}${externalLink(destination, `查看原文 ${icon("external")}`, "visit")}</div>
    <details class="deal-details"${options.open ? " open" : ""}><summary>条件、来源与完整说明 ${icon("down")}</summary><div class="details-body"><dl class="full">
      <div><dt>活动名称</dt><dd>${bilingual(deal.title, copy.title)}</dd></div>
      <div class="t-zh"><dt>中文导读（本站整理）</dt><dd>${escapeHtml(copy.intro)}</dd></div>
      <div><dt>完整优惠内容</dt><dd>${bilingual(show(deal.summary), copy.summary)}</dd></div>
      <div><dt>开始及截止时间</dt><dd>${bilingual(showSchedule(deal), durationZh ? `${durationZh}（未给出日历截止日）` : undefined)}</dd></div>
      <div><dt>参与条件</dt><dd>${bilingual(show(deal.conditions), copy.field(deal.conditions))}</dd></div>
      <div><dt>适用国家或地区</dt><dd>${bilingual(show(deal.regions), copy.field(deal.regions))}</dd></div>
      <div><dt>参与步骤（来源原文）</dt><dd>${escapeHtml(show(deal.steps))}</dd></div>
      <div><dt>官方活动链接</dt><dd>${sanitizeUrl(deal.officialUrl) ? externalLink(deal.officialUrl, escapeHtml(sanitizeUrl(deal.officialUrl))) : "待核实"}</dd></div>
      <div><dt>信息来源</dt><dd>${externalLink(deal.sourceUrl, escapeHtml(deal.sourceName))}</dd></div>
      <div><dt>最后来源核验</dt><dd>${escapeHtml(formatWhen(deal.lastVerifiedAt))}</dd></div>
      ${options.archived ? `<div><dt>归档说明</dt><dd>${escapeHtml(deal.archiveReason || "活动已结束，保留记录供查阅。")}</dd></div>` : ""}
    </dl>${deal.riskNote ? `<p class="risk">${escapeHtml(deal.riskNote)}</p>` : ""}</div></details>
  </article>`;
}

function sourceRows(checks: SourceCheck[]): string {
  if (!checks.length) return '<p>尚无来源检查记录。信息将在下一轮更新后显示。</p>';
  return `<div class="source-rows">${checks.map(check => `<div class="source-row${check.ok ? "" : " bad"}">${externalLink(check.sourceUrl, escapeHtml(check.sourceId))}<span>${check.ok ? "可访问" : "暂不可用"} · ${check.httpStatus ?? "—"}</span><small>本轮收录 ${check.itemsKept} 条${!check.ok ? " · 暂保留上一次可用记录" : ""}</small></div>`).join("")}</div>`;
}

export function renderPage(input: {
  board: Board;
  deals?: DealRecord[];
  checks: SourceCheck[];
  run: RunRecord | null;
  now: Date;
  expand: boolean;
  dbError?: string;
  lang?: "zh" | "en";
  preview?: boolean;
}): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const deals = uniqueDeals(input.board, input.deals);
  const archivedIds = new Set(input.board.sections.H.map(deal => deal.id));
  const membership = new Map<string, string[]>();
  for (const id of SECTION_ORDER) {
    for (const deal of input.board.sections[id]) {
      const ids = membership.get(deal.id) ?? [];
      ids.push(id);
      membership.set(deal.id, ids);
    }
  }
  const ok = input.checks.filter(check => check.ok).length;
  const checked = input.run?.finishedAt ?? input.run?.startedAt;
  const lastUpdate = checked ? formatWhen(checked) : "等待首次更新";
  const views: Array<{ id: string; title: string; glyph: string; count: number }> = [
    { id: "all", title: "全部情报", glyph: "grid", count: input.board.activeCount },
    { id: "today", title: "今日更新", glyph: "sun", count: input.board.sections.A.length },
    { id: "rank", title: "来源标值榜", glyph: "chart", count: input.board.sections.B.length },
    { id: "ending", title: "即将截止", glyph: "clock", count: input.board.sections.G.length },
    { id: "archived", title: "已结束档案", glyph: "archive", count: archivedIds.size },
    { id: "saved", title: "我的收藏", glyph: "bookmark", count: 0 },
  ];
  let initialCount = 0;
  const cards = deals.map(deal => {
    const archived = deal.status === "archived" || archivedIds.has(deal.id);
    const hidden = archived || initialCount >= 12;
    if (!hidden) initialCount += 1;
    return card(deal, {
      archived, hidden, open: input.expand && initialCount === 1 && !hidden,
      sections: (membership.get(deal.id) ?? []).join(" "),
    });
  }).join("");
  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="description" content="全球羊毛情报中心：发现公开来源中的 AI 工具、云服务与数字优惠。支持中文阅读、原文对照、分类筛选和本机收藏。金额与资格以活动原文为准。"><title>全球羊毛情报中心 · GLOBAL DEAL HUNTER</title><style>${PAGE_CSS}</style></head>
<body><a class="skip" href="#main">跳到优惠列表</a><div class="shell">
  <aside class="sidebar"><a class="brand" href="/" aria-label="Deal Hunter 首页"><span class="brand-mark">${icon("radar")}</span><span><strong>Deal Hunter</strong><small>GLOBAL OPPORTUNITIES</small></span></a><p class="nav-label">发现 · DISCOVER</p><nav class="view-nav" aria-label="情报视图">${views.map(view => `<button class="view-tab" type="button" data-view="${view.id}" aria-pressed="${view.id === "all"}">${icon(view.glyph)}<span>${view.title}</span><b${view.id === "saved" ? ' id="saved-count"' : ""}>${view.count}</b></button>`).join("")}</nav><div class="side-note"><p><span class="signal"></span>持续整理公开来源</p><p>好机会很多，值得先看清条件。</p><a href="#sources">查看来源状态 ${icon("arrow")}</a></div></aside>
  <main class="workspace" id="main"><header class="hero"><div class="hero-copy">${input.preview ? '<p class="preview-label">本机预览 · 线上数据快照 · 未触发采集或 AI 翻译</p>' : ""}<p class="eyebrow">GLOBAL DEAL HUNTER</p><h1>全球羊毛情报中心</h1><p class="hero-description">汇集 AI 工具、云服务、学生资源与数字优惠。先看中文简介，再按地区、期限和条件核对原文。</p></div><div class="hero-stats" aria-label="情报概况"><div><strong>${input.board.activeCount}</strong><span>在册情报</span></div><div><strong>${ok}<span style="display:inline;font-size:16px"> / ${input.checks.length}</span></strong><span>本轮来源可用</span></div></div></header>
    ${input.dbError ? '<p class="error-banner" role="alert">情报暂时无法载入，请稍后刷新重试。来源原文仍是核对活动条件的依据。</p>' : ""}
    <section class="toolbar" aria-label="搜索与筛选"><div class="search-box">${icon("search")}<label class="sr-only" for="q">搜索标题、译文、来源或地区</label><input id="q" type="search" maxlength="160" placeholder="搜索 AI、云服务、学生优惠…" autocomplete="off" enterkeyhint="search" aria-controls="deal-list"><button class="icon-button" id="clear-search" type="button" aria-label="清除搜索" hidden>${icon("close")}</button><kbd class="shortcut" aria-hidden="true">/</kbd></div><div class="filter-row">
      <label class="select-wrap"><span>分类</span><select id="category" aria-label="情报分类"><option value="all">全部分类</option>${CATEGORIES.map(category => `<option value="${category}">${escapeHtml(CATEGORY_LABEL[category])}</option>`).join("")}<option value="finance">银行与卡片</option></select></label>
      <label class="select-wrap"><span>条件</span><select id="deal-type" aria-label="优惠类型"><option value="all">全部优惠类型</option>${DEAL_TYPES.map(type => `<option value="${type}">${escapeHtml(DEAL_TYPE_LABEL[type])}</option>`).join("")}</select></label>
      <label class="select-wrap sort"><span>排序</span><select id="sort" aria-label="排序方式"><option value="newest">最新动态</option><option value="rank">来源标值</option><option value="ending">截止日期</option></select></label>
      <nav class="langbar" aria-label="内容语言"><a class="zh" href="?lang=zh" data-set-lang="zh" hreflang="zh-CN" title="查看中文标题、简介与已翻译内容"${lang === "zh" ? ' aria-current="true"' : ""}>中文</a><a class="en" href="?lang=en" data-set-lang="en" hreflang="en" title="对照来源英文标题与摘要"${lang === "en" ? ' aria-current="true"' : ""}>EN 原文</a></nav>
    </div></section>
    <div class="results-heading" id="results-heading"><div><h2 id="view-title" tabindex="-1">全部情报</h2><p id="view-note">公开来源，原文可查。金额与资格以活动页面为准。</p></div><div class="results-meta"><span id="result-status" role="status" aria-live="polite" aria-atomic="true">共 ${input.board.activeCount} 条</span><button class="text-button" id="reset-filters" type="button" hidden>清除筛选</button></div></div>
    <noscript><p class="noscript">当前显示全部记录。启用 JavaScript 后可使用分类筛选、收藏与分页。</p><style>.card[hidden]{display:block!important}.view-nav,.filter-row>label,.pagination{display:none!important}</style></noscript>
    <section class="card-grid" id="deal-list" aria-label="优惠情报">${cards}</section>
    <section class="empty-state" id="empty-state"${deals.length ? " hidden" : ""}><div class="empty-symbol">${icon("search")}</div><h3 id="empty-title">暂时没有匹配的情报</h3><p id="empty-note">试试更短的关键词，或清除分类与优惠类型筛选。</p><button class="text-button" id="empty-reset" type="button">浏览全部情报 ${icon("arrow")}</button></section>
    <nav class="pagination" id="pagination" aria-label="列表分页" hidden><button class="page-button" id="previous-page" type="button">${icon("left")} 上一页</button><span class="page-info" id="page-info">1 / 1</span><button class="page-button" id="next-page" type="button">下一页 ${icon("right")}</button></nav>
    <details class="sources" id="sources"><summary>${icon("globe")} 来源健康与更新记录<span class="status-label">${ok} / ${input.checks.length} 可用</span>${icon("down")}</summary><div class="sources-body"><p>最近更新：${escapeHtml(lastUpdate)}。来源可访问不代表活动资格或优惠已经独立确认，请核对活动原文。</p>${sourceRows(input.checks)}</div></details>
    <details class="notice"><summary>关于信息、翻译与风险</summary><p>本站整理已抓取的公开来源。金额、日期、地区与条件没有写明时显示「待核实」，不补造承诺。中文标题与简介按收录原文翻译、整理，不代表重新验证活动；后台机器译文单独标注。原文变化后，旧的中文整理停止使用；没有可用译文时保留原文。Crypto、银行与卡片条目的风险和资格说明保留在详情中。来源链接去除常见跟踪与邀请参数。</p></details>
    <footer class="footer"><p>PUBLIC SOURCES. REAL CONDITIONS.</p><p>${escapeHtml(lastUpdate)} 更新</p></footer>
  </main></div><div class="toast" id="toast" role="status" aria-live="polite"></div><script>${CLIENT_SCRIPT}</script></body></html>`;
}
