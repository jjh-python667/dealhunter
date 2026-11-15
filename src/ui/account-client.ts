import { ACCOUNT_INBOX_SCRIPT } from "./account-inbox";

export const ACCOUNT_SCRIPT = String.raw`
(() => {
  const {account, copy, lang} = dhAccountOptions;
  const find = selector => document.querySelector(selector);
  const slot = find('[data-account-slot]');
  const loginDialog = find('#login-dialog');
  const mergeDialog = find('#account-merge-dialog');
  const panel = find('[data-account-panel]');
  const status = find('[data-account-status]');
  const storage = (key, fallback) => {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  };
  function localJson(key, fallback) {
    try { return JSON.parse(storage(key, JSON.stringify(fallback))); } catch { return fallback; }
  }
  function localIds() {
    const values = localJson('dh-saved', []);
    return Array.isArray(values) ? [...new Set(values.filter(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/.test(id)))].slice(0, 1000) : [];
  }
  const format = (message, values) => message.replace(/\{([^}]+)\}/g, (_, key) => String(values[key] ?? ''));
  const query = new URLSearchParams(location.search);
  function announce(message) {
    status.hidden = false;
    status.textContent = message;
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => { status.hidden = true; }, 5500);
  }
  const outcome = {deleted: copy.deleted, signedout: copy.signedOutKeep, local: copy.signedOutLocal};
  const notice = query.get('account_notice');
  if (Object.hasOwn(outcome, notice)) announce(outcome[notice]);
  const api = async (path, body) => {
    const response = await fetch(path, {
      cache: 'no-store',
      ...(body === undefined ? {} : {method: 'POST', headers: {'Content-Type':'application/json', 'X-DH-CSRF':'1'}, body: JSON.stringify(body)}),
    });
    if (response.status === 401 && window.dhAccount) location.replace(account);
    if (!response.ok) throw Error('account_request_failed');
    return response.json();
  };
  const state = {loading: true, busy: false, decision: '', key: '', login: ''};
  function signal(key) {
    dispatchEvent(new StorageEvent('storage', {key}));
  }
  function mirror() {
    if (state.decision === 'merged') save('dh-saved', JSON.stringify(window.dhAccount.ids));
  }
  function showSaved() {
    signal('dh-saved');
    const count = find('[data-account-count]');
    if (count) count.textContent = format(copy.savedCount, {n:window.dhAccount.ids.length});
    const importButton = find('[data-account-import]');
    if (importButton) importButton.hidden = !localIds().some(id => !window.dhAccount.ids.includes(id));
  }
  function publishSaved(ids) {
    window.dhAccount.ids = ids;
    mirror();
    showSaved();
  }
  function showPrefs() {
    signal('dh-preferences');
    const form = find('[data-account-prefs]');
    if (!form) return;
    for (const input of form.elements) {
      if (input.type === 'checkbox' && input.name) input.checked = input.name === 'site' ? window.dhAccount.prefs.channels.site : window.dhAccount.prefs[input.name];
      if (input.tagName === 'SELECT') input.value = window.dhAccount.prefs[input.name];
    }
  }
  function readForm(form) {
    const prefs = {};
    for (const input of form.elements) {
      if (input.name && input.type === 'checkbox') prefs[input.name] = input.checked;
      if (input.name && input.tagName === 'SELECT') prefs[input.name] = input.value;
    }
    prefs.channels = {...window.dhAccount.prefs.channels, site: prefs.site ?? window.dhAccount.prefs.channels.site};
    delete prefs.site;
    return prefs;
  }
  function handleSavePrefs(event) {
    if (!window.dhAccount) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    perform(async () => {
      const result = await api('/api/me/prefs', readForm(event.target));
      window.dhAccount.prefs = result.prefs;
      showPrefs();
      await refreshInbox();
      announce(copy.preferencesSaved);
    });
  }
  async function perform(action, onError = () => announce(copy.requestError)) {
    if (state.busy) return;
    state.busy = true;
    try { await action(); } catch { onError(); } finally { state.busy = false; }
  }
  function remember(decision) {
    state.decision = decision;
    save(state.key, decision);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('.bookmark');
    if (!button || (!state.loading && !window.dhAccount)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.dhAccount) return;
    const id = button.dataset.id || button.closest('[data-id]')?.dataset.id;
    if (!id) return;
    perform(async () => {
      const exists = window.dhAccount.ids.includes(id);
      button.disabled = true;
      try {
        const result = await api('/api/me/saved', exists ? {remove:[id]} : {add:[id]});
        publishSaved(result.ids);
        if (!exists && !result.ids.includes(id)) announce(copy.savedLimit);
      } finally { button.disabled = false; }
    });
  }, true);
  document.addEventListener('submit', event => {
    if (event.target.matches('#preference-form,[data-account-prefs]')) {
      if (state.loading) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else handleSavePrefs(event);
    }
  }, true);
  slot.addEventListener('click', event => {
    if (!loginDialog?.showModal || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    loginDialog.showModal();
  });
  loginDialog?.querySelector('[data-account-dismiss]').addEventListener('click', () => loginDialog.close());

  function openMerge() {
    const local = localIds();
    const missing = local.filter(id => !window.dhAccount.ids.includes(id)).length;
    if (!missing || !mergeDialog?.showModal || mergeDialog.open) return;
    find('[data-merge-explanation]').textContent = format(copy.mergeBody, {n:local.length, m:missing});
    find('[data-merge-confirm]').textContent = format(copy.mergeConfirm, {m:missing});
    find('[data-merge-prefs]').checked = false;
    find('[data-merge-status]').textContent = '';
    mergeDialog.showModal();
  }
  find('[data-account-import]')?.addEventListener('click', openMerge);
  find('[data-merge-skip]').addEventListener('click', () => {
    if (state.busy) return;
    remember('skipped');
    mergeDialog.close();
  });
  mergeDialog.addEventListener('cancel', event => {
    if (state.busy) event.preventDefault();
    else if (!state.decision) remember('skipped');
  });
  find('[data-merge-confirm]').addEventListener('click', () => perform(async () => {
    const body = {ids:localIds()};
    if (find('[data-merge-prefs]').checked) body.prefs = localJson('dh-preferences', {}) || {};
    const result = await api('/api/me/saved/merge', body);
    // Keep the device list available if the import could not fit all eligible saves.
    remember(result.overflow ? 'skipped' : 'merged');
    publishSaved(result.ids);
    if (result.prefs) {
      window.dhAccount.prefs = result.prefs;
      showPrefs();
    }
    mergeDialog.close();
    announce(result.overflow ? format(copy.mergeOverflow, {k:result.overflow}) : format(copy.mergeDone, {n:result.added}));
  }, () => { find('[data-merge-status]').textContent = copy.requestError; }));

  function navigate(notice) {
    const next = new URL(account, location.origin);
    next.searchParams.set('account_notice', notice);
    location.replace(next.href);
  }
  function signOut(all) {
    return perform(async () => {
      await api('/api/auth/logout', {all});
      mirror();
      navigate(state.decision === 'merged' ? 'signedout' : 'local');
    }, () => announce(copy.signOutError));
  }
  function mountPanel(name) {
    if (!panel) return;
    find('#account-title').textContent = copy.account;
    find('[data-account-identity-visible]').textContent = name;
    find('[data-account-sign-in]').hidden = true;
    panel.hidden = false;
    find('[data-sign-out]').addEventListener('click', () => signOut(false));
    find('[data-sign-out-all]').addEventListener('click', () => signOut(true));
    const dialog = find('#account-delete-dialog');
    const form = find('[data-delete-form]');
    const confirm = form.elements.namedItem('confirm');
    const submit = form.querySelector('button[type=submit]');
    const validate = () => { submit.disabled = confirm.value !== state.login; };
    find('[data-delete-explanation]').textContent = format(copy.deleteConfirm, {login:state.login});
    find('[data-account-delete]').addEventListener('click', () => {
      form.reset();
      validate();
      find('[data-delete-status]').textContent = '';
      dialog.showModal();
    });
    find('[data-delete-cancel]').addEventListener('click', () => { if (!state.busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
    confirm.addEventListener('input', validate);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (confirm.value !== state.login) return;
      perform(async () => {
        submit.disabled = true;
        try {
          await api('/api/me/delete', {confirm:confirm.value});
          try { localStorage.removeItem(state.key); } catch {}
          navigate('deleted');
        } finally { validate(); }
      }, () => { find('[data-delete-status]').textContent = copy.requestError; });
    });
  }
  function mountMenu(name) {
    const menu = document.createElement('details');
    menu.className = 'account-menu';
    const label = document.createElement('summary');
    label.className = 'account-button';
    label.textContent = name;
    const actions = document.createElement('div');
    const link = document.createElement('a');
    link.href = account;
    link.textContent = copy.account;
    const button = document.createElement('button');
    button.className = 'account-button';
    button.type = 'button';
    button.textContent = copy.signOut;
    button.addEventListener('click', () => signOut(false));
    actions.append(link, button);
    menu.append(label, actions);
    slot.replaceWith(menu);
  }
  ${ACCOUNT_INBOX_SCRIPT}
  async function initialize() {
    const me = await api('/api/me');
    if (typeof me.user?.login !== 'string') return;
    state.login = me.user.login;
    const saved = await api('/api/me/saved');
    state.key = 'dh-merged:' + me.mergeKey;
    state.decision = storage(state.key, '');
    if (state.decision !== 'merged' && state.decision !== 'skipped') state.decision = '';
    window.dhAccount = {ids:saved.ids, prefs:me.prefs};
    if (!state.decision && !localIds().some(id => !saved.ids.includes(id))) remember('merged');
    const name = '@' + state.login;
    loginDialog?.close();
    mountMenu(name);
    mountPanel(name);
    publishSaved(saved.ids);
    showPrefs();
    if (!state.decision) openMerge();
    await mountInbox(me.serverAlerts === true);
    addEventListener('focus', () => perform(async () => {
      const [saved, prefs] = await Promise.all([api('/api/me/saved'), api('/api/me/prefs')]);
      publishSaved(saved.ids);
      window.dhAccount.prefs = prefs.prefs;
      showPrefs();
      await refreshInbox();
    }, () => {}));
  }
  initialize().catch(() => announce(copy.requestError)).finally(() => { state.loading = false; });
})();
`;
