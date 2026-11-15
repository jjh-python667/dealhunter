export const ACCOUNT_INBOX_SCRIPT = String.raw`
  const inboxTargets = [];
  let inbox = null;
  let allowInbox = false;
  let inboxBusy = false;
  const kinds = {newOffer:copy.inboxNewOffer, changed:copy.inboxChanged, ending:copy.inboxEnding};

  function controls() {
    const accountList = find('[data-inbox-list]');
    if (accountList) inboxTargets.push({
      list:accountList, count:find('[data-inbox-count]'), mode:find('[data-inbox-mode]'),
      empty:find('[data-inbox-empty]'), read:find('[data-inbox-read]'), more:find('[data-inbox-more]'),
    });
    const list = find('#alert-list');
    const clear = find('#clear-alerts');
    if (!list || !clear) return;
    const read = document.createElement('button');
    const more = document.createElement('button');
    for (const button of [read, more]) {
      button.type = 'button';
      button.className = 'text-button';
      button.hidden = true;
    }
    clear.after(read, more);
    inboxTargets.push({list, count:find('#alert-count'), empty:find('#alert-empty'), read, more, clear});
  }

  function paintInbox(target, data, server) {
    target.list.classList.add('account-inbox');
    const fragment = document.createDocumentFragment();
    let day = '';
    for (const entry of data.entries) {
      if (data.daily && day !== entry.day) {
        day = entry.day;
        const header = document.createElement('li');
        header.className = 'alert-day';
        header.textContent = day;
        fragment.append(header);
      }
      const item = document.createElement('li');
      item.dataset.unread = String(server && !entry.readAt);
      const link = document.createElement('a');
      link.href = '/deal/' + encodeURIComponent(entry.dealId) + '?lang=' + lang;
      link.textContent = entry.title || copy.inboxMissing;
      const description = document.createElement('small');
      description.textContent = (kinds[entry.kind] || '') + ' · ' + entry.day;
      item.append(link, description);
      fragment.append(item);
    }
    target.list.replaceChildren(fragment);
    target.empty.textContent = copy.inboxEmpty;
    target.empty.hidden = data.entries.length > 0;
    target.count.textContent = data.unread ? format(copy.inboxUnread, {n:data.unread}) : '';
    if (target.mode) target.mode.textContent = server ? '' : copy.inboxLocal;
    if (target.clear) target.clear.hidden = true;
    target.read.hidden = server ? !data.unread : !data.entries.length;
    target.read.textContent = server ? copy.inboxRead : copy.inboxClear;
    target.more.hidden = !data.before;
    target.more.textContent = copy.inboxMore;
    target.read.disabled = inboxBusy;
    target.more.disabled = inboxBusy;
  }

  function deviceInbox() {
    const cached = localJson('dh-alerts-v1', {}) || {};
    const prefs = window.dhAccount?.prefs || localJson('dh-preferences', {}) || {};
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const visible = entry => entry && typeof entry.id === 'string' && typeof entry.day === 'string' &&
      Object.hasOwn(kinds, entry.kind) && prefs[entry.kind] !== false && (prefs.frequency !== 'daily' || entry.day < today);
    const entries = Array.isArray(cached.entries) ? cached.entries.filter(visible) : [];
    return {cached, entries:entries.map(entry => ({...entry, dealId:entry.id})), visible, daily:prefs.frequency === 'daily', unread:0};
  }

  function renderInbox() {
    for (const target of inboxTargets) {
      if (inbox) paintInbox(target, inbox, true);
      else if (!target.clear) paintInbox(target, deviceInbox(), false);
      else { target.read.hidden = true; target.more.hidden = true; }
    }
  }

  async function fetchInbox(before) {
    const parameters = new URLSearchParams({lang});
    if (before) parameters.set('before', before);
    const result = await api('/api/me/inbox?' + parameters);
    inbox = before && inbox
      ? {...result, entries:[...inbox.entries, ...result.entries], top:inbox.top}
      : {...result, top:result.entries[0]?.id};
    window.dhAccount.serverInbox = true;
  }

  async function refreshInbox() {
    if (!inboxTargets.length || inboxBusy) return;
    if (!allowInbox) { renderInbox(); return; }
    await inboxAction(async () => {
      try { await fetchInbox(); }
      catch {
        inbox = null;
        window.dhAccount.serverInbox = false;
        signal('dh-alerts-v1');
      }
    });
  }

  async function inboxAction(action) {
    if (inboxBusy) return;
    inboxBusy = true;
    renderInbox();
    try { await action(); }
    catch { announce(copy.requestError); }
    finally { inboxBusy = false; renderInbox(); }
  }

  function mountInbox(server) {
    controls();
    allowInbox = server;
    for (const target of inboxTargets) {
      target.more.addEventListener('click', () => { if (inbox?.before) inboxAction(() => fetchInbox(inbox.before)); });
      target.read.addEventListener('click', () => {
        if (inbox?.top) {
          inboxAction(async () => {
            const through = inbox.top;
            const result = await api('/api/me/inbox/read', {through});
            inbox.unread = result.unread;
            for (const entry of inbox.entries) if (entry.id <= through && !entry.readAt) entry.readAt = new Date().toISOString();
          });
        } else if (!target.clear) {
          const local = deviceInbox();
          save('dh-alerts-v1', JSON.stringify({...local.cached, entries:local.cached.entries?.filter(entry => !local.visible(entry)) ?? []}));
          signal('dh-alerts-v1');
          renderInbox();
        }
      });
    }
    renderInbox();
    return refreshInbox();
  }
`;
