(function () {
  'use strict';

  const ROUTES = {
    overview: {
      index: '00',
      title: '今日总控',
      eyebrow: 'TODAY',
      description: '先看今天真正改变结果的三项决策，再看业务、日程与风险。',
      selectors: ['#executiveOverview', '[data-workspace-view~="overview"]']
    },
    assistant: {
      index: '01',
      title: 'AI 决策',
      eyebrow: 'INTELLIGENCE',
      description: '将总裁晨报、AI 建议、决策依据与执行动作放在同一条链路。',
      selectors: ['#briefing', '#assistant', '#aiWorkflow', '#decision', '.command-panel', '.decision-inbox', '[data-workspace-view~="assistant"]'],
      action: { label: '展开助理', target: '#toggleAssistant' }
    },
    briefing: {
      index: '02',
      title: 'AI 总裁晨报',
      eyebrow: 'EXECUTIVE BRIEFING',
      description: '只呈现今天需要Owner关注的经营信号、证据与风险。',
      selectors: ['#briefing', '#riskTrend', '#reports', '[data-workspace-view~="briefing"]'],
      action: { label: '查看完整分析', target: '#viewAnalysis' }
    },
    business: {
      index: '03',
      title: '业务组合',
      eyebrow: 'GLOBAL PORTFOLIO',
      description: '六项业务独立管理进程、渠道、客户、合同、交付、回款与材料。',
      selectors: ['#businessOperations', '[data-workspace-view~="business"]'],
      action: { label: '新增渠道', target: '#addChannel' }
    },
    channels: {
      index: '04',
      title: '渠道管理',
      eyebrow: 'CHANNEL OPERATIONS',
      description: '按业务隔离管理渠道、合作方、线索、签约、交付与回款。',
      selectors: ['#channels', '[data-workspace-view~="channels"]'],
      action: { label: '新增渠道', target: '#addChannel' }
    },
    decision: {
      index: '05',
      title: '决策中心',
      eyebrow: 'DECISION COMMAND',
      description: '把待决策事项、AI 建议、确认结果和执行动作放在同一条轨道。',
      selectors: ['#decision', '.command-panel', '.decision-inbox', '[data-workspace-view~="decision"]']
    },
    schedule: {
      index: '06',
      title: '日程执行',
      eyebrow: 'AGENDA',
      description: '按月、按日管理工作安排、固定任务、未完成事项与提醒。',
      selectors: ['#schedule', '[data-workspace-view~="schedule"]'],
      action: { label: '新增日程', target: '#addCalendarEvent' }
    },
    reports: {
      index: '07',
      title: '经营报告',
      eyebrow: 'EXECUTIVE REPORTING',
      description: '汇总已经确认的经营趋势、风险变化与周月度关键指标。',
      selectors: ['#riskTrend', '#reports', '#reportCenter', '[data-workspace-view~="reports"]'],
      action: { label: '更新月度数据', target: '#updateMonthlyData' }
    }
  };

  const routeNames = Object.keys(ROUTES);
  let activeRoute = 'overview';
  let pageHeader;
  let observer;

  function routeFromHash() {
    const match = window.location.hash.match(/^#view=([a-z-]+)/i);
    return match && ROUTES[match[1]] ? match[1] : 'overview';
  }

  function getMain() {
    return document.querySelector('main');
  }

  function ensurePageHeader() {
    const main = getMain();
    if (!main) return null;
    pageHeader = document.getElementById('workspacePageHeader');
    if (pageHeader) return pageHeader;

    pageHeader = document.createElement('section');
    pageHeader.id = 'workspacePageHeader';
    pageHeader.className = 'workspace-page-heading';
    pageHeader.setAttribute('aria-live', 'polite');
    pageHeader.innerHTML = [
      '<div class="workspace-page-number" aria-hidden="true"></div>',
      '<div class="workspace-page-copy">',
      '  <div class="workspace-breadcrumb"><button type="button" data-workspace-route="overview">AI CEO OS OS</button><span>/</span><strong></strong></div>',
      '  <p class="workspace-page-eyebrow"></p>',
      '  <h2></h2>',
      '  <p class="workspace-page-description"></p>',
      '</div>',
      '<div class="workspace-page-actions">',
      '  <span class="workspace-owner-pill">OWNER VIEW</span>',
      '  <button type="button" class="workspace-context-action"></button>',
      '  <button type="button" class="workspace-back" data-workspace-route="overview">← 返回总览</button>',
      '</div>'
    ].join('');

    const topbar = main.querySelector('.topbar');
    if (topbar) topbar.insertAdjacentElement('afterend', pageHeader);
    else main.prepend(pageHeader);
    return pageHeader;
  }

  function ensureMobileRoutes() {
    const nav = document.querySelector('.mobile-nav');
    if (!nav) return;
    const primaryRoutes = ['overview', 'business', 'assistant', 'schedule'];
    Array.from(nav.querySelectorAll('[data-target]')).forEach((button) => {
      if (!primaryRoutes.includes(button.dataset.target)) button.remove();
    });
    nav.setAttribute('aria-label', '工作台页面导航');
  }

  function managedNodes() {
    const main = getMain();
    if (!main) return [];
    const direct = Array.from(main.children).filter((node) =>
      node !== pageHeader && node.matches('section, .lower-grid') && !node.classList.contains('topbar')
    );
    const lower = Array.from(main.querySelectorAll('.lower-grid > section'));
    const extensions = Array.from(main.querySelectorAll('[data-workspace-view]'));
    return Array.from(new Set([...direct, ...lower, ...extensions]));
  }

  function revealNode(node) {
    const main = getMain();
    if (!node || !main) return;
    node.classList.remove('workspace-page-hidden');

    let parent = node.parentElement;
    while (parent && parent !== main) {
      if (parent.classList.contains('lower-grid') || parent.hasAttribute('data-workspace-view')) {
        parent.classList.remove('workspace-page-hidden');
      }
      parent = parent.parentElement;
    }
  }

  function renderVisibility(routeName) {
    const main = getMain();
    if (!main) return;
    managedNodes().forEach((node) => node.classList.add('workspace-page-hidden'));

    ROUTES[routeName].selectors.forEach((selector) => {
      main.querySelectorAll(selector).forEach(revealNode);
    });

    main.querySelectorAll('.lower-grid').forEach((grid) => {
      const hasVisibleChild = Array.from(grid.children).some((child) =>
        !child.classList.contains('workspace-page-hidden')
      );
      grid.classList.toggle('workspace-page-hidden', !hasVisibleChild);
      grid.classList.toggle('workspace-single-panel', hasVisibleChild && Array.from(grid.children).filter((child) => !child.classList.contains('workspace-page-hidden')).length === 1);
    });
  }

  function renderHeader(routeName) {
    const header = ensurePageHeader();
    if (!header) return;
    const route = ROUTES[routeName];
    header.querySelector('.workspace-page-number').textContent = route.index;
    header.querySelector('.workspace-breadcrumb strong').textContent = route.title;
    header.querySelector('.workspace-page-eyebrow').textContent = route.eyebrow;
    header.querySelector('h2').textContent = route.title;
    header.querySelector('.workspace-page-description').textContent = route.description;

    const back = header.querySelector('.workspace-back');
    const owner = header.querySelector('.workspace-owner-pill');
    back.hidden = routeName === 'overview';
    owner.hidden = routeName !== 'overview';

    const actionButton = header.querySelector('.workspace-context-action');
    const action = route.action;
    actionButton.hidden = !action;
    actionButton.onclick = null;
    if (action) {
      actionButton.textContent = action.label;
      actionButton.onclick = () => {
        if (action.route) {
          setRoute(action.route);
          return;
        }
        const target = document.querySelector(action.target);
        if (target) target.click();
      };
    }
  }

  function updateNavigation(routeName) {
    document.querySelectorAll('.nav-item, .mobile-nav button').forEach((button) => {
      const navigationRoute = routeName === 'channels' ? 'business' : routeName;
      const selected = button.dataset.target === navigationRoute;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function setRoute(routeName, options) {
    const nextRoute = ROUTES[routeName] ? routeName : 'overview';
    const opts = options || {};
    activeRoute = nextRoute;
    document.body.classList.add('workspace-pages-ready');
    document.body.dataset.workspaceRoute = nextRoute;
    renderHeader(nextRoute);
    renderVisibility(nextRoute);
    updateNavigation(nextRoute);

    const desiredHash = `#view=${nextRoute}`;
    if (!opts.fromHash && window.location.hash !== desiredHash) {
      if (opts.replace) window.history.replaceState({ workspaceRoute: nextRoute }, '', desiredHash);
      else window.history.pushState({ workspaceRoute: nextRoute }, '', desiredHash);
    }

    if (!opts.preserveScroll) window.scrollTo({ top: 0, behavior: opts.instant ? 'auto' : 'smooth' });
    document.dispatchEvent(new CustomEvent('workspace:routechange', { detail: { route: nextRoute } }));
  }

  function onNavigationClick(event) {
    const routeButton = event.target.closest('button[data-workspace-route], a[data-workspace-route], #nav [data-target], .mobile-nav [data-target]');
    if (!routeButton) return;
    const routeName = routeButton.dataset.workspaceRoute || routeButton.dataset.target;
    if (!ROUTES[routeName]) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setRoute(routeName);
  }

  function onDecisionTaskClick(event) {
    const taskNode = event.target.closest('.orbit-node[data-step="tasks"]');
    if (!taskNode) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    setRoute('schedule');
  }

  function observeExtensions() {
    const main = getMain();
    if (!main || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((records) => {
      if (!records.some((record) => record.addedNodes.length || record.removedNodes.length)) return;
      window.requestAnimationFrame(() => renderVisibility(activeRoute));
    });
    observer.observe(main, { childList: true, subtree: true });
  }

  function init() {
    if (!getMain()) return;
    ensurePageHeader();
    ensureMobileRoutes();
    setRoute(routeFromHash(), { replace: true, fromHash: true, instant: true });
    observeExtensions();
  }

  document.addEventListener('click', onNavigationClick, true);
  document.addEventListener('click', onDecisionTaskClick, true);
  window.addEventListener('hashchange', () => setRoute(routeFromHash(), { fromHash: true, instant: true }));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.WorkspaceRouter = {
    go: (routeName) => setRoute(routeName),
    current: () => activeRoute,
    routes: () => routeNames.slice(),
    refresh: () => renderVisibility(activeRoute),
    destroy: () => observer && observer.disconnect()
  };
})();
