/** No network calls: all interactions work on the server-rendered snapshot. */
export const CLIENT_SCRIPT = String.raw`
(() => {
  'use strict';
  const root = document.documentElement;
  const cards = Array.from(document.querySelectorAll('.card'));
  const list = document.querySelector('#deal-list');
  const q = document.querySelector('#q');
  const category = document.querySelector('#category');
  const type = document.querySelector('#deal-type');
  const sort = document.querySelector('#sort');
  const evidence = Array.from(document.querySelectorAll('[data-evidence]'));
  const sourceDetails = document.querySelector('#sources');
  const requestedEvidence = new Set((new URLSearchParams(location.search).get('evidence') || '').split(','));
  evidence.forEach(input => { input.checked = requestedEvidence.has(input.dataset.evidence); });
  if (location.hash === '#sources') sourceDetails.open = true;
  document.querySelectorAll('a[href="#sources"]').forEach(link => {
    link.addEventListener('click', () => { sourceDetails.open = true; });
  });
  const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
  const params = new URLSearchParams(location.search);
  const validViews = ['all','today','rank','ending','archived','saved'];
  const titles = {all:'全部情报',today:'今日更新',new:'回访新增',rank:'来源标值榜',ending:'即将截止',archived:'已结束档案',saved:'我的收藏'};
  const notes = {all:'公开来源，原文可查。金额与资格以活动页面为准。',today:'按北京时间归类。没有发布时间时采用首次收录时间。',new:'按首次收录时间，显示自上次访问以来仍在册的情报。',rank:'按来源标值分级排序，币种不换算。',ending:'仅展示有明确日期、未来 7 天内截止的活动。',archived:'已结束或已归档的记录，仅供查阅。',saved:'收藏保存在当前浏览器，包含已归档的记录。'};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const PAGE_SIZE = 12;
  let savedIds = new Set();
  let canPersist = true;
  let toastTimer;
  let inputTimer;
  let orderKey = '';
  function previousVisit() {
    const snapshot = Number(root.dataset.snapshotAt);
    if (!Number.isFinite(snapshot) || snapshot <= 0 || document.querySelector('.error-banner')) return 0;
    try {
      const previous = Number(localStorage.getItem('dh-last-visit'));
      const current = Date.now();
      let baseline = previous > 0 && previous <= snapshot ? previous : 0;
      try {
        const session = JSON.parse(sessionStorage.getItem('dh-visit-session') || 'null');
        if (session && session.touched <= current && current - session.touched < 30 * 60 * 1000 &&
            Number.isFinite(session.baseline) && session.baseline >= 0 && session.baseline <= snapshot) {
          baseline = session.baseline;
        }
        sessionStorage.setItem('dh-visit-session', JSON.stringify({baseline,touched:current}));
      } catch {}
      if (!(previous > snapshot)) localStorage.setItem('dh-last-visit',String(snapshot));
      return baseline;
    } catch { return 0; }
  }
  const visitCutoff = previousVisit();
  const factsByCard = new Map(cards.map(card => [card,card.querySelector('.facts').dataset]));
  const newlyCollected = new Set(cards.filter(card => {
    const firstSeen = Number(factsByCard.get(card).firstSeen);
    return visitCutoff > 0 && firstSeen > visitCutoff && firstSeen <= Number(root.dataset.snapshotAt) && card.dataset.archived !== 'true';
  }));
  const newView = document.querySelector('[data-view=new]');
  if (visitCutoff) {
    validViews.push('new');
    newView.hidden = false;
    newView.querySelector('b').textContent = String(newlyCollected.size);
  }
  const endingCards = cards.filter(card => card.dataset.sections.split(' ').includes('G') && card.dataset.archived !== 'true');
  function readSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem('dh-saved') || '[]');
      return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string').slice(0,1000) : []);
    } catch { canPersist = false; return new Set(); }
  }
  savedIds = readSaved();
  let preferredLang;
  try { preferredLang = localStorage.getItem('dh-lang'); } catch { canPersist = false; }
  const lang = params.get('lang') || preferredLang || root.dataset.lang;
  if (lang === 'zh' || lang === 'en') root.dataset.lang = lang;
  const state = {view:validViews.includes(params.get('view')) ? params.get('view') : 'all',page:Math.max(1,parseInt(params.get('page') || '1',10) || 1)};
  const aliases = {'#sec-a':['today','all'],'#sec-b':['rank','all'],'#sec-c':['all','ai'],'#sec-d':['all','crypto'],'#sec-e':['all','finance'],'#sec-f':['all','vps'],'#sec-g':['ending','all'],'#sec-h':['archived','all']};
  const legacy = aliases[location.hash];
  if (legacy && !params.has('view')) state.view = legacy[0];
  function setSelect(select, value) {
    if (Array.from(select.options).some(option => option.value === value)) select.value = value;
  }
  q.value = (params.get('q') || '').slice(0,160);
  setSelect(category, params.get('category') || (legacy && legacy[1]) || 'all');
  setSelect(type, params.get('type') || 'all');
  setSelect(sort, params.get('sort') || 'newest');
  function announce(message) {
    const toast = document.querySelector('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toastTimer = setTimeout(() => { toast.textContent = ''; }, 2600);
  }
  function updateUrl() {
    const url = new URL(location.href);
    const values = {view:state.view === 'all' ? '' : state.view,q:q.value.trim(),category:category.value === 'all' ? '' : category.value,type:type.value === 'all' ? '' : type.value,sort:sort.value === 'newest' ? '' : sort.value,lang:root.dataset.lang,page:state.page > 1 ? String(state.page) : ''};
    Object.entries(values).forEach(([key,value]) => { if(value) url.searchParams.set(key,value); else url.searchParams.delete(key); });
    const selected = evidence.filter(input => input.checked).map(input => input.dataset.evidence);
    if (selected.length) url.searchParams.set('evidence', selected.join(','));
    else url.searchParams.delete('evidence');
    if (aliases[url.hash]) url.hash = '';
    try { history.replaceState(null,'',url); } catch {}
  }
  function updateLanguage() {
    document.querySelectorAll('[data-set-lang]').forEach(node => {
      if (node.dataset.setLang === root.dataset.lang) node.setAttribute('aria-current','true');
      else node.removeAttribute('aria-current');
      const url = new URL(location.href); url.searchParams.set('lang',node.dataset.setLang); node.href = url.pathname + url.search + url.hash;
    });
  }
  function updateBookmarks() {
    cards.forEach(card => {
      const button = card.querySelector('.bookmark');
      const saved = savedIds.has(card.dataset.id);
      button.setAttribute('aria-pressed',String(saved));
      button.setAttribute('aria-label',saved ? '取消收藏这条情报' : '收藏这条情报');
      button.title = saved ? '取消收藏' : '收藏到此浏览器';
    });
    document.querySelector('#saved-count').textContent = String(cards.filter(card => savedIds.has(card.dataset.id)).length);
  }
  function reset() {
    clearTimeout(inputTimer); q.value = ''; category.value = 'all'; type.value = 'all'; sort.value = 'newest'; state.view = 'all'; state.page = 1;
    evidence.forEach(input => { input.checked = false; });
    render(true);
  }
  function render(animate) {
    const needle = q.value.trim().normalize('NFKC').toLocaleLowerCase();
    const requiredFields = evidence.filter(input => input.checked).map(input => input.dataset.evidence + 'Known');
    const mode = state.view === 'rank' ? 'rank' : state.view === 'ending' ? 'ending' : sort.value;
    sort.disabled = state.view === 'rank' || state.view === 'ending';
    const ordered = cards.slice().sort((a,b) => {
      const newest = Number(b.dataset.stamp) - Number(a.dataset.stamp);
      if (mode === 'rank') return Number(b.dataset.rank) - Number(a.dataset.rank) || newest;
      if (mode === 'ending') return Number(a.dataset.deadline) - Number(b.dataset.deadline) || newest;
      return newest;
    });
    if (orderKey !== mode) {
      const fragment = document.createDocumentFragment();
      ordered.forEach(card => fragment.append(card)); list.append(fragment); orderKey = mode;
    }
    const matched = ordered.filter(card => {
      const sections = card.dataset.sections.split(' ');
      const archived = card.dataset.archived === 'true';
      if (state.view === 'all' && archived) return false;
      if (state.view === 'today' && !sections.includes('A')) return false;
      if (state.view === 'new' && !newlyCollected.has(card)) return false;
      if (state.view === 'rank' && !sections.includes('B')) return false;
      if (state.view === 'ending' && !sections.includes('G')) return false;
      if (state.view === 'archived' && !archived) return false;
      if (state.view === 'saved' && !savedIds.has(card.dataset.id)) return false;
      if (category.value === 'finance') { if (!['bank','ucard'].includes(card.dataset.category)) return false; }
      else if (category.value !== 'all' && card.dataset.category !== category.value) return false;
      if (type.value !== 'all' && card.dataset.type !== type.value) return false;
      if (requiredFields.length) {
        const facts = factsByCard.get(card);
        if (!requiredFields.every(field => facts[field] === 'true')) return false;
      }
      return !needle || card.dataset.search.includes(needle);
    });
    const pages = Math.max(1,Math.ceil(matched.length / PAGE_SIZE));
    state.page = Math.min(state.page,pages);
    const offset = (state.page - 1) * PAGE_SIZE;
    const visible = matched.slice(offset,offset + PAGE_SIZE);
    const visibleSet = new Set(visible);
    cards.forEach(card => {card.classList.remove('enter');card.hidden = !visibleSet.has(card);});
    if (animate && !reduced.matches) {
      visible.slice(0,Math.min(3,Math.ceil(visible.length/3))).forEach((card,index) => {
        card.style.setProperty('--delay',String(index*55)+'ms'); card.classList.add('enter');
      });
    }
    document.querySelector('#view-title').textContent = titles[state.view];
    const dueSaved = endingCards.filter(card => savedIds.has(card.dataset.id)).length;
    document.querySelector('#view-note').textContent = state.view === 'saved' && dueSaved
      ? notes.saved + ' 有 ' + dueSaved + ' 条收藏将在 7 天内截止。'
      : notes[state.view];
    endingCards.forEach(card => {
      card.querySelector('.saved-deadline').hidden = state.view !== 'saved' || !savedIds.has(card.dataset.id);
    });
    document.querySelector('#result-status').textContent = matched.length ? '共 '+matched.length+' 条 · 显示 '+(offset+1)+'–'+Math.min(offset+PAGE_SIZE,matched.length) : '找到 0 条';
    viewButtons.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.view === state.view)));
    const empty = document.querySelector('#empty-state'); empty.hidden = matched.length > 0;
    const noSaved = state.view === 'saved' && !cards.some(card => savedIds.has(card.dataset.id));
    document.querySelector('#empty-title').textContent = noSaved ? '把好机会，留给稍后的自己' : state.view === 'archived' && !needle && category.value === 'all' && type.value === 'all' ? '暂时没有已结束的活动' : '暂时没有匹配的情报';
    document.querySelector('#empty-note').textContent = noSaved ? '点击卡片右上角的书签即可收藏。收藏仅保存在当前浏览器。' : '试试更短的关键词，或放宽筛选条件。';
    document.querySelector('#pagination').hidden = matched.length <= PAGE_SIZE;
    document.querySelector('#page-info').textContent = state.page+' / '+pages;
    document.querySelector('#previous-page').disabled = state.page === 1;
    document.querySelector('#next-page').disabled = state.page === pages;
    document.querySelector('#clear-search').hidden = !q.value;
    document.querySelector('#reset-filters').hidden = !needle && !requiredFields.length && category.value === 'all' && type.value === 'all' && sort.value === 'newest';
    updateBookmarks(); updateUrl(); updateLanguage();
  }
  viewButtons.forEach(button => button.addEventListener('click',() => {clearTimeout(inputTimer);state.view = button.dataset.view;state.page = 1;render(true);}));
  q.addEventListener('input',() => {clearTimeout(inputTimer);state.page = 1;inputTimer = setTimeout(() => render(true),100);} );
  [category,type,sort,...evidence].forEach(control => control.addEventListener('change',() => {clearTimeout(inputTimer);state.page=1;render(true);}));
  document.querySelector('#clear-search').addEventListener('click',() => {clearTimeout(inputTimer);q.value='';state.page=1;render(true);q.focus();});
  document.querySelector('#reset-filters').addEventListener('click',reset);
  document.querySelector('#empty-reset').addEventListener('click',reset);
  list.addEventListener('click',event => {
    const button = event.target.closest('.bookmark'); if (!button) return;
    const card = button.closest('.card'); const id = card.dataset.id;
    if (savedIds.has(id)) savedIds.delete(id); else savedIds.add(id);
    try {localStorage.setItem('dh-saved',JSON.stringify(Array.from(savedIds)));canPersist=true;} catch {canPersist=false;}
    render(false);
    announce((savedIds.has(id) ? '已收藏' : '已取消收藏') + (canPersist ? ' · 仅此浏览器' : ' · 本次会话有效，浏览器未允许保存'));
    if (card.hidden) document.querySelector('#view-title').focus({preventScroll:true});
  });
  document.querySelectorAll('[data-set-lang]').forEach(node => node.addEventListener('click',event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();root.dataset.lang=node.dataset.setLang;
    try {localStorage.setItem('dh-lang',root.dataset.lang);} catch {}
    updateUrl();updateLanguage();
    announce(root.dataset.lang === 'zh' ? '已切换中文 · 没有译文时显示原文' : '已切换原文');
  }));
  [['#previous-page',-1],['#next-page',1]].forEach(([selector,delta]) => document.querySelector(selector).addEventListener('click',() => {
    state.page+=delta;render(true);
    const heading=document.querySelector('#results-heading'); heading.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});document.querySelector('#view-title').focus({preventScroll:true});
  }));
  document.addEventListener('keydown',event => {
    const editing = event.target.closest('input,textarea,select,[contenteditable="true"]');
    if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {event.preventDefault();q.focus();}
    if (event.key === 'Escape' && event.target === q && q.value) {q.value='';state.page=1;render(true);}
  });
  addEventListener('storage',event => {if(event.key==='dh-saved' || event.key===null){savedIds=readSaved();render(false);}});
  render(false);
})();
`;
