import { REGIONS } from "../content/evidence";

export const RADAR_SCRIPT = String.raw`
  const regions = ${JSON.stringify(REGIONS)};
  const prefForm = document.querySelector('#preference-form');
  const preferenceKey = 'dh-preferences';
  const alertsKey = 'dh-alerts-v1';
  const defaults = {region:'',category:'',noCard:false,noRenewal:false,newOffer:true,ending:true,changed:true,frequency:'live'};
  function readLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }
  function writeLocal(key, value) {
    try { localStorage.setItem(key,JSON.stringify(value)); return true; }
    catch { return false; }
  }
  function getPreferences() {
    const raw = readLocal(preferenceKey,{});
    const current = {...defaults};
    Object.keys(defaults).forEach(key => {
      const field = prefForm.elements.namedItem(key);
      if (field.type === 'checkbox' && typeof raw[key] === 'boolean') current[key] = raw[key];
      if (field.type === 'select-one' && Array.from(field.options).some(option => option.value === raw[key])) current[key] = raw[key];
      if (field.type === 'checkbox') field.checked = current[key]; else field.value = current[key];
    });
    return current;
  }
  let preferences = getPreferences();
  function reasonsFor(card) {
    if (card.dataset.archived === 'true' || Number(card.dataset.start) > snapshot) return [];
    const facts = factsByCard.get(card);
    const reasons = [];
    if (preferences.region) {
      if (!facts.regions.split(' ').some(region => region === 'global' || region === preferences.region)) return [];
      reasons.push('适用' + regions[preferences.region]);
    }
    if (preferences.category) {
      if (card.dataset.category !== preferences.category) return [];
      reasons.push('符合关注分类');
    }
    if (preferences.noCard) {
      if (facts.card !== 'no') return [];
      reasons.push('无需绑卡');
    }
    if (preferences.noRenewal) {
      if (facts.renewal !== 'no') return [];
      reasons.push('无自动续费');
    }
    if (reasons.length && card.dataset.sections.split(' ').includes('G')) reasons.push('7 天内截止');
    return reasons;
  }
  function searchIntent(needle) {
    const intent = {};
    let text = needle;
    const flags = [
      ['available',/还能领|现在可领|仍可领取/g],
      ['noCard',/无需(?:绑定)?(?:银行卡|信用卡|绑卡|付款方式)|免绑卡|不(?:用|需|需要)(?:绑定)?(?:银行卡|信用卡|绑卡)|no credit card(?: required)?/gi],
      ['noRenewal',/不(?:会)?自动(?:续费|扣费)|无自动续费|no auto[- ]renewal/gi],
      ['student',/学生(?:认证|优惠)?|\bstudents?\b/gi],
      ['ending',/快到期|即将(?:截止|到期)|7\s*天内截止/g],
    ];
    flags.forEach(([key,pattern]) => {
      text = text.replace(pattern,() => { intent[key] = true; return ' '; });
    });
    Object.entries(regions).forEach(([code,label]) => {
      if (text.includes(label) && !intent.region) {
        intent.region = code;
        text = text.replace(label,' ');
      }
    });
    const structured = Object.keys(intent).length > 0 || /^(?:ai|云服务|云主机|vps)(?:\s*优惠)?$/i.test(text.trim());
    if (structured) {
      text = text.replace(/\bai\b|人工智能|云服务|云主机|\bvps\b|软件/gi,word => {
        const category = /ai|人工智能/i.test(word) ? 'ai' : word === '软件' ? 'software' : 'vps';
        if (intent.category && intent.category !== category) return word;
        intent.category = category;
        return ' ';
      });
      text = text.replace(/能领|可领|还能领|优惠|活动|帮我找|我要找|^找|的|[，、,]/g,' ');
    }
    return {...intent, words:structured ? text.trim().split(/\s+/).filter(Boolean) : needle ? [needle] : []};
  }
  function matchesSearch(card,intent) {
    const facts = factsByCard.get(card);
    return (!intent.noCard || facts.card === 'no') &&
      (!intent.noRenewal || facts.renewal === 'no') &&
      (!intent.student || facts.student === 'true') &&
      (!intent.available || (card.dataset.archived !== 'true' && Number(card.dataset.start) <= snapshot)) &&
      (!intent.ending || card.dataset.sections.split(' ').includes('G')) &&
      (!intent.category || card.dataset.category === intent.category) &&
      (!intent.region || facts.regions.split(' ').some(region => region === 'global' || region === intent.region)) &&
      intent.words.every(word => card.dataset.search.includes(word));
  }
  const alertList = document.querySelector('#alert-list');
  const alertEmpty = document.querySelector('#alert-empty');
  const clearAlerts = document.querySelector('#clear-alerts');
  const snapshot = Number(root.dataset.snapshotAt);
  const alertDay = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0,10);
  function loadAlerts() {
    const saved = readLocal(alertsKey,{});
    return {
      seen:new Set(Array.isArray(saved.seen) ? saved.seen : []),
      revisions:new Map(Array.isArray(saved.revisions) ? saved.revisions.filter(entry => Array.isArray(entry) && entry.length === 2) : []),
      entries:Array.isArray(saved.entries) ? saved.entries.filter(entry => entry && typeof entry.id === 'string' && typeof entry.title === 'string') : [],
      snapshot:Number(saved.snapshot) || 0,
    };
  }
  let alerts = loadAlerts();
  function saveAlerts() {
    writeLocal(alertsKey,{...alerts,seen:[...alerts.seen].slice(-500),revisions:[...alerts.revisions],entries:alerts.entries.slice(0,100)});
  }
  function refreshAlerts() {
    if (document.querySelector('.error-banner') || !Number.isFinite(snapshot) || snapshot < alerts.snapshot) return;
    const revisions = new Map();
    const entries = [];
    function add(card,kind,key,label) {
      if (!preferences[kind] || alerts.seen.has(key)) return;
      alerts.seen.add(key);
      const title = card.querySelector('h3');
      const preferred = title.querySelector('.t-'+root.dataset.lang);
      entries.push({id:card.dataset.id,title:(preferred || title).textContent.trim(),kind,label,day:alertDay});
    }
    cards.forEach(card => {
      const id = card.dataset.id;
      const facts = factsByCard.get(card);
      const firstSeen = Number(facts.firstSeen);
      if (alerts.snapshot && firstSeen > alerts.snapshot && firstSeen <= snapshot && reasonsFor(card).length) {
        add(card,'newOffer','new:'+id,'符合偏好的新优惠');
      }
      if (!savedIds.has(id)) return;
      revisions.set(id,facts.revision);
      if (alerts.revisions.has(id) && alerts.revisions.get(id) !== facts.revision) {
        add(card,'changed','changed:'+id+':'+snapshot,'优惠、资格或期限有变化');
      }
      if (card.dataset.archived !== 'true' && card.dataset.sections.split(' ').includes('G')) {
        add(card,'ending','ending:'+id+':'+card.dataset.deadline,'收藏将在 7 天内截止');
      }
    });
    alerts.revisions = revisions;
    alerts.snapshot = snapshot;
    alerts.entries = [...entries,...alerts.entries].slice(0,100);
    saveAlerts();
  }
  function showAlerts() {
    const visible = alerts.entries.filter(entry => preferences[entry.kind] && (preferences.frequency === 'live' || entry.day < alertDay));
    const fragment = document.createDocumentFragment();
    let day = '';
    visible.forEach(entry => {
      if (preferences.frequency === 'daily' && day !== entry.day) {
        day = entry.day;
        const header = document.createElement('li');
        header.className = 'alert-day';
        header.textContent = day;
        fragment.append(header);
      }
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.textContent = entry.title;
      button.addEventListener('click',() => {
        if (!cards.some(card => card.dataset.id === entry.id)) { announce('这条记录已不在当前列表'); return; }
        reset();
        state.offer = entry.id;
        render(false);
        document.querySelector('#view-title').focus();
      });
      const text = document.createElement('small');
      text.textContent = entry.label;
      item.append(text,button);
      fragment.append(item);
    });
    alertList.replaceChildren(fragment);
    document.querySelector('#alert-count').textContent = visible.length ? String(visible.length) : '';
    alertEmpty.hidden = visible.length > 0;
    alertEmpty.textContent = preferences.frequency === 'daily' ? '当天提醒会在次日打开网站时汇总。' : '暂无提醒。';
    clearAlerts.hidden = !visible.length;
  }
  clearAlerts.addEventListener('click',() => {
    alerts = loadAlerts();
    alerts.entries = alerts.entries.filter(entry => !preferences[entry.kind] || (preferences.frequency === 'daily' && entry.day === alertDay));
    saveAlerts();
    showAlerts();
    document.querySelector('#alerts summary').focus();
  });
  prefForm.addEventListener('submit',event => {
    event.preventDefault();
    Object.keys(defaults).forEach(key => {
      const field = prefForm.elements.namedItem(key);
      preferences[key] = field.type === 'checkbox' ? field.checked : field.value;
    });
    const stored = writeLocal(preferenceKey,preferences);
    state.view = 'for-you'; state.offer = ''; state.page = 1;
    alerts = loadAlerts(); refreshAlerts(); showAlerts(); render(true);
    announce(stored ? '偏好已保存' : '偏好已应用于当前页面');
  });
  addEventListener('storage',event => {
    if (event.key === preferenceKey) { preferences = getPreferences(); render(false); }
    if (event.key === alertsKey) alerts = loadAlerts();
    if ([preferenceKey,alertsKey].includes(event.key)) showAlerts();
  });
  document.querySelector('#radar-controls').hidden = false;
  refreshAlerts();
  showAlerts();
  const liveRefresh = document.querySelector('#live-refresh');
  if (liveRefresh) {
    const statsButton = document.querySelector('#source-performance');
    statsButton.hidden = false;
    statsButton.addEventListener('click',async () => {
      const output = document.querySelector('#source-performance-results');
      statsButton.disabled = true;
      output.textContent = '正在加载来源统计…';
      try {
        const response = await fetch('/api/source-performance',{signal:AbortSignal.timeout(8000)});
        if (!response.ok) throw new Error();
        const rows = await response.json();
        const list = document.createElement('ul');
        rows.sort((a,b) => b.added - a.added || a.failed - b.failed).forEach(row => {
          const item = document.createElement('li');
          item.textContent = row.id + ' · 新收录 ' + row.added + ' 条 · 失败 ' + row.failed + ' / ' + row.checked + ' 次';
          list.append(item);
        });
        if (rows.length) output.replaceChildren(list);
        else output.textContent = '过去 14 天尚无采集记录。';
      } catch {
        output.textContent = '暂时无法加载来源统计。';
      } finally {
        statsButton.disabled = false;
      }
    });
    let nextCheck = Date.now() + 60000;
    let pending = false;
    async function checkForUpdates() {
      if (pending || !liveRefresh.hidden || document.hidden || Date.now() < nextCheck) return;
      pending = true;
      nextCheck = Date.now() + 60000;
      try {
        const response = await fetch('/api/updates',{cache:'no-store',signal:AbortSignal.timeout(8000)});
        if (!response.ok) return;
        const update = await response.json();
        if (update.token && update.token !== root.dataset.updateToken) {
          liveRefresh.hidden = false;
          document.querySelector('#live-status').textContent = '有一轮新的采集已完成。';
        }
      } catch {} finally { pending = false; }
    }
    liveRefresh.addEventListener('click',() => location.reload());
    setInterval(checkForUpdates,60000);
    document.addEventListener('visibilitychange',checkForUpdates);
  }
`;
