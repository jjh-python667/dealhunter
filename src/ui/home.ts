import { offerEvidence, REGIONS } from "../content/evidence";
import { evidenceStrength, selectFeatured } from "../content/featured";
import { chineseCopy } from "../content/locale";
import { formatWhen, isEndingSoon, shanghaiDay } from "../extract";
import { CATEGORY_LABEL, DEAL_TYPE_LABEL, show } from "../labels";
import { escapeHtml } from "../text";
import { sanitizeUrl } from "../url";
import type { DealRecord, RunRecord } from "../types";
import { HOME_CSS } from "./home-styles";
import { NAV_CSS, renderNav } from "./nav";
import { bilingual, dealIsArchived, detailPath, externalLink, icon, stamp } from "./shared";
import { PAGE_CSS } from "./styles";

export { HOME_CSS } from "./home-styles";

export type HomeInput = {
  deals: DealRecord[];
  now: Date;
  lang?: "zh" | "en";
  run?: RunRecord | null;
  error?: string;
  preview?: boolean;
};

type SiteLang = "zh" | "en";

const TITLE = "全球羊毛情报中心 · GLOBAL DEAL HUNTER";
const DESCRIPTION = "全球羊毛情报中心：公开来源中的 AI 工具、云服务、学生资源与数字优惠。中文整理 + 原文对照，金额、资格与期限以活动原文为准。";
const LATEST_LIMIT = 6;
const ENDING_LIMIT = 4;
const FOR_YOU_LIMIT = 12;

function stampOf(deal: DealRecord): number {
  return stamp(deal.publishedAt ?? deal.firstSeenAt);
}

function isActive(deal: DealRecord, now: Date): boolean {
  return !dealIsArchived(deal, now);
}

function categoryMarkup(deal: DealRecord): string {
  return `<span class="portal-cat">${escapeHtml(CATEGORY_LABEL[deal.category] ?? deal.category)}</span>`;
}

function typeChip(deal: DealRecord): string {
  return `<span class="type-chip${deal.dealType === "free" ? " free" : ""}">${escapeHtml(DEAL_TYPE_LABEL[deal.dealType])}</span>`;
}

function valueMarkup(deal: DealRecord): string {
  const copy = chineseCopy(deal);
  return bilingual(show(deal.valueText), copy.field(deal.valueText));
}

function deadlineMarkup(deal: DealRecord): string {
  return escapeHtml(deal.endsAt ? formatWhen(deal.endsAt) : show(deal.timeText));
}

function bookmarkButton(deal: DealRecord): string {
  return `<button class="icon-button bookmark" type="button" data-id="${escapeHtml(deal.id)}" aria-label="收藏这条情报" aria-pressed="false" title="收藏到此浏览器">${icon("bookmark")}</button>`;
}

/** Source excerpt: Chinese copy by default, the original excerpt when reading in EN. */
function excerptFor(deal: DealRecord, lang: SiteLang): string {
  const copy = chineseCopy(deal);
  return escapeHtml(lang === "en" ? deal.summary || copy.intro : copy.intro);
}

function publishedLabel(deal: DealRecord): string {
  const raw = deal.publishedAt ?? deal.firstSeenAt;
  const when = formatWhen(raw);
  if (!raw || !when) return "<span>收录时间待核实</span>";
  return `<span>收录 <time datetime="${escapeHtml(raw)}">${escapeHtml(when)}</time></span>`;
}

function renderPortalCard(deal: DealRecord, lang: SiteLang, now: Date, options: { forYou?: boolean } = {}): string {
  const copy = chineseCopy(deal);
  const proof = offerEvidence(deal);
  const data = options.forYou
    ? ` data-id="${escapeHtml(deal.id)}" data-category="${escapeHtml(deal.category)}" data-regions="${escapeHtml(proof.regions.join(" "))}" data-card="${proof.card}" data-renewal="${proof.renewal}" data-archived="${dealIsArchived(deal, now)}" data-starts="${stamp(deal.startsAt)}"`
    : ` data-id="${escapeHtml(deal.id)}" data-category="${escapeHtml(deal.category)}"`;
  return `<article class="portal-card"${data}>
    <div class="portal-card-top">${categoryMarkup(deal)}${typeChip(deal)}${bookmarkButton(deal)}</div>
    <h3 class="portal-card-title"><a href="${detailPath(deal.id)}">${bilingual(deal.title, copy.title)}</a></h3>
    <p class="portal-excerpt">${excerptFor(deal, lang)}</p>
    ${options.forYou ? '<p class="portal-reason" hidden></p>' : ""}
    <div class="portal-card-foot"><span class="portal-value">${valueMarkup(deal)}</span><span class="portal-card-when">${publishedLabel(deal)}</span></div>
  </article>`;
}

function renderFeaturedPrimary(deal: DealRecord, lang: SiteLang): string {
  const copy = chineseCopy(deal);
  const proof = offerEvidence(deal);
  const eligibility = show(deal.conditions || proof.eligibility);
  const regionText = show(proof.regionText);
  const verified = formatWhen(deal.lastVerifiedAt);
  const source = externalLink(deal.sourceUrl, `${icon("globe")}<span>${escapeHtml(deal.sourceName)}</span>`, "source-link");
  return `<article class="featured-primary">
    <div class="featured-body">
      <p class="featured-flag">${icon("chart")} 今日主推 · EDITOR&#39;S PICK</p>
      <div class="featured-top">${categoryMarkup(deal)}${typeChip(deal)}</div>
      <h3 class="featured-title"><a class="featured-title-link" href="${detailPath(deal.id)}">${bilingual(deal.title, copy.title)}</a></h3>
      <p class="featured-excerpt">${excerptFor(deal, lang)}</p>
      <div class="featured-meta">${source}${verified ? `<span>条目核验 <time datetime="${escapeHtml(deal.lastVerifiedAt)}">${escapeHtml(verified)}</time></span>` : "<span>最近核验时间待核实</span>"}</div>
      <div class="featured-actions">${bookmarkButton(deal)}<a class="portal-more" href="${detailPath(deal.id)}">查看详情 ${icon("arrow")}</a></div>
    </div>
    <dl class="featured-aside">
      <div class="featured-fact"><dt>优惠力度</dt><dd class="portal-value">${valueMarkup(deal)}</dd></div>
      <div class="featured-fact"><dt>领取资格</dt><dd>${escapeHtml(eligibility)}</dd></div>
      <div class="featured-fact"><dt>适用地区</dt><dd>${escapeHtml(regionText)}</dd></div>
      <div class="featured-fact"><dt>截止时间</dt><dd>${deadlineMarkup(deal)}</dd></div>
    </dl>
  </article>`;
}

function renderFeaturedSecondary(deal: DealRecord, lang: SiteLang, index: number): string {
  const copy = chineseCopy(deal);
  return `<article class="featured-secondary-card enter" data-category="${escapeHtml(deal.category)}" style="--delay:${index * 80}ms">
    <div class="portal-card-top">${categoryMarkup(deal)}${typeChip(deal)}${bookmarkButton(deal)}</div>
    <h3 class="portal-card-title"><a href="${detailPath(deal.id)}">${bilingual(deal.title, copy.title)}</a></h3>
    <p class="portal-excerpt">${excerptFor(deal, lang)}</p>
    <div class="portal-card-foot"><span class="portal-value">${valueMarkup(deal)}</span><a class="portal-cta" href="${detailPath(deal.id)}">详情 ${icon("arrow")}</a></div>
  </article>`;
}

function dayNumber(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function endingRow(deal: DealRecord, now: Date): string {
  const copy = chineseCopy(deal);
  const endsAt = deal.endsAt ?? "";
  const remaining = dayNumber(endsAt) - dayNumber(now.toISOString());
  const label = !Number.isFinite(remaining) ? "7 天内" : remaining <= 0 ? "今天截止" : remaining === 1 ? "明天截止" : `${remaining} 天后截止`;
  const hot = Number.isFinite(remaining) && remaining <= 2 ? " hot" : "";
  return `<li>
    <span class="ending-main"><a class="ending-title" href="${detailPath(deal.id)}">${bilingual(deal.title, copy.title)}</a><span class="ending-sub">${escapeHtml(CATEGORY_LABEL[deal.category])} · 截止 <time datetime="${escapeHtml(endsAt)}">${escapeHtml(formatWhen(endsAt))}</time></span></span>
    <span class="ending-days${hot}">${escapeHtml(label)}</span>
  </li>`;
}

function recommendationBoard(active: DealRecord[], now: Date, lang: SiteLang): string {
  const ranked = active
    .filter(deal => stamp(deal.startsAt) <= now.getTime() && deal.valueText.trim() && sanitizeUrl(deal.officialUrl))
    .map(deal => ({ deal, strength: evidenceStrength(deal, now), verified: stamp(deal.lastVerifiedAt) }))
    .filter(({ strength }) => strength >= 4)
    .sort((a, b) => b.strength - a.strength || b.verified - a.verified || a.deal.id.localeCompare(b.deal.id))
    .slice(0, 5);
  const rows = ranked.map(({ deal, verified }) => {
    const copy = chineseCopy(deal);
    const facts = [deal.conditions.trim() && "资格已注明", deal.regions.trim() && "地区已注明", deal.endsAt && "截止日已注明", deal.steps.trim() && "有领取步骤"].filter(Boolean);
    return `<li><div><a class="ending-title" href="${detailPath(deal.id)}">${bilingual(deal.title, copy.title)}</a>
      <span class="ending-sub">${escapeHtml([CATEGORY_LABEL[deal.category], ...facts].join(" · "))}${verified ? ` · 核验 ${escapeHtml(formatWhen(deal.lastVerifiedAt))}` : ""}</span></div><span class="portal-value">${valueMarkup(deal)}</span></li>`;
  }).join("");
  const title = lang === "en" ? "Top Recommendations" : "推荐榜";
  const note = lang === "en"
    ? "Up to five active deals, ranked by the completeness of their source evidence. Ties favor the most recently verified deals."
    : "最多 5 条。优先展示原文证据更完整的有效优惠，同等条件下按核验时间排序。";
  return `<section class="portal-section" id="recommendations" aria-labelledby="recommendations-title">
    <div class="portal-section-head"><div><h2 id="recommendations-title">${title}</h2>
    <p class="portal-section-note">${note}</p></div></div>
    ${rows ? `<ol class="recommendation-list">${rows}</ol>` : '<p class="section-empty">暂无证据足够完整的有效优惠。</p>'}
  </section>`;
}

/**
 * Up to twelve client-filterable candidates. First pass keeps one per category so
 * every category preference has something to filter; the remaining slots go to
 * the strongest deals overall, capped at three per category. A single busy
 * category can never crowd out the region / card / renewal preferences a visitor
 * saved on this browser.
 */
function forYouCandidates(deals: DealRecord[]): DealRecord[] {
  const ranked = [...deals].sort((a, b) => b.rankScore - a.rankScore || stampOf(b) - stampOf(a) || a.id.localeCompare(b.id));
  const picked: DealRecord[] = [];
  const pickedIds = new Set<string>();
  const perCategory = new Map<string, number>();
  function take(deal: DealRecord): void {
    picked.push(deal);
    pickedIds.add(deal.id);
    perCategory.set(deal.category, (perCategory.get(deal.category) ?? 0) + 1);
  }
  const seenCategory = new Set<string>();
  for (const deal of ranked) {
    if (picked.length >= FOR_YOU_LIMIT) break;
    if (seenCategory.has(deal.category)) continue;
    seenCategory.add(deal.category);
    take(deal);
  }
  for (const deal of ranked) {
    if (picked.length >= FOR_YOU_LIMIT) break;
    if (pickedIds.has(deal.id)) continue;
    if ((perCategory.get(deal.category) ?? 0) >= 3) continue;
    take(deal);
  }
  return picked;
}

function sectionHead(input: {
  number: string;
  tag: string;
  id: string;
  title: string;
  note: string;
  href: string;
  label: string;
}): string {
  return `<div class="portal-section-head">
    <div><p class="portal-kicker"><b>${escapeHtml(input.number)}</b> ${escapeHtml(input.tag)}</p><h2 id="${input.id}-title">${escapeHtml(input.title)}</h2><p class="portal-section-note">${escapeHtml(input.note)}</p></div>
    <a class="portal-section-link" href="${input.href}">${escapeHtml(input.label)} ${icon("arrow")}</a>
  </div>`;
}

/** Portal homepage, rendered without client JS. */
export function renderHome(input: HomeInput): string {
  const lang: SiteLang = input.lang === "en" ? "en" : "zh";
  const now = input.now;
  const active = input.deals.filter(deal => isActive(deal, now));
  const today = shanghaiDay(now);
  const updatedToday = active.filter(deal => {
    const when = stampOf(deal);
    return when > 0 && shanghaiDay(new Date(when)) === today;
  }).length;
  const endingSoon = active.filter(deal => isEndingSoon(deal.endsAt, now));
  const featured = selectFeatured(input.deals, now);
  const latest = [...active].sort((a, b) => stampOf(b) - stampOf(a) || a.id.localeCompare(b.id)).slice(0, LATEST_LIMIT);
  const ending = [...endingSoon]
    .sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? "") || a.id.localeCompare(b.id))
    .slice(0, ENDING_LIMIT);
  const candidates = forYouCandidates(active);
  const snapshotAt = input.run?.finishedAt ? formatWhen(input.run.finishedAt) : "";
  const runLine = input.error
    ? "首页暂时无法载入完整数据，分区可能留空。"
    : snapshotAt
      ? `数据快照 ${snapshotAt} · 金额、资格与期限以原文为准`
      : "等待首次采集 · 金额、资格与期限以原文为准";

  const hero = `<header class="portal-hero">
  <div class="portal-hero-inner">
    <div class="portal-hero-copy">
      ${input.preview ? '<p class="preview-label">本机预览 · 线上数据快照 · 未触发采集或 AI 翻译</p>' : ""}
      <p class="eyebrow">GLOBAL DEAL HUNTER</p>
      <h1 id="portal-title">全球羊毛情报中心</h1>
      <p class="portal-lede">汇集 AI 工具、云服务、学生资源与数字优惠。先看中文整理，再按地区、期限与条件核对来源原文；金额与资格以活动页面为准。</p>
      <div class="portal-quick" aria-label="热门入口"><a class="portal-chip" href="/ai-tools">AI 工具</a><a class="portal-chip" href="/cloud">云服务</a><a class="portal-chip" href="/deals?q=%E6%97%A0%E9%9C%80%E7%BB%91%E5%8D%A1">无需绑卡</a><a class="portal-chip" href="/deals?view=ending">7 天内截止</a></div>
    </div>
    <div class="portal-hero-side">
      <dl class="portal-stats" aria-label="情报概况">
        <div class="portal-stat"><dt>在册优惠</dt><dd><strong>${active.length}</strong><em>条</em></dd></div>
        <div class="portal-stat"><dt>今日更新</dt><dd><strong>${updatedToday}</strong><em>条</em></dd></div>
        <div class="portal-stat"><dt>即将截止</dt><dd><strong>${endingSoon.length}</strong><em>条</em></dd></div>
      </dl>
      <p class="portal-snapshot">${escapeHtml(runLine)}</p>
    </div>
    <form class="portal-search" action="/deals" method="get" role="search">
      ${icon("search")}<label class="sr-only" for="portal-q">搜索优惠</label><input id="portal-q" name="q" type="search" maxlength="160" placeholder="搜索优惠、地区或条件，例如「无需绑卡的学生优惠」" autocomplete="off" enterkeyhint="search"><button type="submit" aria-label="搜索全部情报">${icon("arrow")}<span>搜索</span></button>
    </form>
  </div>
</header>`;

  const errorBanner = input.error
    ? '<p class="error-banner" role="alert">首页暂时无法载入，请稍后刷新重试。来源原文仍是核对活动条件的依据。</p>'
    : "";

  const featuredHtml = featured.primary
    ? `${renderFeaturedPrimary(featured.primary, lang)}${featured.secondary.length ? `<div class="featured-secondary">${featured.secondary.map((deal, index) => renderFeaturedSecondary(deal, lang, index)).join("")}</div>` : ""}`
    : '<p class="section-empty">今日暂无证据足够完整的主推优惠。精选只展示来源原文已写明优惠力度、参与条件与期限的条目，证据不足时留空，不补造。</p>';
  const latestHtml = latest.length
    ? `<div class="portal-grid">${latest.map(deal => renderPortalCard(deal, lang, now)).join("")}</div>`
    : '<p class="section-empty">暂时没有新的在册收录。下一轮采集完成后，这里会按来源发布时间或本站首次收录时间倒序更新。</p>';
  const endingHtml = ending.length
    ? `<div class="ending-panel"><ul class="ending-list">${ending.map(deal => endingRow(deal, now)).join("")}</ul></div>`
    : '<p class="section-empty">未来 7 天内没有明确写出日历截止日的在册活动。只写了「限时」「90 天」而没有日期的条目不会出现在这里。</p>';

  const noscript = `<noscript><p class="noscript portal-noscript">当前显示服务端完整首页。启用 JavaScript 后可使用「适合我」偏好筛选、收藏到本机浏览器，以及旧链接锚点跳转；金额、资格与期限始终以来源原文为准。</p></noscript>`;
  const footer = `<footer class="portal-footer">
  <div class="portal-foot-brand"><strong>Deal Hunter</strong><small>GLOBAL DEAL HUNTER</small><p>只整理公开来源的优惠信息。金额、参与条件、适用地区与期限以活动原文为准；原文没有写明的内容显示「待核实」，不补造承诺。</p></div>
  <nav class="portal-foot-links" aria-label="页脚导航">
    <a href="/deals">全部情报 ${icon("arrow")}</a>
    <a href="/ai-tools">AI 工具</a>
    <a href="/cloud">云服务</a>
    <a href="/deals?view=archived">已结束档案</a>
    <a href="/deals#sources">来源与采集记录</a>
    <a href="/deals#alerts">站内提醒</a>
  </nav>
</footer>`;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}" data-snapshot-at="${now.getTime()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="description" content="${escapeHtml(DESCRIPTION)}"><title>${escapeHtml(TITLE)}</title><style>${PAGE_CSS}${NAV_CSS}${HOME_CSS}</style></head>
<body><a class="skip" href="#main">跳到正文</a>${renderNav({ active: "home", lang })}
<main class="portal" id="main">
${hero}
${errorBanner}
 ${recommendationBoard(active, now, lang)}
<section class="portal-section" id="today-featured" aria-labelledby="today-featured-title">${sectionHead({ number: "01", tag: "TODAY", id: "today-featured", title: "今日精选", note: "证据优先：只把来源原文写明优惠力度、参与条件与期限的条目放进精选；证据不足时整段留空。", href: "/deals", label: "浏览全部情报" })}${featuredHtml}</section>
<section class="portal-section" id="latest" aria-labelledby="latest-title">${sectionHead({ number: "02", tag: "LATEST", id: "latest", title: "最新收录", note: "按来源发布时间或本站第一次收录时间倒序，最多 6 条。", href: "/deals", label: "查看全部" })}${latestHtml}</section>
<section class="portal-section" id="ending" aria-labelledby="ending-title">${sectionHead({ number: "03", tag: "ENDING SOON", id: "ending", title: "即将截止", note: "只含未来 7 天内到期、且来源给出日历截止日的在册活动。", href: "/deals?view=ending", label: "按截止时间筛选" })}${endingHtml}</section>
<section class="portal-section" id="for-you" aria-labelledby="for-you-title">${sectionHead({ number: "04", tag: "FOR YOU", id: "for-you", title: "适合我", note: "按保存在本机浏览器的偏好筛选：常用地区、关注分类、是否需要绑卡与自动续费。偏好只存在本机。", href: "/deals#preferences", label: "设置偏好" })}
  <div class="portal-grid for-you-grid">${candidates.map(deal => renderPortalCard(deal, lang, now, { forYou: true })).join("")}</div>
  <div class="for-you-empty" hidden>
    <div class="for-you-empty-icon">${icon("radar")}</div>
    <h3 id="for-you-empty-title">还没有设置偏好</h3>
    <p id="for-you-empty-note">设置常用地区、关注分类，以及是否在意绑卡与自动续费后，这里只保留更符合你的优惠。</p>
    <a class="portal-more" href="/deals#preferences">去设置偏好 ${icon("arrow")}</a>
  </div>
</section>
${noscript}
${footer}
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>${HOME_SCRIPT}</script></body></html>`;
}

/**
 * Homepage-only client script: bookmarks (dh-saved), "适合我" preference filter
 * (dh-preferences, same shape the radar writes) and legacy hash forwarding.
 * No third-party code; every mutation is escaped by using textContent.
 */
export const HOME_SCRIPT = String.raw`
(() => {
  'use strict';
  const root = document.documentElement;
  const legacyHashes = ['#sec-a','#sec-b','#sec-c','#sec-d','#sec-e','#sec-f','#sec-g','#sec-h','#sources','#alerts','#preferences'];
  if (location.pathname === '/' && legacyHashes.includes(location.hash)) {
    location.replace('/deals' + location.search + location.hash);
    return;
  }
  const toast = document.querySelector('#toast');
  let toastTimer;
  function announce(message) {
    if (!toast) return;
    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.textContent = ''; }, 2600);
  }
  const savedKey = 'dh-saved';
  function readSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(savedKey) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string').slice(0, 1000) : []);
    } catch { return new Set(); }
  }
  let saved = readSaved();
  function storeSaved() {
    try {
      localStorage.setItem(savedKey, JSON.stringify(Array.from(saved).slice(0, 1000)));
      return true;
    } catch { return false; }
  }
  const bookmarkButtons = Array.from(document.querySelectorAll('.bookmark[data-id]'));
  function paintBookmark(button) {
    const active = saved.has(button.dataset.id);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('title', active ? '取消收藏' : '收藏到此浏览器');
  }
  bookmarkButtons.forEach(button => {
    paintBookmark(button);
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      if (!id) return;
      if (saved.has(id)) {
        saved.delete(id);
        announce(storeSaved() ? '已取消收藏' : '无法写入本机存储 · 收藏只在本次浏览有效');
      } else {
        saved.add(id);
        announce(storeSaved() ? '已收藏 · 仅此浏览器' : '无法写入本机存储 · 收藏只在本次浏览有效');
      }
      bookmarkButtons.forEach(other => { if (other.dataset.id === id) paintBookmark(other); });
    });
  });
  addEventListener('storage', event => {
    if (event.key !== savedKey) return;
    saved = readSaved();
    bookmarkButtons.forEach(paintBookmark);
  });
  const forYou = document.querySelector('#for-you');
  if (!forYou) return;
  const preferenceKey = 'dh-preferences';
  const regionLabels = ${JSON.stringify(REGIONS)};
  const snapshot = Number(root.dataset.snapshotAt) || 0;
  const grid = forYou.querySelector('.for-you-grid');
  const emptyBox = forYou.querySelector('.for-you-empty');
  const emptyTitle = forYou.querySelector('#for-you-empty-title');
  const emptyNote = forYou.querySelector('#for-you-empty-note');
  const candidates = Array.from(forYou.querySelectorAll('.for-you-grid .portal-card'));
  function readPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  function applyPreferences() {
    const preferences = readPreferences();
    const region = typeof preferences.region === 'string' ? preferences.region : '';
    const category = typeof preferences.category === 'string' ? preferences.category : '';
    const noCard = preferences.noCard === true;
    const noRenewal = preferences.noRenewal === true;
    const active = Boolean(region || category || noCard || noRenewal);
    let shown = 0;
    candidates.forEach(card => {
      card.hidden = true;
      const reasonNode = card.querySelector('.portal-reason');
      if (reasonNode) { reasonNode.hidden = true; reasonNode.textContent = ''; }
      if (!active) return;
      const regions = (card.dataset.regions || '').split(' ').filter(Boolean);
      if (region && !(regions.includes('global') || regions.includes(region))) return;
      if (category && card.dataset.category !== category) return;
      if (noCard && card.dataset.card !== 'no') return;
      if (noRenewal && card.dataset.renewal !== 'no') return;
      if (card.dataset.archived === 'true') return;
      if (Number(card.dataset.starts) > snapshot) return;
      card.hidden = false;
      shown += 1;
      if (reasonNode) {
        const reasons = [];
        if (region) reasons.push('适用' + (regionLabels[region] || region));
        if (category) reasons.push('符合关注分类');
        if (noCard) reasons.push('明确无需绑卡');
        if (noRenewal) reasons.push('明确无自动续费');
        reasonNode.textContent = reasons.join(' · ');
        reasonNode.hidden = !reasons.length;
      }
    });
    if (grid) grid.hidden = shown === 0;
    if (emptyBox) emptyBox.hidden = shown > 0;
    if (!shown && emptyTitle && emptyNote) {
      if (!active) {
        emptyTitle.textContent = '还没有设置偏好';
        emptyNote.textContent = '设置常用地区、关注分类，以及是否在意绑卡与自动续费后，这里只保留更符合你的优惠。';
      } else {
        emptyTitle.textContent = '暂时没有完全匹配偏好的优惠';
        emptyNote.textContent = '可以放宽地区或分类，或到「全部情报」按条件继续筛选。';
      }
    }
  }
  applyPreferences();
  addEventListener('storage', event => { if (event.key === preferenceKey) applyPreferences(); });
})();
`;
