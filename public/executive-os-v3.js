(function () {
  'use strict';

  const BUSINESS_LABELS = {
    germany: ['德国就业', 'Germany Employment', 78, '稳健增长'],
    bearing: ['分销业务', 'Bearing', 64, '运营优化'],
    supply: ['供应链', 'Supply Chain', 55, '效率提升'],
    trade: ['国际贸易', 'International Trade', 42, '有序推进'],
    content: ['内容与 AI 业务', 'Content & AI', 61, '能力建设'],
    gene: ['健康创新业务', 'Gene Testing', 36, '研发推进']
  };

  const PRESET_CHANNELS = {
    yuejiao: { id: 'yuejiao', business: 'germany', stage: '协议审核', leads: '27', signed: '', delivered: '', revenue: '' },
    dalian: { id: 'dalian', business: 'germany', stage: '资料待录入', leads: '', signed: '', delivered: '', revenue: '' },
    bearing: { id: 'bearing', business: 'bearing', stage: '待录入', leads: '', signed: '', delivered: '', revenue: '' },
    supply: { id: 'supply', business: 'supply', stage: '待录入', leads: '', signed: '', delivered: '', revenue: '' },
    trade: { id: 'trade', business: 'trade', stage: '待录入', leads: '', signed: '', delivered: '', revenue: '' },
    content: { id: 'content', business: 'content', stage: '待录入', leads: '', signed: '', delivered: '', revenue: '' },
    gene: { id: 'gene', business: 'gene', stage: '待录入', leads: '', signed: '', delivered: '', revenue: '' }
  };

  const FALLBACK_RISKS = [
    { id: 'agreement', level: 'P0', title: '确认德国就业首批签约节点', business: '德国就业', source: '协议与渠道记录', status: 'open', due: '今天' },
    { id: 'bearing', level: 'P0', title: '完成轴承库存分级', business: '分销业务', source: '库存盘点', status: 'open', due: '12:00' },
    { id: 'supply', level: 'P1', title: '锁定供应链 9 月报价', business: '供应链', source: '供应商沟通', status: 'open', due: '15:00' }
  ];

  const FALLBACK_EVENTS = [
    { id: 'seed-1', date: localDateISO(new Date()), time: '09:30', title: '经营例会', business: '全局业务', duration: '60 分钟', repeat: 'daily', completedDates: [localDateISO(new Date())] },
    { id: 'seed-2', date: localDateISO(new Date()), time: '11:30', title: '德国团队视频会', business: '国际人才项目', duration: '60 分钟', repeat: 'none', completedDates: [] },
    { id: 'seed-3', date: localDateISO(new Date()), time: '14:00', title: '供应链专项评审', business: '供应链业务', duration: '90 分钟', repeat: 'none', completedDates: [] },
    { id: 'seed-4', date: localDateISO(new Date()), time: '16:30', title: 'AI 内容与品牌会', business: '内容与 AI 业务', duration: '60 分钟', repeat: 'weekly', completedDates: [] }
  ];

  const ICONS = {
    today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7V7"/></svg>',
    portfolio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4"/></svg>',
    intelligence: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 22h4M8.5 14.5A7 7 0 1 1 15.5 14.5C14.5 15.3 14 16 14 18h-4c0-2-.5-2.7-1.5-3.5Z"/></svg>',
    agenda: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v3m14-3v3M4 8h16M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2Zm3 7h3m2 0h3m-8 4h3m2 0h3"/></svg>',
    reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 17V9m6 8V4m6 13v-5"/></svg>'
  };

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }
  function localDateISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function eventOccurs(item, date) {
    if (!item || !item.date || date < item.date) return false;
    if (item.repeat === 'daily') return true;
    if (item.repeat === 'weekly') {
      const start = new Date(`${item.date}T00:00:00`);
      const target = new Date(`${date}T00:00:00`);
      return Math.round((target - start) / 86400000) % 7 === 0;
    }
    const endDate = item.endDate && item.endDate >= item.date ? item.endDate : item.date;
    return date <= endDate;
  }
  function numeric(value) {
    const raw = String(value == null ? '' : value).replace(/[^0-9.-]/g, '');
    return raw === '' ? null : Number(raw);
  }
  function sumKnown(items, field) {
    const values = items.map((item) => numeric(item[field])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  function formatValue(value, prefix) {
    return Number.isFinite(value) ? `${prefix || ''}${value.toLocaleString('zh-CN')}` : '—';
  }
  function readChannels() {
    const saved = readJSON('ai-ceo-preset-channels', {});
    const preset = Object.keys(PRESET_CHANNELS).map((id) => ({ ...PRESET_CHANNELS[id], ...(saved[id] || {}) }));
    const custom = readJSON('ai-ceo-custom-channels', []);
    return preset.concat(Array.isArray(custom) ? custom : []);
  }
  function readRisks() {
    const saved = readJSON('ai-ceo-risk-register', null);
    if (!Array.isArray(saved)) return FALLBACK_RISKS;
    return saved.filter((item) => item.status !== 'closed').map((item) => ({
      ...item,
      source: item.evidence || '经营风险台账',
      business: BUSINESS_LABELS[item.business]?.[0] || item.business || '老板总控',
      due: item.due || '待定'
    }));
  }
  function readEvents() {
    const saved = readJSON('ai-ceo-calendar-events', null);
    return Array.isArray(saved) ? saved : FALLBACK_EVENTS;
  }
  function todayEvents() {
    const date = localDateISO(new Date());
    return readEvents().filter((item) => eventOccurs(item, date)).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }
  function selectedRisks() {
    const risks = readRisks();
    return (risks.length ? risks : FALLBACK_RISKS).slice(0, 3);
  }

  function businessIdFor(item) {
    const business = item?.business;
    if (business && BUSINESS_LABELS[business]) return business;
    const matched = Object.entries(BUSINESS_LABELS).find(([, labels]) => labels[0] === business);
    if (matched) return matched[0];
    if (item?.id === 'bearing' || /轴承/.test(item?.title || '')) return 'bearing';
    if (item?.id === 'supply' || /供应链|团购/.test(item?.title || '')) return 'supply';
    return 'germany';
  }

  function injectIcons() {
    $$('[data-os-icon]').forEach((node) => {
      const name = node.dataset.osIcon;
      if (ICONS[name] && !node.querySelector('svg')) node.innerHTML = ICONS[name];
    });
  }

  function constellationMarkup() {
    const nodes = [
      { id: 'germany', x: 220, y: 35, lx: 220, ly: 11, anchor: 'middle' },
      { id: 'bearing', x: 354, y: 112, lx: 386, ly: 95, anchor: 'start' },
      { id: 'supply', x: 354, y: 258, lx: 386, ly: 274, anchor: 'start' },
      { id: 'trade', x: 220, y: 335, lx: 220, ly: 372, anchor: 'middle' },
      { id: 'content', x: 86, y: 258, lx: 54, ly: 274, anchor: 'end' },
      { id: 'gene', x: 86, y: 112, lx: 54, ly: 95, anchor: 'end' }
    ];
    return `<svg class="os-constellation-svg" viewBox="0 0 440 390" role="img" aria-label="六项业务组合星图">
      <circle class="orbit orbit-outer" cx="220" cy="185" r="150"/><circle class="orbit" cx="220" cy="185" r="106"/><circle class="orbit orbit-inner" cx="220" cy="185" r="72"/>
      <path class="axis" d="M220 20V350M55 185H385"/>
      ${nodes.map((node) => {
        const item = BUSINESS_LABELS[node.id];
        return `<g class="constellation-node" data-os-business="${node.id}" role="button" tabindex="0" aria-label="进入${item[0]}"><line x1="220" y1="185" x2="${node.x}" y2="${node.y}"/><circle cx="${node.x}" cy="${node.y}" r="7"/><circle class="node-core" cx="${node.x}" cy="${node.y}" r="2.4"/><text x="${node.lx}" y="${node.ly}" text-anchor="${node.anchor}"><tspan>${item[0]}</tspan><tspan class="latin" x="${node.lx}" dy="17">${item[1]}</tspan><tspan class="status" x="${node.lx}" dy="18">${item[2]}% · ${item[3]}</tspan></text></g>`;
      }).join('')}
      <g class="constellation-center"><circle cx="220" cy="185" r="48"/><text x="220" y="180" text-anchor="middle">AI CEO OS</text><text class="latin" x="220" y="200" text-anchor="middle">EXECUTIVE OS</text></g>
    </svg>`;
  }

  function createOverview() {
    if ($('#executiveOverview')) return $('#executiveOverview');
    const section = document.createElement('section');
    section.id = 'executiveOverview';
    section.className = 'executive-overview-v3';
    section.dataset.workspaceView = 'overview';
    section.innerHTML = `
      <div class="os-hero">
        <div class="os-hero-copy">
          <div class="os-brief-date"><span>EXECUTIVE BRIEFING</span><b id="osBriefDate"></b></div>
          <h1><span data-zh="今天，只推进三件" data-en="Today, move only three">今天，只推进三件</span><em data-zh="真正改变结果的事。" data-en="decisions that change outcomes.">真正改变结果的事。</em></h1>
          <p class="os-hero-en">Three decisions move the portfolio forward.</p>
          <div class="os-gold-rule"></div>
          <div class="os-strategic-head"><strong>STRATEGIC FOCUS</strong><span>重点推进事项</span></div>
          <div class="os-strategic-list" id="osStrategicList"></div>
        </div>
        <div class="os-portfolio-map">
          <div class="os-panel-heading"><div><strong>业务组合全景</strong><span>Portfolio Constellation</span></div><small>六项业务 · 全球布局 · 实时状态</small></div>
          ${constellationMarkup()}
          <div class="os-mobile-pulse">${Object.entries(BUSINESS_LABELS).map(([id, item]) => `<button type="button" data-mobile-business="${id}"><i></i><strong>${item[0]}</strong><small>${item[1]}</small><em>${item[2]}% · ${item[3]}</em></button>`).join('')}</div>
          <div class="os-portfolio-note"><b>稳健增长</b><span>创建更大的长期可能</span></div>
        </div>
      </div>
      <div class="os-performance" id="osPerformance"></div>
      <div class="os-daily-grid">
        <section class="os-agenda-preview">
          <header><div><strong>今日日程</strong><span>Today’s Agenda</span></div><button type="button" data-os-route="schedule">查看完整日程</button></header>
          <div id="osAgendaList"></div>
        </section>
        <section class="os-decision-preview">
          <header><div><strong>待我决策</strong><span>Pending Decisions</span></div><button type="button" data-os-route="assistant">进入 AI 决策</button></header>
          <div id="osDecisionList"></div>
        </section>
      </div>
      <footer class="os-overview-footer"><span>AI CEO OS — A MORE LIVABLE WORLD</span><button type="button" data-os-route="reports">查看经营报告 · Reports</button></footer>`;
    const anchor = $('#briefing');
    if (anchor) anchor.before(section);
    else $('main')?.appendChild(section);
    return section;
  }

  function renderStrategic() {
    const root = $('#osStrategicList');
    if (!root) return;
    const risks = selectedRisks();
    root.innerHTML = risks.map((item, index) => {
      const businessId = businessIdFor(item);
      const action = businessId === 'germany' ? `data-os-decision="${index}"` : `data-os-business="${businessId}"`;
      return `<button type="button" class="os-strategic-row" ${action}>
      <span class="os-row-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="os-row-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.action || item.source || '经营数据核验')} · 来源 ${escapeHTML(item.business || '老板总控')}</small></span>
      <span class="os-row-meta"><small>${escapeHTML(item.source || '风险台账')}</small><b>${escapeHTML(item.due || '待定')}</b></span>
      <i aria-hidden="true">${chevronSVG()}</i>
    </button>`;
    }).join('');
  }

  function renderPerformance() {
    const root = $('#osPerformance');
    if (!root) return;
    const channels = readChannels();
    const revenue = sumKnown(channels, 'revenue');
    const activeChannels = channels.filter((item) => item.stage && !['待录入', '资料待录入'].includes(item.stage)).length;
    const delivered = sumKnown(channels, 'delivered');
    const riskCount = readRisks().length;
    const metrics = [
      ['经核验收入', 'Verified Revenue', formatValue(revenue, '¥'), revenue == null ? '待财务凭证' : 'ERP VERIFIED', revenue == null ? 'pending' : 'verified'],
      ['活跃渠道', 'Active Channels', formatValue(activeChannels), 'CRM VERIFIED', 'verified'],
      ['交付管线', 'Delivery Pipeline', formatValue(delivered), delivered == null ? '待结果回填' : 'PM VERIFIED', delivered == null ? 'pending' : 'verified'],
      ['风险信号', 'Risk Signals', formatValue(riskCount), 'RISK REVIEW', riskCount ? 'risk' : 'verified']
    ];
    root.innerHTML = metrics.map(([zh, en, value, source, state]) => `<div class="os-metric ${state}"><div><span>${zh}</span><small>${en}</small></div><strong>${value}</strong><p><i></i>${source}</p></div>`).join('');
  }

  function renderAgenda() {
    const root = $('#osAgendaList');
    if (!root) return;
    const events = todayEvents().slice(0, 4);
    const today = localDateISO(new Date());
    root.innerHTML = events.length ? events.map((item) => {
      const done = (item.completedDates || []).includes(today);
      return `<article class="os-agenda-row ${done ? 'done' : ''}"><time>${escapeHTML(item.time || '--:--')}</time><button type="button" class="os-event-state" data-event-id="${escapeHTML(item.id)}" aria-label="切换完成状态"><span></span></button><div><strong>${escapeHTML(item.title || '未命名日程')}</strong><small>${escapeHTML([item.business, item.duration].filter(Boolean).join(' · '))}</small></div><em>${done ? '已完成' : '待执行'}</em></article>`;
    }).join('') : '<p class="os-empty">今天还没有日程。可以在日程执行中新增安排。</p>';
  }

  function renderDecisions() {
    const root = $('#osDecisionList');
    if (!root) return;
    root.innerHTML = selectedRisks().map((item, index) => {
      const businessId = businessIdFor(item);
      const action = businessId === 'germany' ? `data-os-decision="${index}"` : `data-os-business="${businessId}"`;
      return `<button type="button" class="os-pending-row" ${action}><span class="${item.level === 'P0' ? 'critical' : ''}"></span><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.action || item.source || '等待经营数据核验')}</small></div><em>${escapeHTML(item.level || 'P1')}</em><i>${chevronSVG()}</i></button>`;
    }).join('');
  }

  function toggleEvent(id) {
    const events = readEvents();
    const event = events.find((item) => String(item.id) === String(id));
    if (!event) return;
    const today = localDateISO(new Date());
    const complete = new Set(event.completedDates || []);
    complete.has(today) ? complete.delete(today) : complete.add(today);
    event.completedDates = Array.from(complete);
    localStorage.setItem('ai-ceo-calendar-events', JSON.stringify(events));
    renderAgenda();
    document.dispatchEvent(new Event('executive-os:datachange'));
  }

  function updateClock() {
    const now = new Date();
    const formatTime = (zone) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(now);
    const beijing = $('#beijingTime');
    const berlin = $('#berlinTime');
    const date = $('#today');
    const briefDate = $('#osBriefDate');
    if (beijing) beijing.textContent = formatTime('Asia/Shanghai');
    if (berlin) berlin.textContent = formatTime('Europe/Berlin');
    if (date) date.textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(now);
    if (briefDate) briefDate.textContent = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).format(now).toUpperCase();
  }

  function setLanguage(language) {
    const next = language === 'en' ? 'en' : 'zh';
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    document.body.dataset.language = next;
    localStorage.setItem('qu-executive-language', next);
    $$('[data-zh][data-en]').forEach((node) => { node.textContent = node.dataset[next]; });
    const heroLead = $('.os-hero h1 > span');
    if (heroLead && next === 'en') heroLead.textContent = `${heroLead.dataset.en}\u00a0`;
    const navCopy = {
      overview: ['今日总控', 'Today'], business: ['业务组合', 'Portfolio'], assistant: ['AI 决策', 'Intelligence'],
      schedule: ['日程执行', 'Agenda'], reports: ['经营报告', 'Reports']
    };
    $$('#nav .nav-item').forEach((button) => {
      const pair = navCopy[button.dataset.target];
      if (!pair) return;
      const label = $('span b', button);
      const sub = $('span small', button);
      if (label) label.textContent = next === 'en' ? pair[1] : pair[0];
      if (sub) sub.textContent = next === 'en' ? pair[0] : pair[1];
    });
    const toggle = $('#languageToggle');
    if (toggle) toggle.classList.toggle('english', next === 'en');
  }

  function renderAll() {
    renderStrategic();
    renderPerformance();
    renderAgenda();
    renderDecisions();
    updateClock();
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const route = event.target.closest('[data-os-route]');
      if (route) {
        const name = route.dataset.osRoute;
        if (window.WorkspaceRouter) window.WorkspaceRouter.go(name);
      }
      const businessTarget = event.target.closest('[data-os-business]');
      if (businessTarget) {
        if (window.WorkspaceRouter) window.WorkspaceRouter.go('business');
        window.setTimeout(() => document.querySelector(`[data-business-id="${businessTarget.dataset.osBusiness}"]`)?.click(), 180);
      }
      const decision = event.target.closest('[data-os-decision]');
      if (decision) {
        if (window.WorkspaceRouter) window.WorkspaceRouter.go('assistant');
        window.setTimeout(() => document.querySelector('.open-decision')?.click(), 180);
      }
      const eventToggle = event.target.closest('[data-event-id]');
      if (eventToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleEvent(eventToggle.dataset.eventId);
      }
      const business = event.target.closest('[data-mobile-business]');
      if (business) {
        if (window.WorkspaceRouter) window.WorkspaceRouter.go('business');
        window.setTimeout(() => document.querySelector(`[data-business-id="${business.dataset.mobileBusiness}"]`)?.click(), 200);
      }
    });
    document.addEventListener('keydown', (event) => {
      const constellation = event.target.closest?.('.constellation-node[data-os-business]');
      if (!constellation || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (window.WorkspaceRouter) window.WorkspaceRouter.go('business');
      window.setTimeout(() => document.querySelector(`[data-business-id="${constellation.dataset.osBusiness}"]`)?.click(), 180);
    });
    $('#languageToggle')?.addEventListener('click', () => {
      const current = document.body.dataset.language || 'zh';
      setLanguage(current === 'zh' ? 'en' : 'zh');
    });
    window.addEventListener('storage', renderAll);
    document.addEventListener('executive-os:datachange', renderAll);
    document.addEventListener('workspace:routechange', () => window.setTimeout(renderAll, 30));
  }

  function enhancePageHeadings() {
    const descriptions = {
      business: ['六项业务，一张经营地图。', 'Six businesses. One operating view.'],
      assistant: ['让每项判断都有依据，让每个决定进入执行。', 'From evidence to executive action.'],
      schedule: ['把时间留给真正改变结果的工作。', 'Protect time for what changes outcomes.'],
      reports: ['只呈现已核验的结果与需要行动的风险。', 'Verified performance. Actionable risk.']
    };
    document.addEventListener('workspace:routechange', (event) => {
      const route = event.detail?.route;
      const pair = descriptions[route];
      const header = $('#workspacePageHeader');
      if (!pair || !header) return;
      const description = $('.workspace-page-description', header);
      if (description) description.innerHTML = `${pair[0]} <span>${pair[1]}</span>`;
    });
  }

  function fetchMonitorSummary() {
    fetch('/api/automations', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const active = tasks.filter((item) => item.status === 'ACTIVE').length;
      const sync = $('.os-sync');
      if (sync) sync.innerHTML = `<i></i>${active ? `${active} MONITORS SYNCED` : 'VERIFIED SYNC'}`;
    }).catch(() => {});
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }
  function chevronSVG() {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg>';
  }

  function init() {
    createOverview();
    injectIcons();
    bind();
    enhancePageHeadings();
    setLanguage(localStorage.getItem('qu-executive-language') || 'zh');
    renderAll();
    fetchMonitorSummary();
    window.setInterval(updateClock, 30000);
    window.setInterval(renderAll, 60000);
    if (window.WorkspaceRouter) window.WorkspaceRouter.refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
