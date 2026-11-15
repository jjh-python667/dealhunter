import { accountCopy } from "../accounts/copy";
import { escapeHtml } from "../text";
import { NAV_CSS, renderNav, type SiteLang } from "./nav";
import { PAGE_CSS } from "./styles";
import { accountDialogs } from "./account-panel";
import { ACCOUNT_SCRIPT } from "./account-client";
import { CLIENT_SCRIPT } from "./client";
import { DETAIL_SCRIPT } from "./detail";
import { HOME_SCRIPT } from "./home";

const CSS = `
.topnav-account{flex-shrink:0;min-height:44px;display:inline-flex;align-items:center;gap:5px;color:var(--gold)}
.topnav-account svg{width:18px;height:18px}
.account-page,.account-dialog{max-width:36rem;padding:1.5rem;color:var(--ink);background:var(--panel)}
.account-page{margin:2rem auto}.account-dialog{width:calc(100% - 2rem);border:1px solid var(--line);border-radius:12px}
.account-dialog::backdrop{background:#0009}.account-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.account-button{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--gold);font:inherit}
.account-menu{position:relative}.account-menu div{position:absolute;right:0;top:100%;z-index:5;display:grid;gap:8px;padding:10px;background:var(--panel);border:1px solid var(--line);min-width:9rem}
.account-menu summary{display:block;min-height:44px;line-height:42px;max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.account-page{width:calc(100% - 2rem);border-radius:12px;overflow-wrap:anywhere}
.account-page details{padding:12px 0;border-top:1px solid var(--line)}
.account-page summary{padding:6px 0;cursor:pointer;font-weight:600}
.account-page form{display:grid;gap:8px;margin:10px 0;justify-items:start}
.account-page select,.account-dialog input{max-width:100%;padding:8px;background:var(--bg);color:var(--ink)}
.account-dialog .account-actions{margin-top:12px}.account-danger{color:#ffaaa5;border-color:#9b514f}
.account-status{position:fixed;z-index:50;bottom:1rem;left:1rem;right:1rem;width:fit-content;max-width:calc(100% - 2rem);margin:auto;padding:8px 12px;background:var(--panel);border:1px solid var(--line);color:var(--ink)}
@media(max-width:480px){.topnav-account .account-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.account-dialog{margin:auto auto 0;max-height:85vh}.account-actions>*{min-height:44px}.account-menu summary{max-width:5.5rem}}
`;

function links(lang: SiteLang) {
  const query = new URLSearchParams({return: "/account?lang=" + lang, lang});
  return {account: "/account?lang=" + lang, start: "/api/auth/github/start?" + escapeHtml(query.toString())};
}

function signInContent(lang: SiteLang, error: boolean, dialog: boolean): string {
  const t = (key: keyof typeof accountCopy) => escapeHtml(accountCopy[key][lang]);
  return `<${dialog ? "h2" : "h1"} id="account-title">${t("title")}</${dialog ? "h2" : "h1"}>
<div data-account-sign-in><p>${t("optional")}</p>${error ? `<p role="alert">${t("error")}</p>` : ""}
<p>${t("benefit1")}</p><div class="account-actions"><a class="account-button" href="${links(lang).start}">${t("github")}</a>${dialog
    ? `<button class="account-button" type="button" data-account-dismiss>${t("later")}</button>`
    : `<a href="/?lang=${lang}">${t("later")}</a>`}</div><p>${t("privacy")}</p></div>
<p data-account-identity hidden></p>`;
}

export function renderAccount(lang: SiteLang, error: boolean): string {
  return `<!DOCTYPE html><html lang="${lang === "en" ? "en" : "zh-CN"}" data-lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(accountCopy.account[lang])} · Deal Hunter</title><style>${PAGE_CSS}${NAV_CSS}</style></head>
<body>${renderNav({active: "detail", lang})}<main class="account-page" id="main">${signInContent(lang, error, false)}${accountDialogs(lang, true)}</main></body></html>`;
}

// Replace only the exact script emitted by the public renderer. Cached pages and
// feature-off responses always retain the original script and HTML.
const accountScripts = [
  [CLIENT_SCRIPT, CLIENT_SCRIPT.replace("function readSaved() {", "function readSaved() {\n    if (window.dhAccount) return new Set(window.dhAccount.ids);")
    .replace("const raw = readLocal(preferenceKey,{});", "const raw = window.dhAccount?.prefs ?? readLocal(preferenceKey,{});")],
  [HOME_SCRIPT, HOME_SCRIPT.replace("function readSaved() {", "function readSaved() {\n    if (window.dhAccount) return new Set(window.dhAccount.ids);")
    .replace("function readPreferences() {", "function readPreferences() {\n    if (window.dhAccount) return window.dhAccount.prefs;")],
  [DETAIL_SCRIPT, DETAIL_SCRIPT.replace("function readSaved() {", "function readSaved() {\n    if (window.dhAccount) return window.dhAccount.ids.slice();")],
] as const;

export async function addAccountNav(response: Response, lang: SiteLang, accountPage = false): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  const options = JSON.stringify({account: links(lang).account,
    copy: Object.fromEntries(Object.entries(accountCopy).map(([key, value]) => [key, value[lang]])),
  }).replaceAll("<", "\\u003c");
  const slot = `<a class="topnav-account" href="${links(lang).account}" data-account-slot><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg><span class="account-label">${escapeHtml(accountCopy.signIn[lang])}</span></a>`;
  const dialog = accountPage ? "" : `<dialog class="account-dialog" id="login-dialog" aria-labelledby="account-title">${signInContent(lang, false, true)}</dialog>`;
  let body = (await response.text())
    .replace('<nav class="topnav-langs"', () => slot + '<nav class="topnav-langs"')
    .replace("</head>", () => `<style>${CSS}</style></head>`)
    .replace("</body>", () => `${dialog}${accountPage ? "" : accountDialogs(lang, false)}<script>const dhAccountOptions=${options};${ACCOUNT_SCRIPT}</script></body>`);
  for (const [publicScript, clientScript] of accountScripts) {
    const original = `<script>${publicScript}</script>`;
    if (body.includes(original)) {
      body = body.replace(original, () => `<script>${clientScript}</script>`);
      break;
    }
  }
  return new Response(body, {status: response.status, headers});
}
