import { formatWhen } from "./extract";
import { CATEGORIES, CATEGORY_LABEL, DEAL_TYPES, DEAL_TYPE_LABEL } from "./labels";
import { escapeHtml } from "./text";
import type { Board, BoardSectionId, DealRecord, RunRecord, SourceCheck } from "./types";
import { REGIONS } from "./content/evidence";
import { CHANNELS, type ChannelKey } from "./routes";
import { CLIENT_SCRIPT } from "./ui/client";
import { NAV_CSS, renderNav } from "./ui/nav";
import { externalLink, icon, renderCard, stamp } from "./ui/shared";
import { PAGE_CSS } from "./ui/styles";

export { bilingual, hasTranslation } from "./ui/shared";

const SECTION_ORDER: BoardSectionId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

function collectionStatus(run: RunRecord | null, available: number, total: number, now: Date): string {
  if (!run) return "等待首次采集";
  if (!run.finishedAt) return "本轮采集尚未完成";
  if (!run.ok) return "最近一轮采集失败";
  if (now.getTime() - stamp(run.finishedAt) > 6 * 60 * 60 * 1000) return "距上次采集已超过 6 小时";
  if (total && available < total) return "部分来源最近一次采集未成功";
  return "最近一轮采集完成";
}

function radarControls(live: boolean): string {
  return `<div class="radar-controls" id="radar-controls" hidden>
    <details class="radar-panel" id="preferences"><summary>我的偏好</summary><form id="preference-form">
      <div class="preference-fields">
        <label>常用地区<select name="region"><option value="">不限地区</option>${Object.entries(REGIONS).map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}</select></label>
        <label>关注分类<select name="category"><option value="">不限分类</option>${CATEGORIES.map(key => `<option value="${key}">${CATEGORY_LABEL[key]}</option>`).join("")}</select></label>
        <label><input type="checkbox" name="noCard"> 仅看明确无需绑卡</label>
        <label><input type="checkbox" name="noRenewal"> 仅看明确无自动续费</label>
      </div>
      <fieldset><legend>站内提醒</legend>
        <label><input type="checkbox" name="newOffer"> 匹配的新优惠</label>
        <label><input type="checkbox" name="ending"> 收藏即将截止</label>
        <label><input type="checkbox" name="changed"> 收藏的条款变化</label>
        <label>显示频率<select name="frequency"><option value="live">打开时更新</option><option value="daily">按日汇总</option></select></label>
      </fieldset>
      <button type="submit" class="page-button">保存偏好</button><small>偏好和提醒保存在当前浏览器。</small>
    </form></details>
    <details class="radar-panel" id="alerts"><summary>提醒 <span id="alert-count" aria-live="polite"></span></summary>
      <div class="alerts-body"><p id="alert-empty">暂无提醒。</p><ul id="alert-list"></ul><button type="button" id="clear-alerts" class="text-button" hidden>清空提醒</button></div>
    </details>
    ${live ? '<button type="button" id="live-refresh" class="page-button" hidden>查看新一轮更新</button><span id="live-status" class="sr-only" role="status"></span>' : ""}
  </div>`;
}

function sourceRows(checks: SourceCheck[], success: Map<string, string> | undefined): string {
  if (!checks.length) return '<p>尚无来源检查记录。信息将在下一轮更新后显示。</p>';
  return `<div class="source-rows">${checks.map(check => {
    const lastSuccess = check.ok ? check.checkedAt : success?.get(check.sourceId);
    const successLabel = lastSuccess ? formatWhen(lastSuccess) : success ? "暂无记录" : "暂无历史数据";
    const failure = check.ok ? "" : /timeout|timed out|abort/i.test(check.error) ? "请求超时" : "本轮未成功";
    return `<div class="source-row${check.ok ? "" : " bad"}">${externalLink(check.sourceUrl, escapeHtml(check.sourceId))}<span>${failure || "采集成功"} · ${check.httpStatus ?? "—"}</span><small>最近尝试 ${escapeHtml(formatWhen(check.checkedAt))}<br>最近成功 ${escapeHtml(successLabel)}<br>最近尝试收录 ${check.itemsKept} 条</small></div>`;
  }).join("")}</div>`;
}

/** Old callers may only supply a board. The dashboard supplies all DB rows as well. */
export function uniqueDeals(board: Board, deals?: DealRecord[]): DealRecord[] {
  const rows = deals ?? [...board.feed, ...SECTION_ORDER.flatMap(id => board.sections[id])];
  return [...new Map(rows.map(deal => [deal.id, deal])).values()].sort((a, b) =>
    (b.publishedAt ?? b.firstSeenAt).localeCompare(a.publishedAt ?? a.firstSeenAt) || a.id.localeCompare(b.id),
  );
}

export function renderPage(input: {
  board: Board;
  deals?: DealRecord[];
  checks: SourceCheck[];
  sourceSuccess?: Map<string, string>;
  run: RunRecord | null;
  now: Date;
  expand: boolean;
  dbError?: string;
  lang?: "zh" | "en";
  preview?: boolean;
  updateToken?: string;
  /** When set, the page is one of the two public channels and every count is scoped to it. */
  channel?: ChannelKey;
}): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const channelInfo = input.channel ? CHANNELS[input.channel] : undefined;
  const deals = uniqueDeals(input.board, input.deals);
  const scopeDeals = channelInfo ? deals.filter(deal => deal.category === channelInfo.category) : deals;
  const archivedIds = new Set(input.board.sections.H.map(deal => deal.id));
  const scopedArchived = scopeDeals.filter(deal => deal.status === "archived" || archivedIds.has(deal.id));
  const scopedActive = scopeDeals.filter(deal => !scopedArchived.includes(deal));
  const endingScoped = input.board.sections.G.filter(deal => !channelInfo || deal.category === channelInfo.category);
  const membership = new Map<string, string[]>();
  for (const id of SECTION_ORDER) {
    for (const deal of input.board.sections[id]) {
      const ids = membership.get(deal.id) ?? [];
      ids.push(id);
      membership.set(deal.id, ids);
    }
  }
  const ok = input.checks.filter(check => check.ok).length;
  const checked = input.run?.finishedAt;
  const lastUpdate = checked ? formatWhen(checked) : "等待首次更新";
  const runStatus = collectionStatus(input.run, ok, input.checks.length, input.now);
  const views: Array<{ id: string; title: string; glyph: string; count: number }> = [
    { id: "all", title: "全部情报", glyph: "grid", count: scopedActive.length },
    { id: "today", title: "今日更新", glyph: "sun", count: input.board.sections.A.filter(deal => !channelInfo || deal.category === channelInfo.category).length },
    { id: "for-you", title: "适合我", glyph: "radar", count: 0 },
    { id: "new", title: "回访新增", glyph: "sun", count: 0 },
    { id: "rank", title: "来源标值榜", glyph: "chart", count: input.board.sections.B.filter(deal => !channelInfo || deal.category === channelInfo.category).length },
    { id: "ending", title: "即将截止", glyph: "clock", count: endingScoped.length },
    { id: "archived", title: "已结束档案", glyph: "archive", count: scopedArchived.length },
    { id: "saved", title: "我的收藏", glyph: "bookmark", count: 0 },
  ];
  let initialCount = 0;
  const cards = deals
    .filter(deal => !channelInfo || deal.category === channelInfo.category)
    .map(deal => {
      const archived = deal.status === "archived" || archivedIds.has(deal.id);
      const hidden = archived || initialCount >= 12;
      if (!hidden) initialCount += 1;
      return renderCard(deal, {
        archived, hidden, open: input.expand && initialCount === 1 && !hidden,
        sections: (membership.get(deal.id) ?? []).join(" "),
      });
    }).join("");
  const heroTitle = channelInfo ? channelInfo.title : "全球羊毛情报中心";
  const heroEyebrow = channelInfo ? channelInfo.eyebrow : "GLOBAL DEAL HUNTER";
  const heroDescription = channelInfo
    ? channelInfo.description
    : "汇集 AI 工具、云服务、学生资源与数字优惠。先看中文简介，再按地区、期限和条件核对原文。";
  const pageTitle = channelInfo
    ? `${channelInfo.title} · GLOBAL DEAL HUNTER`
    : "全球羊毛情报中心 · GLOBAL DEAL HUNTER";
  const pageDescription = channelInfo
    ? `${channelInfo.description} 金额、资格与期限以来源原文为准。`
    : "全球羊毛情报中心：发现公开来源中的 AI 工具、云服务与数字优惠。支持中文阅读、原文对照、分类筛选和本机收藏。金额与资格以活动原文为准。";
  const scopeWord = channelInfo ? channelInfo.label : "全部";
  const otherChannel = input.channel === "ai" ? CHANNELS.cloud : input.channel === "cloud" ? CHANNELS.ai : undefined;
  const channelNote = channelInfo
    ? `<p class="collection-status channel-note"><span>${escapeHtml(channelInfo.note)}</span> <a href="/deals">查看全部情报</a>${otherChannel ? ` · <a href="${otherChannel.path}">前往${escapeHtml(otherChannel.label)}</a>` : ""}</p>`
    : "";
  // Empty-state copy is channel-aware on the server (no-JS) and re-used by the
  // shared client through these data attributes.
  const emptyTitle = channelInfo ? channelInfo.emptyTitle : "暂时没有匹配的情报";
  const emptyNote = channelInfo ? channelInfo.emptyNote : "试试更短的关键词，或清除分类与优惠类型筛选。";
  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}" data-channel="${channelInfo ? channelInfo.category : ""}" data-snapshot-at="${input.now.getTime()}"${input.updateToken === undefined ? "" : ` data-update-token="${escapeHtml(input.updateToken)}"`}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="description" content="${escapeHtml(pageDescription)}"><title>${escapeHtml(pageTitle)}</title><style>${PAGE_CSS}${NAV_CSS}</style></head>
<body><a class="skip" href="#main">跳到优惠列表</a>${renderNav({ active: channelInfo ? channelInfo.navKey : "deals", lang })}
<div class="shell">
  <aside class="sidebar"><a class="brand" href="/" aria-label="Deal Hunter 首页"><span class="brand-mark">${icon("radar")}</span><span><strong>Deal Hunter</strong><small>GLOBAL OPPORTUNITIES</small></span></a><p class="nav-label">发现 · DISCOVER</p><nav class="view-nav" aria-label="情报视图">${views.map(view => `<button class="view-tab" type="button" data-view="${view.id}" aria-pressed="${view.id === "all"}"${view.id === "new" ? " hidden" : ""}>${icon(view.glyph)}<span>${view.title}</span><b${view.id === "saved" ? ' id="saved-count"' : ""}>${view.count}</b></button>`).join("")}</nav><div class="side-note"><a href="#sources">查看来源状态 ${icon("arrow")}</a></div></aside>
  <main class="workspace" id="main"><header class="hero"><div class="hero-copy">${input.preview ? '<p class="preview-label">本机预览 · 线上数据快照 · 未触发采集或 AI 翻译</p>' : ""}<p class="eyebrow">${escapeHtml(heroEyebrow)}</p><h1>${escapeHtml(heroTitle)}</h1><p class="hero-description">${escapeHtml(heroDescription)}</p></div><div class="hero-stats" aria-label="情报概况"><div><strong>${scopedActive.length}</strong><span>${escapeHtml(scopeWord)}在册</span></div><div><strong>${ok}<span style="display:inline;font-size:16px"> / ${input.checks.length}</span></strong><span>来源最近成功</span></div></div></header>
    ${input.dbError ? '<p class="error-banner" role="alert">情报暂时无法载入，请稍后刷新重试。来源原文仍是核对活动条件的依据。</p>' : `<p class="collection-status"><a href="#sources">${escapeHtml(runStatus)}</a>${checked ? `<time datetime="${escapeHtml(checked)}">${escapeHtml(lastUpdate)}</time>` : ""}</p>`}
    ${channelNote}
    ${radarControls(input.updateToken !== undefined)}
    <section class="toolbar" aria-label="搜索与筛选"><div class="search-box">${icon("search")}<label class="sr-only" for="q">搜索标题、译文、来源或地区</label><input id="q" type="search" maxlength="160" placeholder="试试「无需绑卡的 AI 优惠」" autocomplete="off" enterkeyhint="search" aria-controls="deal-list"><button class="icon-button" id="clear-search" type="button" aria-label="清除搜索" hidden>${icon("close")}</button><kbd class="shortcut" aria-hidden="true">/</kbd></div><div class="filter-row">
      <label class="select-wrap${channelInfo ? " channel-hidden" : ""}"${channelInfo ? " hidden" : ""}><span>分类</span><select id="category" aria-label="情报分类"><option value="all">全部分类</option>${CATEGORIES.map(category => `<option value="${category}">${escapeHtml(CATEGORY_LABEL[category])}</option>`).join("")}<option value="finance">银行与卡片</option></select></label>
      <label class="select-wrap"><span>条件</span><select id="deal-type" aria-label="优惠类型"><option value="all">全部优惠类型</option>${DEAL_TYPES.map(type => `<option value="${type}">${escapeHtml(DEAL_TYPE_LABEL[type])}</option>`).join("")}</select></label>
      <label class="select-wrap sort"><span>排序</span><select id="sort" aria-label="排序方式"><option value="newest">最新动态</option><option value="rank">来源标值</option><option value="ending">截止日期</option></select></label>
      <nav class="langbar" aria-label="内容语言"><a class="zh" href="?lang=zh" data-set-lang="zh" hreflang="zh-CN" title="查看中文标题、简介与已翻译内容"${lang === "zh" ? ' aria-current="true"' : ""}>中文</a><a class="en" href="?lang=en" data-set-lang="en" hreflang="en" title="对照来源英文标题与摘要"${lang === "en" ? ' aria-current="true"' : ""}>EN 原文</a></nav>
    </div><fieldset class="evidence-filters"><legend>只看原文已注明</legend><label><input type="checkbox" data-evidence="region"> 适用地区</label><label><input type="checkbox" data-evidence="terms"> 参与条件</label><label><input type="checkbox" data-evidence="deadline"> 截止日期</label></fieldset></section>
    <div class="results-heading" id="results-heading"><div><h2 id="view-title" tabindex="-1">全部情报</h2><p id="view-note">公开来源，原文可查。金额与资格以活动页面为准。</p></div><div class="results-meta"><span id="result-status" role="status" aria-live="polite" aria-atomic="true">共 ${scopedActive.length} 条</span><button class="text-button" id="reset-filters" type="button" hidden>清除筛选</button></div></div>
    <noscript><p class="noscript">当前显示全部记录。启用 JavaScript 后可使用分类筛选、收藏与分页。</p><style>.card[hidden]{display:block!important}.view-nav,.filter-row>label,.pagination,.evidence-filters{display:none!important}</style></noscript>
    <section class="card-grid" id="deal-list" aria-label="优惠情报">${cards}</section>
    <section class="empty-state" id="empty-state"${channelInfo ? ` data-empty-title="${escapeHtml(emptyTitle)}" data-empty-note="${escapeHtml(emptyNote)}"` : ""}${scopeDeals.length ? " hidden" : ""}><div class="empty-symbol">${icon("search")}</div><h3 id="empty-title">${escapeHtml(emptyTitle)}</h3><p id="empty-note">${escapeHtml(emptyNote)}</p><button class="text-button" id="empty-reset" type="button">浏览全部情报 ${icon("arrow")}</button></section>
    <nav class="pagination" id="pagination" aria-label="列表分页" hidden><button class="page-button" id="previous-page" type="button">${icon("left")} 上一页</button><span class="page-info" id="page-info">1 / 1</span><button class="page-button" id="next-page" type="button">下一页 ${icon("right")}</button></nav>
    <details class="sources" id="sources"><summary>${icon("globe")} 来源健康与更新记录<span class="status-label">${input.checks.length ? `${ok} / ${input.checks.length} 成功` : "暂无来源记录"}</span>${icon("down")}</summary><div class="sources-body"><p>${escapeHtml(runStatus)}${checked ? ` · ${escapeHtml(lastUpdate)}` : ""}。活动资格与优惠请核对原文。</p>${sourceRows(input.checks, input.sourceSuccess)}${input.updateToken !== undefined ? '<button id="source-performance" type="button" class="text-button" hidden>查看过去 14 天的采集表现</button><div id="source-performance-results" aria-live="polite"></div>' : ""}</div></details>
    <details class="notice"><summary>关于信息、翻译与风险</summary><p>本站整理已抓取的公开来源。金额、日期、地区与条件没有写明时显示「待核实」，不补造承诺。中文标题与简介按收录原文翻译、整理，不代表重新验证活动；后台机器译文单独标注。原文变化后，旧的中文整理停止使用；没有可用译文时保留原文。Crypto、银行与卡片条目的风险和资格说明保留在详情中。来源链接去除常见跟踪与邀请参数。</p></details>
    <footer class="footer"><p>GLOBAL DEAL HUNTER</p><a href="/deals">全部情报</a><a href="#sources">来源与采集记录</a></footer>
  </main></div><div class="toast" id="toast" role="status" aria-live="polite"></div><script>${CLIENT_SCRIPT}</script></body></html>`;
}
