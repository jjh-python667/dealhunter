import { SECTION_META } from "./board";
import { formatWhen, showSchedule } from "./extract";
import { CATEGORY_LABEL, DEAL_TYPE_LABEL, show } from "./labels";
import { escapeHtml } from "./text";
import type { Board, BoardSectionId, DealRecord, RunRecord, SourceCheck } from "./types";

const SECTION_ORDER: BoardSectionId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

function clock(now: Date): string {
  return `${formatWhen(now.toISOString())}`;
}

/** Original text plus an optional Chinese translation; CSS on <html data-lang> picks one. */
export function bilingual(original: string, zh: string | undefined): string {
  if (!zh || !zh.trim()) return escapeHtml(original);
  return `<span class="t-en" lang="en">${escapeHtml(original)}</span><span class="t-zh" lang="zh-CN">${escapeHtml(zh)}</span>`;
}

export function hasTranslation(deal: DealRecord): boolean {
  return Boolean(deal.zhTitle?.trim() || deal.zhSummary?.trim());
}

function card(deal: DealRecord, options: { open: boolean; rank?: number }): string {
  const value = show(deal.valueText);
  const schedule = showSchedule(deal);
  const searchable = escapeHtml(
    `${deal.title} ${deal.summary} ${deal.zhTitle ?? ""} ${deal.zhSummary ?? ""} ${deal.sourceName} ${CATEGORY_LABEL[deal.category]} ${DEAL_TYPE_LABEL[deal.dealType]} ${deal.category}`.toLowerCase(),
  );
  const link = deal.officialUrl
    ? `<a href="${escapeHtml(deal.officialUrl)}" rel="noopener noreferrer">${escapeHtml(deal.officialUrl)}</a>`
    : "待核实";
  const source = `<a href="${escapeHtml(deal.sourceUrl)}" rel="noopener noreferrer">${escapeHtml(deal.sourceName)}</a>`;
  const risk = deal.riskNote ? `<p class="risk">${escapeHtml(deal.riskNote)}</p>` : "";
  const reason = deal.archiveReason ? `<p class="reason">归档原因：${escapeHtml(deal.archiveReason)}</p>` : "";
  const rank = options.rank ? `<span class="rank">${String(options.rank).padStart(2, "0")}</span>` : "";
  return `<article class="card" data-text="${searchable}">
    <div class="chips">
      ${rank}
      <span class="chip cat">${escapeHtml(CATEGORY_LABEL[deal.category])}</span>
      <span class="chip type">${escapeHtml(DEAL_TYPE_LABEL[deal.dealType])}</span>
      <span class="chip value">${escapeHtml(value)}</span>
      ${hasTranslation(deal) ? `<span class="chip mt t-zh" title="Workers AI m2m100 机器翻译，以英文原文为准">机器翻译</span>` : ""}
    </div>
    <h3>${bilingual(deal.title, deal.zhTitle)}</h3>
    <p class="excerpt">${bilingual(deal.summary, deal.zhSummary)}</p>
    <dl class="quick">
      <div><dt>实际价值</dt><dd>${escapeHtml(value)}</dd></div>
      <div><dt>时间</dt><dd>${escapeHtml(schedule)}</dd></div>
      <div><dt>地区</dt><dd>${escapeHtml(show(deal.regions))}</dd></div>
      <div><dt>来源</dt><dd>${source}</dd></div>
    </dl>
    ${risk}
    ${reason}
    <details${options.open ? " open" : ""}>
      <summary>查看规格里的 12 个字段</summary>
      <dl class="full">
        <div><dt>活动名称</dt><dd>${bilingual(deal.title, deal.zhTitle)}</dd></div>
        <div><dt>所属类别</dt><dd>${escapeHtml(CATEGORY_LABEL[deal.category])}</dd></div>
        <div><dt>优惠内容</dt><dd>${deal.summary ? bilingual(deal.summary, deal.zhSummary) : escapeHtml(show(deal.summary))}</dd></div>
        <div><dt>实际价值</dt><dd>${escapeHtml(value)}</dd></div>
        <div><dt>参与条件</dt><dd>${escapeHtml(show(deal.conditions))}</dd></div>
        <div><dt>适用国家或地区</dt><dd>${escapeHtml(show(deal.regions))}</dd></div>
        <div><dt>开始及截止时间</dt><dd>${escapeHtml(schedule)}</dd></div>
        <div><dt>参与步骤</dt><dd class="pre">${escapeHtml(show(deal.steps))}</dd></div>
        <div><dt>官方活动链接</dt><dd>${link}</dd></div>
        <div><dt>信息来源</dt><dd>${source}<br>${escapeHtml(deal.sourceUrl)}</dd></div>
        <div><dt>最后验证时间</dt><dd>${escapeHtml(formatWhen(deal.lastVerifiedAt))}</dd></div>
        <div><dt>风险提示</dt><dd>${escapeHtml(show(deal.riskNote))}</dd></div>
        <div><dt>优惠类型</dt><dd>${escapeHtml(DEAL_TYPE_LABEL[deal.dealType])}</dd></div>
      </dl>
    </details>
  </article>`;
}

function section(id: BoardSectionId, deals: DealRecord[], expand: boolean): string {
  const meta = SECTION_META[id];
  const body = deals.length
    ? deals.map((deal, index) => card(deal, { open: expand && index === 0, rank: id === "B" ? index + 1 : undefined })).join("")
    : `<p class="empty">此分区还没有条目。采集只保留来源原文里对得上优惠表述的内容；来源没写的字段会显示「待核实」，不会补造。</p>`;
  return `<section class="panel" id="sec-${id.toLowerCase()}">
    <header>
      <span class="letter">${id}</span>
      <div>
        <h2>${escapeHtml(meta.title)}</h2>
        <p>${escapeHtml(meta.note)}</p>
      </div>
      <b>${deals.length}</b>
    </header>
    ${body}
  </section>`;
}

function sourceRows(checks: SourceCheck[]): string {
  if (!checks.length) return `<p class="empty">还没有采集记录。本地可调用定时处理器或管理接口跑一轮。</p>`;
  return `<div class="table">${checks
    .map((check) => {
      const state = check.ok ? "ok" : "bad";
      return `<div class="row ${state}">
        <strong>${escapeHtml(check.sourceId)}</strong>
        <a href="${escapeHtml(check.sourceUrl)}" rel="noopener noreferrer">${escapeHtml(check.sourceUrl)}</a>
        <span>HTTP ${check.httpStatus ?? "—"}</span>
        <span>看到 ${check.itemsSeen}</span>
        <span>收录 ${check.itemsKept}</span>
        <span>${escapeHtml(check.error || (check.ok ? "已抓取" : "失败"))}</span>
      </div>`;
    })
    .join("")}</div>`;
}

export function renderPage(input: {
  board: Board;
  checks: SourceCheck[];
  run: RunRecord | null;
  now: Date;
  expand: boolean;
  dbError?: string;
  lang?: "zh" | "en";
}): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const active = input.board.activeCount;
  const failed = input.checks.filter((check) => !check.ok).length;
  const runLine = input.run
    ? `最近一轮 ${escapeHtml(formatWhen(input.run.finishedAt ?? input.run.startedAt))} · ${escapeHtml(input.run.trigger)} · 新增 ${input.run.inserted} · 更新 ${input.run.updated} · 归档 ${input.run.archived}`
    : "还没有跑过采集。";
  const feed = input.board.feed.length
    ? input.board.feed.map((deal, index) => card(deal, { open: input.expand && index === 0 })).join("")
    : `<p class="empty">情报流是空的。把迁移跑完并触发一次采集后，这里只会出现从来源原文抽出的条目。</p>`;
  const error = input.dbError ? `<p class="banner bad">${escapeHtml(input.dbError)}</p>` : "";
  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GLOBAL DEAL HUNTER｜全球羊毛情报中心</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #071018;
      --ink: #e7eef6;
      --muted: #93a4b5;
      --line: #243444;
      --panel: #101922;
      --gold: #e2b15a;
      --cyan: #86d0c6;
      --rose: #e59a92;
      --ok: #9dcf8a;
    }
    * { box-sizing: border-box; }
    html[data-lang="zh"] .t-en, html[data-lang="en"] .t-zh { display: none; }
    .langbar { display: inline-flex; gap: 0; margin: 10px 0 0; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
    .langbar a { padding: 4px 14px; text-decoration: none; color: var(--muted); font-size: 14px; background: #0d1720; }
    html[data-lang="zh"] .langbar .zh, html[data-lang="en"] .langbar .en { background: var(--gold); color: #1a1206; font-weight: 700; }
    .chip.mt { color: #c9b8f0; border-color: #4b3f6b; }
    body {
      margin: 0;
      background:
        radial-gradient(900px 420px at 0% -10%, rgba(226, 177, 90, 0.08), transparent 55%),
        radial-gradient(800px 480px at 100% 0%, rgba(134, 208, 198, 0.07), transparent 50%),
        var(--bg);
      color: var(--ink);
      font: 16px/1.55 "Segoe UI", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    }
    a { color: var(--cyan); overflow-wrap: anywhere; }
    h3, p, dd, .excerpt, .row { overflow-wrap: anywhere; }
    .row, .card, .panel, .feed, .sources { min-width: 0; }
    header.top, .wrap { width: min(1180px, calc(100% - 28px)); margin: 0 auto; }
    header.top { padding: 28px 0 8px; }
    .eyebrow { margin: 0; letter-spacing: 0.18em; font-size: 12px; color: var(--gold); font-family: ui-monospace, monospace; }
    h1 { margin: 6px 0 0; font-size: clamp(28px, 4vw, 44px); letter-spacing: 0.04em; font-weight: 760; }
    .sub { margin: 4px 0 0; font-size: 20px; }
    .clock { color: var(--muted); margin: 8px 0 0; font-family: ui-monospace, monospace; font-size: 13px; }
    .banner { width: min(1180px, calc(100% - 28px)); margin: 14px auto; padding: 12px 14px; border: 1px solid var(--line); background: #12202a; border-radius: 12px; color: #d5e0ea; }
    .banner.bad { border-color: var(--rose); }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
    .stat b { display: block; font-size: 22px; color: var(--gold); }
    .stat span { color: var(--muted); font-size: 13px; }
    .jump { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0; }
    .jump a { text-decoration: none; color: var(--ink); border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; background: #0d1720; }
    .layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .feed, .panel, .sources { background: rgba(16, 25, 34, 0.92); border: 1px solid var(--line); border-radius: 16px; padding: 14px; }
    .feed { border-top: 3px solid var(--gold); }
    .panel { border-top: 3px solid var(--cyan); }
    .feed h2, .kicker { font-family: ui-monospace, monospace; letter-spacing: 0.14em; font-size: 13px; margin: 0; color: var(--gold); }
    .feed > p, .panel header p, .sources > p.lead { color: var(--muted); margin: 4px 0 12px; }
    .panel header { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: start; }
    .panel h2 { margin: 0; font-size: 18px; }
    .letter { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; background: #1b2834; color: var(--gold); font-family: ui-monospace, monospace; }
    .card { border-top: 1px solid var(--line); padding: 12px 0; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .chip, .rank { font-size: 12px; border-radius: 999px; padding: 2px 8px; border: 1px solid var(--line); color: var(--muted); }
    .chip.value, .rank { color: var(--gold); border-color: #6d5730; }
    .chip.type { color: var(--cyan); }
    h3 { margin: 8px 0 4px; font-size: 17px; line-height: 1.35; }
    .excerpt { margin: 0 0 8px; color: #d5e0ea; }
    .quick, .full { display: grid; gap: 6px; margin: 0; }
    .quick div, .full div { display: grid; grid-template-columns: 7.5em 1fr; gap: 8px; }
    dt { color: var(--muted); }
    dd { margin: 0; overflow-wrap: anywhere; }
    .pre { white-space: pre-wrap; }
    .risk { margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: #2a1c1c; color: #f0d2ce; }
    .reason { color: var(--muted); font-size: 13px; }
    details { margin-top: 6px; }
    summary { cursor: pointer; color: var(--cyan); }
    .empty { color: var(--muted); }
    .search { width: 100%; margin: 8px 0 0; background: #0c141c; color: var(--ink); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
    .sources { margin: 16px 0 28px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 10px 0; border-top: 1px solid var(--line); }
    .row.bad strong { color: var(--rose); }
    .row.ok strong { color: var(--ok); }
    footer { width: min(1180px, calc(100% - 28px)); margin: 0 auto 32px; color: var(--muted); font-size: 13px; }
    @media (min-width: 980px) {
      .layout { grid-template-columns: 380px 1fr; align-items: start; }
      .feed { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow: auto; }
      .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .panel:nth-child(1), .panel:nth-child(2) { grid-column: span 1; }
    }
    @media (max-width: 720px) {
      .stats { grid-template-columns: 1fr 1fr; }
      .quick div, .full div { grid-template-columns: 1fr; gap: 2px; }
    }
  </style>
</head>
<body>
  <header class="top">
    <p class="eyebrow">INTEL FEED · PUBLIC READ</p>
    <h1>GLOBAL DEAL HUNTER</h1>
    <p class="sub">全球羊毛情报中心</p>
    <p class="clock">${escapeHtml(clock(input.now))} · ${runLine}</p>
    <nav class="langbar" aria-label="语言 Language">
      <a class="zh" href="?lang=zh" data-set-lang="zh" hreflang="zh-CN">中文</a><a class="en" href="?lang=en" data-set-lang="en" hreflang="en">EN 原文</a>
    </nav>
  </header>
  ${error}
  <p class="banner">本站只转写已经抓到的公开来源原文。金额、截止日期、地区和条件，来源没写就标「待核实」，不估算、不翻译成新的承诺。加密资产、银行和虚拟卡条目带有固定风险提示，不构成投资、开户或办卡建议。常见跟踪参数和邀请链接会被去掉。</p>
  <div class="wrap">
    <section class="stats">
      <div class="stat"><b>${active}</b><span>在册未归档</span></div>
      <div class="stat"><b>${input.board.sections.A.length}</b><span>今日（北京时间）</span></div>
      <div class="stat"><b>${input.board.sections.H.length}</b><span>已结束档案</span></div>
      <div class="stat"><b>${input.checks.length - failed}/${input.checks.length || 0}</b><span>最近一轮来源成功</span></div>
    </section>
    <nav class="jump" aria-label="分区">
      ${SECTION_ORDER.map((id) => `<a href="#sec-${id.toLowerCase()}">${id} ${escapeHtml(SECTION_META[id].title)}</a>`).join("")}
    </nav>
    <label class="clock" for="q">筛选情报流和分区</label>
    <input id="q" class="search" type="search" placeholder="按标题、来源或类别过滤，例如 Claude、银行、VPS" autocomplete="off">
    <div class="layout">
      <section class="feed" id="feed">
        <h2>INTEL FEED</h2>
        <p>情报流按来源发布时间或首次收录时间排列，包含全部 7 个类别。软件与数字服务、其他类别没有单独字母区，在这里和 A、B、G、H 中出现。</p>
        ${feed}
      </section>
      <div class="panels">
        ${SECTION_ORDER.map((id) => section(id, input.board.sections[id], false)).join("")}
      </div>
    </div>
    <section class="sources">
      <h2 class="kicker">SOURCES</h2>
      <p class="lead">最近一轮每个种子来源的 HTTP 结果。失败的来源不会用猜测补条目。</p>
      ${sourceRows(input.checks)}
    </section>
  </div>
  <footer>
    <p>定时采集为 Cron <code>0 */2 * * *</code>（UTC，每 2 小时）。公开页面只读。手动采集需要 <code>ADMIN_TOKEN</code>，令牌不会写进页面。</p>
  </footer>
  <script>
    const root = document.documentElement;
    const saved = new URLSearchParams(location.search).get("lang") || localStorage.getItem("dh-lang");
    if (saved === "zh" || saved === "en") root.dataset.lang = saved;
    document.querySelectorAll("[data-set-lang]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        const next = node.getAttribute("data-set-lang") === "en" ? "en" : "zh";
        root.dataset.lang = next;
        try { localStorage.setItem("dh-lang", next); } catch {}
      });
    });
    const q = document.querySelector("#q");
    q?.addEventListener("input", () => {
      const needle = q.value.trim().toLowerCase();
      document.querySelectorAll(".card").forEach((node) => {
        const text = node.getAttribute("data-text") || "";
        node.hidden = Boolean(needle) && !text.includes(needle);
      });
    });
  </script>
</body>
</html>`;
}
