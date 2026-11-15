import { escapeHtml } from "../text";
import { icon } from "./shared";

export type NavKey = "home" | "ai-tools" | "cloud" | "deals" | "detail";
export type SiteLang = "zh" | "en";

const PRIMARY: Array<{ key: NavKey; href: string; zh: string; en: string }> = [
  { key: "home", href: "/", zh: "首页", en: "Home" },
  { key: "ai-tools", href: "/ai-tools", zh: "AI 工具", en: "AI tools" },
  { key: "cloud", href: "/cloud", zh: "云服务", en: "Cloud" },
];

const TOOLS: Array<{ href: string; zh: string; en: string; glyph: string; key: string }> = [
  { href: "/deals?focus=search", zh: "搜索", en: "Search", glyph: "search", key: "search" },
  { href: "/deals?view=saved", zh: "收藏", en: "Saved", glyph: "bookmark", key: "saved" },
  { href: "/deals#alerts", zh: "提醒", en: "Alerts", glyph: "bell", key: "alerts" },
];

/**
 * Top navigation shared by every public page. The three discovery channels come
 * first, then the personal tools (search / saved / reminders), then language.
 * The language control stays visible on a phone; it only gets shorter.
 */
export function renderNav(input: { active: NavKey; lang?: SiteLang }): string {
  const lang: SiteLang = input.lang === "en" ? "en" : "zh";
  const labelOf = (item: { zh: string; en: string }) => item[lang];
  const primary = PRIMARY.map((item) => {
    const current = item.key === input.active ? ' aria-current="page"' : "";
    return `<a class="topnav-link" href="${item.href}" data-nav="${item.key}"${current}>${escapeHtml(labelOf(item))}</a>`;
  }).join("");
  const tools = TOOLS.map((item) => {
    const label = labelOf(item);
    return `<a class="topnav-tool" href="${item.href}" data-nav-tool="${item.key}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon(item.glyph)}<span>${escapeHtml(label)}</span></a>`;
  }).join("");
  const langLinks = (["zh", "en"] as const).map((code) => {
    const full = code === "zh" ? "中文" : "EN";
    const short = code === "zh" ? "中" : "EN";
    const current = code === lang ? ' aria-current="true"' : "";
    return `<a class="topnav-lang-link" href="?lang=${code}" hreflang="${code === "zh" ? "zh-CN" : "en"}" data-set-lang-server="${code}"${current}><span class="lang-full">${full}</span><span class="lang-short">${short}</span></a>`;
  }).join("");
  const brand = lang === "en" ? "Deal Hunter home" : "Deal Hunter 首页";
  const channels = lang === "en" ? "Offer channels" : "优惠频道";
  const personal = lang === "en" ? "Personal tools" : "个人工具";
  const language = lang === "en" ? "Content language" : "内容语言";
  const tagline = lang === "en" ? "GLOBAL DEAL HUNTER" : "全球羊毛情报中心";
  return `<header class="topnav" data-active="${input.active}">
  <div class="topnav-inner">
    <a class="topnav-brand" href="/" aria-label="${escapeHtml(brand)}"><span class="topnav-mark">${icon("radar")}</span><span class="topnav-wordmark"><strong>Deal Hunter</strong><small>${tagline}</small></span></a>
    <nav class="topnav-primary" aria-label="${escapeHtml(channels)}">${primary}</nav>
    <div class="topnav-tools"><nav class="topnav-tool-links" aria-label="${escapeHtml(personal)}">${tools}</nav><nav class="topnav-langs" aria-label="${escapeHtml(language)}">${langLinks}</nav></div>
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
.topnav-lang-link:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.topnav-lang-link[aria-current="true"]{background:#e9bd761d;color:var(--gold)}
.lang-short{display:none}
@media(max-width:1000px){.topnav-inner{gap:16px;padding:8px 24px}.topnav-tool span{display:none}.topnav-tool{padding:6px 8px}}
@media(max-width:720px){.topnav-inner{gap:10px;padding:8px 16px;min-height:56px}.topnav-wordmark small{display:none}.topnav-mark{width:30px;height:30px}.topnav-primary{gap:2px}.topnav-link{padding:8px 9px;font-size:12px;min-height:40px}.topnav-langs{display:flex;flex-shrink:0}.topnav-lang-link{padding:4px 6px;min-height:40px}.lang-full{display:none}.lang-short{display:inline}}
@media(max-width:480px){.topnav-wordmark{display:none}.topnav-inner{padding:8px 12px;gap:8px}.topnav-link{padding:8px 8px}.topnav-langs{display:flex;flex-shrink:0}.topnav-lang-link{padding:4px 6px;min-height:40px}}
@media(max-width:420px){.topnav-wordmark strong{font-size:13px}.topnav-link{padding:8px 7px}.topnav-tools{gap:4px}.topnav-tool{min-height:40px}}
@media(prefers-reduced-motion:reduce){.topnav{backdrop-filter:none;-webkit-backdrop-filter:none}}
`;
