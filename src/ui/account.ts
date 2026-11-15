import { accountCopy } from "../accounts/copy";
import { escapeHtml } from "../text";
import { NAV_CSS, renderNav, type SiteLang } from "./nav";
import { PAGE_CSS } from "./styles";

const CSS = `
.topnav-account{flex-shrink:0;min-height:44px;display:inline-flex;align-items:center;gap:5px;color:var(--gold)}
.topnav-account svg{width:18px;height:18px}
.account-page,.account-dialog{max-width:36rem;padding:1.5rem;color:var(--ink);background:var(--panel)}
.account-page{margin:2rem auto}.account-dialog{width:calc(100% - 2rem);border:1px solid var(--line);border-radius:12px}
.account-dialog::backdrop{background:#0009}.account-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.account-button{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--gold);font:inherit}
.account-menu{position:relative}.account-menu div{position:absolute;right:0;top:100%;z-index:5;display:grid;gap:8px;padding:10px;background:var(--panel);border:1px solid var(--line);min-width:9rem}
.account-menu summary{display:block;min-height:44px;line-height:42px;max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
<div class="account-actions"><a class="account-button" href="${links(lang).start}">${t("github")}</a>${dialog
    ? `<button class="account-button" type="button" data-account-dismiss>${t("later")}</button>`
    : `<a href="/?lang=${lang}">${t("later")}</a>`}</div><p>${t("privacy")}</p></div>
<p data-account-identity hidden></p>`;
}

export function renderAccount(lang: SiteLang, error: boolean): string {
  return `<!DOCTYPE html><html lang="${lang === "en" ? "en" : "zh-CN"}" data-lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(accountCopy.account[lang])} · Deal Hunter</title><style>${PAGE_CSS}${NAV_CSS}</style></head>
<body>${renderNav({active: "detail", lang})}<main class="account-page" id="main">${signInContent(lang, error, false)}</main></body></html>`;
}

export async function addAccountNav(response: Response, lang: SiteLang, accountPage = false): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  const options = JSON.stringify({
    account: links(lang).account, accountLabel: accountCopy.account[lang], signOut: accountCopy.signOut[lang],
    error: accountCopy.signOutError[lang], accountPage,
  });
  const slot = `<a class="topnav-account" href="${links(lang).account}" data-account-slot><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/></svg><span class="account-label">${escapeHtml(accountCopy.signIn[lang])}</span></a>`;
  const dialog = accountPage ? "" : `<dialog class="account-dialog" id="login-dialog" aria-labelledby="account-title">${signInContent(lang, false, true)}</dialog>`;
  const body = (await response.text())
    .replace('<nav class="topnav-langs"', () => slot + '<nav class="topnav-langs"')
    .replace("</head>", () => `<style>${CSS}</style></head>`)
    .replace("</body>", () => `${dialog}<script>const dhAccountOptions=${options};${SCRIPT}</script></body>`);
  return new Response(body, {status: response.status, headers});
}

const SCRIPT = String.raw`
(() => {
  const options = dhAccountOptions;
  const slot = document.querySelector('[data-account-slot]');
  const dialog = document.getElementById('login-dialog');
  slot.addEventListener('click', event => {
    if (!dialog?.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.showModal();
  });
  dialog?.querySelector('[data-account-dismiss]').addEventListener('click', () => dialog.close());
  fetch('/api/me', {cache:'no-store'}).then(response => response.ok ? response.json() : null).then(data => {
    if (typeof data?.user?.login !== 'string') return;
    const name = '@' + data.user.login;
    const menu = document.createElement('details');
    menu.className = 'account-menu';
    const label = document.createElement('summary');
    label.className = 'account-button';
    label.textContent = name;
    const actions = document.createElement('div');
    const account = document.createElement('a');
    account.href = options.account;
    account.textContent = options.accountLabel;
    const button = document.createElement('button');
    button.className = 'account-button';
    button.type = 'button';
    button.textContent = options.signOut;
    const status = document.createElement('small');
    status.setAttribute('role', 'status');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch('/api/auth/logout', {method:'POST',
          headers:{'Content-Type':'application/json','X-DH-CSRF':'1'},body:'{}'});
        if (!response.ok) throw new Error();
        location.replace(options.account);
      } catch {
        status.textContent = options.error;
        button.disabled = false;
      }
    });
    actions.append(account, button, status);
    menu.append(label, actions);
    slot.replaceWith(menu);
    if (options.accountPage) {
      const identity = document.querySelector('[data-account-identity]');
      document.getElementById('account-title').textContent = options.accountLabel;
      identity.textContent = name;
      identity.hidden = false;
      document.querySelector('[data-account-sign-in]').hidden = true;
    }
  }).catch(() => {});
})();
`;
