import { escapeHtml } from "../text";
import { NAV_CSS, renderNav } from "./nav";
import { PAGE_CSS } from "./styles";

/** Friendly HTML 404. Missing deals are a normal visitor event, not an API error. */
export function renderNotFound(input: { lang?: "zh" | "en"; path?: string; preview?: boolean }): string {
  const lang = input.lang === "en" ? "en" : "zh";
  const path = input.path ? escapeHtml(input.path) : "";
  return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#090f15"><meta name="robots" content="noindex"><meta name="description" content="这条优惠链接不存在，或已经收进档案。"><title>没有找到这条优惠 · GLOBAL DEAL HUNTER</title><style>${PAGE_CSS}${NAV_CSS}${NOT_FOUND_CSS}</style></head>
<body><a class="skip" href="#main">跳到正文</a>${renderNav({ active: "detail", lang })}
<main class="notfound" id="main">
  ${input.preview ? '<p class="preview-label">本机预览 · 线上数据快照</p>' : ""}
  <p class="eyebrow">404 · NOT FOUND</p>
  <h1>没有找到这条优惠</h1>
  <p>${path ? `链接 <code>${path}</code> 对应的记录不存在，` : "这条链接对应的记录不存在，"}可能已经失效或从未收录。已结束的优惠仍然可以从「全部情报」的档案视图打开。</p>
  <div class="notfound-links"><a class="page-button" href="/deals">浏览全部情报</a><a class="page-button" href="/">回到首页</a><a class="page-button" href="/deals?view=archived">查看已结束档案</a></div>
</main></body></html>`;
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
