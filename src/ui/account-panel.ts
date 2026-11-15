import { accountCopy } from "../accounts/copy";
import { REGIONS } from "../content/evidence";
import { CATEGORIES, CATEGORY_LABEL } from "../labels";
import { escapeHtml } from "../text";
import type { SiteLang } from "./nav";

const EN_REGIONS: Record<string, string> = {
  cn:"Mainland China", hk:"Hong Kong", tw:"Taiwan", us:"United States", ca:"Canada", gb:"United Kingdom",
  eu:"European Union", in:"India", jp:"Japan", sg:"Singapore", au:"Australia",
};
const EN_CATEGORIES: Record<string, string> = {
  ai:"AI", vps:"Cloud and VPS", software:"Software", crypto:"Crypto", bank:"Banking", ucard:"Cards", other:"Other",
};

export function accountDialogs(lang: SiteLang, showPanel: boolean): string {
  const t = (key: keyof typeof accountCopy) => escapeHtml(accountCopy[key][lang]);
  const options = (labels: Record<string, string>) => Object.entries(labels)
    .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("");
  const label = (key: "region" | "category", labels: Record<string, string>) =>
    `<label>${t(key)} <select name="${key}"><option value="">${t("all")}</option>${options(labels)}</select></label>`;
  const checks = (["noCard", "noRenewal", "newOffer", "ending", "changed"] as const)
    .map(key => `<label><input type="checkbox" name="${key}"> ${t(key)}</label>`).join("");
  const button = (key: keyof typeof accountCopy, marker: string, hidden = false) =>
    `<button class="account-button" type="button" data-${marker}${hidden ? " hidden" : ""}>${t(key)}</button>`;
  const panel = showPanel ? `
<div data-account-panel hidden>
  <div class="account-actions"><p data-account-identity-visible></p>${button("signOut", "sign-out")}${button("signOutAll", "sign-out-all")}</div>
  <details open><summary>${t("saved")}</summary><p data-account-count></p>
    <div class="account-actions"><a href="/deals?view=saved&amp;lang=${lang}">${t("viewSaved")}</a>${button("import", "account-import", true)}</div>
  </details>
  <details open><summary>${t("prefs")}</summary><form data-account-prefs>
    ${label("region", lang === "en" ? EN_REGIONS : REGIONS)}
    ${label("category", Object.fromEntries(CATEGORIES.map(key => [key, lang === "en" ? EN_CATEGORIES[key] ?? key : CATEGORY_LABEL[key]])))}
    ${checks}
    <select name="frequency" aria-label="${t("prefs")}"><option value="live">${t("live")}</option><option value="daily">${t("daily")}</option></select>
    <label><input type="checkbox" name="site"> ${t("channelSite")}</label>
    <label><input type="checkbox" disabled> ${t("channelEmail")}</label>
    <label><input type="checkbox" disabled> ${t("channelPush")}</label>
    <button class="account-button" type="submit">${t("savePrefs")}</button>
  </form></details>
  <details open><summary>${t("inbox")} <span data-inbox-count></span></summary>
    <p data-inbox-mode></p><p data-inbox-empty>${t("inboxEmpty")}</p><ul data-inbox-list></ul>
    <div class="account-actions">${button("inboxRead", "inbox-read", true)}${button("inboxMore", "inbox-more", true)}</div>
  </details>
  <details><summary>${t("dataPrivacy")}</summary><p>${t("storedData")}</p>
    <div class="account-actions"><a href="/api/me/export" download>${t("export")}</a>${button("delete", "account-delete")}</div>
  </details>
</div>
<dialog class="account-dialog" id="account-delete-dialog" aria-labelledby="account-delete-title">
  <h2 id="account-delete-title">${t("delete")}</h2><p data-delete-explanation></p>
  <form data-delete-form><input name="confirm" aria-describedby="account-delete-title" aria-label="${t("delete")}" autocomplete="off" required>
  <div class="account-actions"><button type="submit" class="account-button account-danger" disabled>${t("delete")}</button>${button("cancel", "delete-cancel")}</div>
  <p role="status" data-delete-status></p></form>
</dialog>` : "";
  return `${panel}
<dialog class="account-dialog" id="account-merge-dialog" aria-labelledby="account-merge-title">
  <h2 id="account-merge-title">${t("mergeTitle")}</h2><p data-merge-explanation></p>
  <label><input type="checkbox" data-merge-prefs> ${t("mergePrefs")}</label>
  <div class="account-actions"><button type="button" class="account-button" data-merge-confirm></button>${button("mergeSkip", "merge-skip")}</div>
  <p role="status" data-merge-status></p>
</dialog>
<p class="account-status" role="status" data-account-status hidden></p>`;
}
