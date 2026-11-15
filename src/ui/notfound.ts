import { escapeHtml } from "../text";
import { htmlLang } from "./document";
import { NAV_CSS, renderNav } from "./nav";
import { PAGE_CSS } from "./styles";

type SiteLang = "zh" | "en";
export type NotFoundKind = "deal" | "page";

function notFoundKind(input: { path?: string; kind?: NotFoundKind }): NotFoundKind {
  if (input.kind === "deal" || input.kind === "page") return input.kind;
  return input.path?.startsWith("/deal/") ? "deal" : "page";
}

function shell(input: {
  lang: SiteLang;
  preview?: boolean;
  title: string;
  description: string;
  skip: string;
  eyebrow: string;
  h1: string;
  body: string;
  links: string;
}): string {
  return `<!DOCTYPE html>
<html lang="${htmlLang(input.lang)}" data-lang="${input.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="robots" content="noindex"><meta name="description" content="${escapeHtml(input.description)}"><title>${escapeHtml(input.title)}</title><style>${PAGE_CSS}${NAV_CSS}${NOT_FOUND_CSS}</style></head>
<body><a class="skip" href="#main">${escapeHtml(input.skip)}</a>${renderNav({ active: "detail", lang: input.lang })}
<main class="notfound" id="main">
  ${input.preview ? '<p class="preview-label">本机预览 · 线上数据快照</p>' : ""}
  <p class="eyebrow">${escapeHtml(input.eyebrow)}</p>
  <h1>${escapeHtml(input.h1)}</h1>
  <p>${input.body}</p>
  <div class="notfound-links">${input.links}</div>
</main></body></html>`;
}

function buttons(links: Array<[string, string]>): string {
  return links.map(([href, label]) => `<a class="page-button" href="${href}">${escapeHtml(label)}</a>`).join("");
}

/** Friendly HTML 404. A missing deal and an unknown page are different events. */
export function renderNotFound(input: { lang?: SiteLang; path?: string; kind?: NotFoundKind; preview?: boolean }): string {
  const lang: SiteLang = input.lang === "en" ? "en" : "zh";
  const kind = notFoundKind(input);
  const path = input.path ? escapeHtml(input.path) : "";
  if (kind === "deal") {
    if (lang === "en") {
      return shell({
        lang,
        preview: input.preview,
        title: "This offer was not found · GLOBAL DEAL HUNTER",
        description: "This offer link does not exist, or the offer has been archived.",
        skip: "Skip to content",
        eyebrow: "404 · NOT FOUND",
        h1: "This offer was not found",
        body: `${path ? `No record exists for <code>${path}</code>. ` : "No record exists for this link. "}It may have expired or was never listed. Ended offers can still be opened from the archive.`,
        links: buttons([["/deals", "Browse all deals"], ["/", "Back to home"], ["/deals?view=archived", "View ended archive"]]),
      });
    }
    return shell({
      lang,
      preview: input.preview,
      title: "没有找到这条优惠 · GLOBAL DEAL HUNTER",
      description: "这条优惠链接不存在，或已经收进档案。",
      skip: "跳到正文",
      eyebrow: "404 · NOT FOUND",
      h1: "没有找到这条优惠",
      body: `${path ? `链接 <code>${path}</code> 对应的记录不存在，` : "这条链接对应的记录不存在，"}可能已经失效或从未收录。已结束的优惠仍然可以从「全部情报」的档案视图打开。`,
      links: buttons([["/deals", "浏览全部情报"], ["/", "回到首页"], ["/deals?view=archived", "查看已结束档案"]]),
    });
  }
  if (lang === "en") {
    return shell({
      lang,
      preview: input.preview,
      title: "Page not found · GLOBAL DEAL HUNTER",
      description: "This page does not exist. Go back home or browse all deals.",
      skip: "Skip to content",
      eyebrow: "404 · NOT FOUND",
      h1: "Page not found",
      body: `${path ? `The page <code>${path}</code> does not exist. ` : "This page does not exist. "}You can go back home or browse all deals.`,
      links: buttons([["/", "Back to home"], ["/deals", "Browse all deals"]]),
    });
  }
  return shell({
    lang,
    preview: input.preview,
    title: "没有找到这个页面 · GLOBAL DEAL HUNTER",
    description: "这个页面不存在。可以回到首页，或打开全部情报。",
    skip: "跳到正文",
    eyebrow: "404 · NOT FOUND",
    h1: "没有找到这个页面",
    body: `${path ? `页面 <code>${path}</code> 不存在。` : "这个页面不存在。"}可以回到首页，或到全部情报里继续查找。`,
    links: buttons([["/", "回到首页"], ["/deals", "浏览全部情报"]]),
  });
}

export const NOT_FOUND_CSS = String.raw`
.notfound{max-width:760px;margin:0 auto;padding:72px 24px 96px}
.notfound h1{font-size:clamp(30px,5vw,44px);letter-spacing:-.04em;margin:0 0 14px}
.notfound p{color:var(--muted);font-size:15px;line-height:1.9;max-width:620px}
.notfound code{color:var(--gold);overflow-wrap:anywhere}
.notfound-links{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.notfound-links a{text-decoration:none}
@media(max-width:600px){.notfound{padding:44px 16px 72px}.notfound-links a{flex:1 1 calc(50% - 10px);min-width:0}}
`;

/**
 * 503: the deal URL itself is valid, but the data store could not be read.
 * Serving the 404 page here would wrongly tell visitors the offer is gone.
 */
export function renderServiceUnavailable(input: { lang?: SiteLang; path?: string; preview?: boolean }): string {
  const lang: SiteLang = input.lang === "en" ? "en" : "zh";
  const path = input.path ? escapeHtml(input.path) : "";
  if (lang === "en") {
    return shell({
      lang,
      preview: input.preview,
      title: "Data is temporarily unavailable · GLOBAL DEAL HUNTER",
      description: "The data is temporarily unavailable. This is not an expired offer.",
      skip: "Skip to content",
      eyebrow: "503 · SERVICE UNAVAILABLE",
      h1: "Data is temporarily unavailable. Please try again shortly.",
      body: "This offer page could not be read from the database. The link has not expired, and you do not need to save it again. Refresh in a moment. If it stays unavailable, browse all deals and check the source.",
      links: `${path ? `<a class="page-button" href="${path}">Reload</a>` : ""}${buttons([["/deals", "Browse all deals"], ["/", "Back to home"]])}`,
    });
  }
  return shell({
    lang,
    preview: input.preview,
    title: "数据暂时不可用 · GLOBAL DEAL HUNTER",
    description: "数据暂时不可用，请稍后再试。",
    skip: "跳到正文",
    eyebrow: "503 · SERVICE UNAVAILABLE",
    h1: "数据暂时不可用，请稍后再试",
    body: "这条优惠的页面暂时无法从数据库读取，但不是链接失效，也不需要重新收藏。请稍后刷新重试；如果一直不恢复，可以先浏览全部情报核对来源原文。",
    links: `${path ? `<a class="page-button" href="${path}">重新加载</a>` : ""}${buttons([["/deals", "浏览全部情报"], ["/", "回到首页"]])}`,
  });
}
