import { escapeHtml } from "../text";
import { icon } from "./shared";

export type NavKey = "home" | "ai-tools" | "cloud" | "deals" | "detail";
export type SiteLang = "zh" | "en";

const PRIMARY: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "home", href: "/", label: "首页" },
  { key: "ai-tools", href: "/ai-tools", label: "AI 工具" },
  { key: "cloud", href: "/cloud", label: "云服务" },
];

const TOOLS: Array<{ href: string; label: string; glyph: string; key: string }> = [
  { href: "/deals?focus=search", label: "搜索", glyph: "search", key: "search" },
  { href: "/deals?view=saved", label: "收藏", glyph: "bookmark", key: "saved" },
  { href: "/deals#alerts", label: "提醒", glyph: "bell", key: "alerts" },
];

/**
 * Top navigation shared by every public page. The three discovery channels come
 * first, then the personal tools (search / saved / reminders), then language.
 */
export function renderNav(input: { active: NavKey; lang?: SiteLang }): string {
  const lang: SiteLang = input.lang === "en" ? "en" : "zh";
  const primary = PRIMARY.map((item) => {
    const current = item.key === input.active ? ' aria-current="page"' : "";
    return `<a class="topnav-link" href="${item.href}" data-nav="${item.key}"${current}>${escapeHtml(item.label)}</a>`;
  }).join("");
  const tools = TOOLS.map((item) => `<a class="topnav-tool" href="${item.href}" data-nav-tool="${item.key}" aria-label="${escapeHtml(item.label)}" title="${escapeHtml(item.label)}">${icon(item.glyph)}<span>${escapeHtml(item.label)}</span></a>`).join("");
  const langLinks = ["zh", "en"].map((code) => {
    const label = code === "zh" ? "中文" : "EN";
    const current = code === lang ? ' aria-current="true"' : "";
    return `<a class="topnav-lang-link" href="?lang=${code}" hreflang="${code === "zh" ? "zh-CN" : "en"}" data-set-lang-server="${code}"${current}>${label}</a>`;
  }).join("");
  return `<header class="topnav" data-active="${input.active}">
  <div class="topnav-inner">
    <a class="topnav-brand" href="/" aria-label="Deal Hunter 首页"><span class="topnav-mark">${icon("radar")}</span><span class="topnav-wordmark"><strong>Deal Hunter</strong><small>全球羊毛情报中心</small></span></a>
    <nav class="topnav-primary" aria-label="优惠频道">${primary}</nav>
    <div class="topnav-tools"><nav class="topnav-tool-links" aria-label="个人工具">${tools}</nav><nav class="topnav-langs" aria-label="内容语言">${langLinks}</nav></div>
  </div>
</header>`;
}

export const NAV_CSS = String.raw`
.topnav{position:sticky;top:0;z-index:30;border-bottom:1px solid #26323dcc;background:#090f15e8;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.topnav-inner{max-width:1480px;margin:0 auto;display:flex;align-items:center;gap:26px;padding:9px 36px;min-height:62px}
.topnav-brand{display:flex;align-items:center;gap:10px;color:var(--ink);flex-shrink:0}
.topnav-brand:hover{text-decoration:none}
.topnav-mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid #bd98544d;border-radius:10px;background:linear-gradient(145deg,#e9bd7626,#e9bd7605);color:var(--gold)}
.topnav-mark svg{width:19px;height:19px}
.topnav-wordmark strong{display:block;font-size:15px;letter-spacing:.02em;line-height:1.2}
.topnav-wordmark small{display:block;font-size:9px;letter-spacing:.14em;color:var(--muted);margin-top:2px}
.topnav-primary{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none}
.topnav-primary::-webkit-scrollbar{display:none}
.topnav-link{position:relative;display:inline-flex;align-items:center;min-height:42px;padding:8px 13px;border-radius:9px;color:#b9c6d2;font-size:13px;white-space:nowrap;transition:color var(--quick),background var(--quick)}
.topnav-link:hover{color:var(--ink);background:#ffffff06;text-decoration:none}
.topnav-link[aria-current="page"]{color:var(--gold);background:#e9bd7614}
.topnav-link[aria-current="page"]:after{content:"";position:absolute;left:13px;right:13px;bottom:2px;height:1px;background:var(--gold);opacity:.65}
.topnav-tools{display:flex;align-items:center;gap:10px;margin-left:auto;flex-shrink:0}
.topnav-tool-links{display:flex;align-items:center;gap:2px}
.topnav-tool{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:6px 10px;border-radius:9px;color:#a9b8c6;font-size:12px}
.topnav-tool:hover{color:var(--gold);background:#ffffff05;text-decoration:none}
.topnav-tool svg{width:16px;height:16px}
.topnav-langs{display:flex;align-items:center;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.topnav-lang-link{display:grid;place-items:center;min-height:36px;padding:4px 9px;color:var(--muted);font-size:11px}
.topnav-lang-link:hover{color:var(--gold);text-decoration:none}
.topnav-lang-link[aria-current="true"]{background:#e9bd761d;color:var(--gold)}
@media(max-width:1000px){.topnav-inner{gap:16px;padding:8px 24px}.topnav-tool span{display:none}.topnav-tool{padding:6px 8px}}
@media(max-width:720px){.topnav-inner{gap:10px;padding:8px 16px;min-height:56px}.topnav-wordmark small{display:none}.topnav-mark{width:30px;height:30px}.topnav-primary{gap:2px}.topnav-link{padding:8px 9px;font-size:12px;min-height:40px}.topnav-langs{display:none}}
@media(max-width:480px){.topnav-wordmark{display:none}.topnav-inner{padding:8px 12px;gap:8px}.topnav-link{padding:8px 8px}}
@media(max-width:420px){.topnav-wordmark strong{font-size:13px}.topnav-link{padding:8px 7px}.topnav-tools{gap:4px}.topnav-tool{min-height:40px}}
@media(prefers-reduced-motion:reduce){.topnav{backdrop-filter:none;-webkit-backdrop-filter:none}}
`;
