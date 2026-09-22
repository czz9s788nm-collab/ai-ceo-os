(function businessOperationsModule() {
  'use strict';

  const STORAGE_KEY = 'ai-ceo-os:business-operations:v1';
  const EMPTY = '—';
  const todayISO = () => {
    const date = new Date();
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const BUSINESS_CONFIG = [
    {
      id: 'germany',
      name: '国际人才项目',
      shortName: '国际人才项目',
      ownership: '德斯本达集团',
      role: '核心现金流 · 信任锚点',
      status: '渠道验证中',
      accent: 'gold',
      stages: ['渠道建立', '首批资料', '协议签约', '手续付款', '匹配交付'],
      currentStage: 2,
      kpis: [
        ['confirmedLeads', '已确认学员/线索', '人'],
        ['signed', '已正式签约', '人'],
        ['delivered', '已赴德/已入学', '人'],
        ['collections', '已核验回款', '元'],
        ['refunds', '已退款', '元'],
        ['unitCost', '单人成本', '元/人']
      ],
      nextPrompt: '优先补齐签约、回款、退款与交付凭证，形成可对外核验的首批项目闭环。'
    },
    {
      id: 'bearing',
      name: '分销业务',
      shortName: '轴承',
      ownership: 'Owner个人业务',
      role: '个人主业务 · 现金变现',
      status: '库存盘点中',
      accent: 'cyan',
      stages: ['库存建档', '库龄分层', '客户匹配', '报价成交', '回款清库'],
      currentStage: 0,
      kpis: [
        ['skuCount', '已盘点型号', '个'],
        ['inventoryUnits', '库存数量', '件'],
        ['inventoryValue', '库存货值', '元'],
        ['agedUnits', '超龄库存', '件'],
        ['activeCustomers', '有效客户', '家'],
        ['collections', '已核验回款', '元']
      ],
      nextPrompt: '先完成型号、成本、库龄与客户对应关系，再识别可快速变现的库存组合。'
    },
    {
      id: 'supply',
      name: '供应链业务',
      shortName: '供应链',
      ownership: '德斯本达集团',
      role: '增长业务 · 独立销售漏斗',
      status: '方案准备中',
      accent: 'cyan',
      stages: ['商品池', '供应商定价', '企业客户', '报价下单', '交付复购'],
      currentStage: 1,
      kpis: [
        ['activeProducts', '可售产品', '个'],
        ['suppliers', '有效供应商', '家'],
        ['buyerAccounts', '企业客户', '家'],
        ['orders', '已确认订单', '单'],
        ['collections', '已核验回款', '元'],
        ['grossMargin', '已核验毛利率', '%']
      ],
      nextPrompt: '按产品、供应商、企业客户、报价、订单与回款建立独立经营漏斗。'
    },
    {
      id: 'trade',
      name: '国际增长业务',
      shortName: '国际贸易',
      ownership: '德斯本达集团',
      role: '战略业务 · 单点试验',
      status: '机会筛选中',
      accent: 'cyan',
      stages: ['市场筛选', '买家询盘', '报价样品', '合同收款', '出运交付'],
      currentStage: 0,
      kpis: [
        ['targetMarkets', '目标市场', '个'],
        ['qualifiedInquiries', '有效询盘', '条'],
        ['quotations', '正式报价', '份'],
        ['samples', '样品/方案', '份'],
        ['contracts', '已签合同', '份'],
        ['collections', '已核验回款', '元']
      ],
      nextPrompt: '坚持单市场、单品类、单客户类型试验，先验证真实询盘与回款路径。'
    },
    {
      id: 'content',
      name: '内容与 AI 业务',
      shortName: '内容与 AI 业务',
      ownership: '德斯本达集团',
      role: '增长引擎 · 线索基础设施',
      status: '内容测试中',
      accent: 'cyan',
      stages: ['定位选题', '内容生产', '发布分发', '线索承接', '成交复盘'],
      currentStage: 1,
      kpis: [
        ['published', '已发布内容', '条'],
        ['validLeads', '有效线索', '条'],
        ['consultations', '咨询沟通', '人'],
        ['converted', '成交客户', '人'],
        ['collections', '已核验回款', '元'],
        ['aiFlows', '已运行 AI 流程', '个']
      ],
      nextPrompt: '把内容、线索来源、咨询、转化与成交结果串成可追溯的增长闭环。'
    },
    {
      id: 'gene',
      name: '健康创新业务',
      shortName: '健康创新业务',
      ownership: 'Owner个人独立业务',
      role: '个人独立 · 隐私隔离',
      status: '合规准备中',
      accent: 'privacy',
      privacy: true,
      stages: ['合规审查', '渠道授权', '客户知情', '样本检测', '报告交付'],
      currentStage: 0,
      kpis: [
        ['partners', '授权合作渠道', '家'],
        ['orders', '有效订单', '单'],
        ['samples', '已采集样本', '份'],
        ['reports', '已交付报告', '份'],
        ['collections', '已核验回款', '元'],
        ['consentRate', '知情授权完整率', '%']
      ],
      nextPrompt: '健康数据、客户身份与检测报告仅进入个人隔离区；展示层只呈现脱敏经营结果。'
    }
  ];

  const RECORD_TYPES = {
    milestone: '关键里程碑',
    channel: '渠道',
    customer: '客户/学员',
    payment: '回款',
    delivery: '交付',
    material: '材料凭证',
    risk: '风险事项'
  };

  function seedBusiness(config) {
    const metrics = Object.fromEntries(config.kpis.map(([key]) => [key, null]));
    const seeded = {
      stage: config.currentStage,
      metrics,
      records: [],
      updatedAt: null,
      executiveNote: ''
    };
    if (config.id === 'germany') {
      seeded.metrics.confirmedLeads = '27';
      seeded.updatedAt = '2026-08-29';
      seeded.records.push({
        id: 'germany-yuejiao-first-batch',
        date: '2026-08-29',
        type: 'material',
        title: '示例教育伙伴首批中文简历完成核验',
        status: '待确认',
        counterpart: '示例教育服务机构',
        result: '首批中文简历 27 份已核验；另有 1 名补充候选。签约、回款与交付结果尚未提供。',
        amount: '',
        source: '微信业务群、简历合集与项目书',
        createdAt: '2026-08-29'
      });
    }
    return seeded;
  }

  function defaultState() {
    return {
      version: 1,
      activeBusiness: 'germany',
      businesses: Object.fromEntries(BUSINESS_CONFIG.map((config) => [config.id, seedBusiness(config)]))
    };
  }

  function mergeState(saved) {
    const base = defaultState();
    if (!saved || typeof saved !== 'object') return base;
    base.activeBusiness = BUSINESS_CONFIG.some((item) => item.id === saved.activeBusiness)
      ? saved.activeBusiness
      : base.activeBusiness;
    BUSINESS_CONFIG.forEach((config) => {
      const incoming = saved.businesses?.[config.id];
      if (!incoming || typeof incoming !== 'object') return;
      base.businesses[config.id] = {
        ...base.businesses[config.id],
        ...incoming,
        metrics: { ...base.businesses[config.id].metrics, ...(incoming.metrics || {}) },
        records: Array.isArray(incoming.records) ? incoming.records : base.businesses[config.id].records
      };
    });
    return base;
  }

  function readState() {
    try {
      return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch (error) {
      console.warn('[Business Operations] Invalid local data; using verified defaults.', error);
      return defaultState();
    }
  }

  let state = readState();
  let activeFilter = 'all';
  let editingRecordId = null;
  let pendingDeleteId = null;

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('qu:business-operations-updated', {
      detail: { businessId: state.activeBusiness, state }
    }));
  }

  function getConfig(id = state.activeBusiness) {
    return BUSINESS_CONFIG.find((item) => item.id === id) || BUSINESS_CONFIG[0];
  }

  function getData(id = state.activeBusiness) {
    return state.businesses[id] || seedBusiness(getConfig(id));
  }

  function hasValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  function formatMetric(value, unit) {
    if (!hasValue(value)) return EMPTY;
    const raw = String(value).trim();
    if ((unit === '元' || unit === '元/人') && !Number.isNaN(Number(raw))) {
      return `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(raw))}`;
    }
    if (unit === '%') return `${raw}%`;
    return raw;
  }

  function formatDate(value) {
    if (!value) return EMPTY;
    const parts = String(value).split('-');
    return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : escapeHTML(value);
  }

  function recordCounts(records) {
    const count = (type) => records.filter((record) => record.type === type).length;
    const paymentAmounts = records
      .filter((record) => record.type === 'payment' && hasValue(record.amount) && !Number.isNaN(Number(record.amount)))
      .map((record) => Number(record.amount));
    return {
      channels: count('channel') || EMPTY,
      customers: count('customer') || EMPTY,
      deliveries: count('delivery') || EMPTY,
      payments: paymentAmounts.length
        ? `¥${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(paymentAmounts.reduce((sum, item) => sum + item, 0))}`
        : EMPTY
    };
  }

  function completeness(config, data) {
    const metricTotal = config.kpis.length;
    const filledMetrics = config.kpis.filter(([key]) => hasValue(data.metrics[key])).length;
    const evidenceRecords = data.records.filter((record) => hasValue(record.source)).length;
    if (!filledMetrics && !data.records.length) return null;
    const metricScore = filledMetrics / metricTotal * 75;
    const evidenceScore = data.records.length ? evidenceRecords / data.records.length * 25 : 0;
    return Math.round(metricScore + evidenceScore);
  }

  function createSection() {
    if (document.getElementById('businessOperations')) return document.getElementById('businessOperations');
    const section = document.createElement('section');
    section.className = 'business-operations';
    section.id = 'businessOperations';
    section.dataset.workspaceView = 'business';
    section.innerHTML = `
      <div class="bops-section-head">
        <div>
          <p class="eyebrow">BUSINESS OPERATING LEDGER</p>
          <h3>六大业务经营档案</h3>
          <p>按业务独立记录指标、阶段、客户、渠道、回款与可核验经营结果。</p>
        </div>
        <div class="bops-head-actions">
          <button type="button" class="bops-secondary" data-bops-action="channels">进入渠道管理</button>
          <button type="button" class="bops-primary" data-bops-action="metrics">录入经营数据</button>
        </div>
      </div>
      <div class="bops-command" id="bopsCommand"></div>
      <div class="bops-shell">
        <nav class="bops-business-nav" id="bopsBusinessNav" aria-label="六大业务经营档案"></nav>
        <div class="bops-detail" id="bopsDetail"></div>
      </div>`;
    const anchor = document.getElementById('business');
    if (anchor) anchor.insertAdjacentElement('afterend', section);
    else document.querySelector('main')?.appendChild(section);
    return section;
  }

  function createModalShells() {
    if (document.getElementById('bopsMetricModal')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="bops-modal" id="bopsMetricModal" aria-hidden="true">
        <div class="bops-modal-card" role="dialog" aria-modal="true" aria-labelledby="bopsMetricTitle">
          <button class="bops-modal-close" type="button" data-bops-close aria-label="关闭">×</button>
          <p class="bops-modal-code">OPERATING DATA</p>
          <h3 id="bopsMetricTitle">录入经营数据</h3>
          <p class="bops-modal-note">没有经过确认的数据请留空，系统将显示“—”，不会自动补零。</p>
          <form id="bopsMetricForm">
            <div class="bops-stage-field"><label for="bopsStage">当前经营阶段</label><select id="bopsStage" name="stage"></select></div>
            <div class="bops-form-grid" id="bopsMetricFields"></div>
            <label class="bops-wide-field">经营备注<textarea name="executiveNote" rows="3" placeholder="记录阶段判断、数据口径或下一步动作"></textarea></label>
            <div class="bops-form-actions"><button type="button" class="bops-secondary" data-bops-close>取消</button><button type="submit" class="bops-primary">保存经营数据</button></div>
          </form>
        </div>
      </div>
      <div class="bops-modal" id="bopsRecordModal" aria-hidden="true">
        <div class="bops-modal-card bops-record-card" role="dialog" aria-modal="true" aria-labelledby="bopsRecordTitle">
          <button class="bops-modal-close" type="button" data-bops-close aria-label="关闭">×</button>
          <p class="bops-modal-code">VERIFIED OPERATING RECORD</p>
          <h3 id="bopsRecordTitle">新增经营记录</h3>
          <p class="bops-modal-note">只记录已发生或有明确依据的事实；金额、数量和来源不确定时请留空。</p>
          <form id="bopsRecordForm">
            <div class="bops-form-grid bops-record-fields">
              <label>日期<input type="date" name="date" required></label>
              <label>记录类型<select name="type" required>${Object.entries(RECORD_TYPES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
              <label class="bops-span-2">记录标题<input name="title" maxlength="80" required placeholder="例：完成首批参与者资料核验"></label>
              <label>状态<select name="status"><option>待确认</option><option>进行中</option><option>已完成</option><option>有风险</option></select></label>
              <label>合作方/客户<input name="counterpart" maxlength="80" placeholder="没有确认可留空"></label>
              <label>金额（元）<input name="amount" inputmode="decimal" placeholder="没有确认可留空"></label>
              <label>数量或口径<input name="quantity" maxlength="40" placeholder="例：示例数据 / 3 份"></label>
              <label class="bops-span-2">已确认结果<textarea name="result" rows="3" maxlength="500" placeholder="写清已经发生的结果、未确认事项和下一步" required></textarea></label>
              <label class="bops-span-2">证据来源<input name="source" maxlength="160" placeholder="例：合同、财务凭证、微信业务群、项目书"></label>
            </div>
            <div class="bops-form-actions"><button type="button" class="bops-secondary" data-bops-close>取消</button><button type="submit" class="bops-primary">保存经营记录</button></div>
          </form>
        </div>
      </div>
      <div class="bops-modal" id="bopsDeleteModal" aria-hidden="true">
        <div class="bops-modal-card bops-delete-card" role="alertdialog" aria-modal="true" aria-labelledby="bopsDeleteTitle">
          <button class="bops-modal-close" type="button" data-bops-close aria-label="关闭">×</button>
          <p class="bops-modal-code bops-danger">DELETE RECORD</p>
          <h3 id="bopsDeleteTitle">确认删除经营记录</h3>
          <p id="bopsDeleteDescription"></p>
          <label>请输入“删除”以确认<input id="bopsDeleteConfirm" autocomplete="off" placeholder="删除"></label>
          <div class="bops-form-actions"><button type="button" class="bops-secondary" data-bops-close>取消</button><button type="button" class="bops-delete-confirm" id="bopsDeleteButton" disabled>确认删除</button></div>
        </div>
      </div>`;
    [...wrap.children].forEach((node) => document.body.appendChild(node));
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('bops-lock');
    const first = modal.querySelector('input, select, textarea, button');
    setTimeout(() => first?.focus(), 20);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.bops-modal.show')) document.body.classList.remove('bops-lock');
  }

  function renderCommand() {
    const config = getConfig();
    const data = getData();
    const filled = config.kpis.filter(([key]) => hasValue(data.metrics[key])).length;
    const score = completeness(config, data);
    const command = document.getElementById('bopsCommand');
    if (!command) return;
    command.innerHTML = `
      <div><span>业务组合</span><strong>6</strong><small>集团 4 · 个人 2</small></div>
      <div><span>当前经营档案</span><strong>${escapeHTML(config.shortName)}</strong><small>${escapeHTML(config.ownership)}</small></div>
      <div><span>已录入关键指标</span><strong>${filled ? `${filled} / ${config.kpis.length}` : EMPTY}</strong><small>${filled ? '只统计已确认字段' : '关键指标尚待录入'}</small></div>
      <div><span>经营记录</span><strong>${data.records.length || EMPTY}</strong><small>${data.records.length ? '条可追溯记录' : '尚未建立记录'}</small></div>
      <div><span>数据完整度</span><strong>${score === null ? EMPTY : `${score}%`}</strong><small>指标 75% · 凭证 25%</small></div>
      <div><span>最近更新</span><strong>${formatDate(data.updatedAt)}</strong><small>本地经营档案</small></div>`;
  }

  function renderNav() {
    const nav = document.getElementById('bopsBusinessNav');
    if (!nav) return;
    nav.innerHTML = BUSINESS_CONFIG.map((config, index) => {
      const data = getData(config.id);
      const score = completeness(config, data);
      return `
        <button type="button" class="bops-nav-item ${config.id === state.activeBusiness ? 'active' : ''} ${config.privacy ? 'private' : ''}" data-business-id="${config.id}">
          <span class="bops-nav-index">0${index + 1}</span>
          <span class="bops-nav-copy"><strong>${escapeHTML(config.shortName)}</strong><small>${escapeHTML(config.role)}</small></span>
          <em>${score === null ? EMPTY : `${score}%`}</em>
        </button>`;
    }).join('');
  }

  function renderStages(config, data) {
    const current = Math.max(0, Math.min(Number(data.stage) || 0, config.stages.length - 1));
    return config.stages.map((stage, index) => `
      <div class="bops-stage ${index < current ? 'done' : ''} ${index === current ? 'current' : ''}">
        <span>0${index + 1}</span>
        <strong>${escapeHTML(stage)}</strong>
        <small>${index < current ? '已进入下一阶段' : index === current ? '当前阶段' : '待推进'}</small>
      </div>`).join('');
  }

  function renderRecords(config, data) {
    const records = [...data.records]
      .filter((record) => activeFilter === 'all' || record.type === activeFilter)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!records.length) {
      return `<div class="bops-empty"><strong>尚无${activeFilter === 'all' ? '' : RECORD_TYPES[activeFilter]}记录</strong><p>只添加已经发生且有明确依据的经营事实；未确认数字请保持空白。</p><button type="button" class="bops-primary" data-bops-action="record">＋ 新增第一条记录</button></div>`;
    }
    return records.map((record) => `
      <article class="bops-record-row" data-record-id="${escapeHTML(record.id)}">
        <time>${formatDate(record.date)}</time>
        <div class="bops-record-type"><span>${escapeHTML(RECORD_TYPES[record.type] || '经营记录')}</span><em class="status-${record.status === '已完成' ? 'done' : record.status === '有风险' ? 'risk' : record.status === '进行中' ? 'active' : 'pending'}">${escapeHTML(record.status || '待确认')}</em></div>
        <div class="bops-record-main"><strong>${escapeHTML(record.title)}</strong><p>${escapeHTML(record.result)}</p><small>${[record.counterpart, record.quantity, record.source].filter(hasValue).map(escapeHTML).join(' · ') || '证据来源待补充'}</small></div>
        <div class="bops-record-value"><strong>${hasValue(record.amount) ? formatMetric(record.amount, '元') : EMPTY}</strong><small>${hasValue(record.amount) ? '记录金额' : '未录入金额'}</small></div>
        <div class="bops-record-actions"><button type="button" data-record-edit="${escapeHTML(record.id)}">编辑</button><button type="button" data-record-delete="${escapeHTML(record.id)}">删除</button></div>
      </article>`).join('');
  }

  function renderDetail() {
    const config = getConfig();
    const data = getData();
    const counts = recordCounts(data.records);
    const detail = document.getElementById('bopsDetail');
    if (!detail) return;
    detail.dataset.businessId = config.id;
    detail.innerHTML = `
      <header class="bops-profile ${config.privacy ? 'is-private' : ''}">
        <div>
          <span class="bops-owner">${escapeHTML(config.ownership)}</span>
          <h4>${escapeHTML(config.name)}</h4>
          <p>${escapeHTML(config.role)}</p>
        </div>
        <div class="bops-profile-status"><span>${config.privacy ? '隐私隔离' : '经营状态'}</span><strong>${escapeHTML(config.status)}</strong><small>${config.privacy ? '不并入集团对外业绩汇总' : `更新于 ${formatDate(data.updatedAt)}`}</small></div>
      </header>
      ${config.privacy ? '<div class="bops-privacy-notice"><strong>个人独立经营区</strong><span>客户身份、健康数据、样本与报告信息默认不进入集团展示视图；这里只记录脱敏经营结果。</span></div>' : ''}
      <div class="bops-metric-grid">
        ${config.kpis.map(([key, label, unit]) => `<div><span>${escapeHTML(label)}</span><strong>${formatMetric(data.metrics[key], unit)}</strong><small>${hasValue(data.metrics[key]) && !['元', '元/人', '%'].includes(unit) ? unit : hasValue(data.metrics[key]) ? '已录入' : '未提供'}</small></div>`).join('')}
      </div>
      <section class="bops-progress">
        <div class="bops-subhead"><div><span>OPERATING PROGRESS</span><h5>经营进程</h5></div><strong>当前阶段：${escapeHTML(config.stages[Math.max(0, Math.min(Number(data.stage) || 0, config.stages.length - 1))])}</strong></div>
        <div class="bops-stage-track">${renderStages(config, data)}</div>
      </section>
      <div class="bops-signal-row">
        <div><span>渠道档案</span><strong>${counts.channels}</strong><small>${counts.channels === EMPTY ? '尚未录入' : '条记录'}</small></div>
        <div><span>客户/学员档案</span><strong>${counts.customers}</strong><small>${counts.customers === EMPTY ? '尚未录入' : '条记录'}</small></div>
        <div><span>已核验回款</span><strong>${counts.payments}</strong><small>${counts.payments === EMPTY ? '尚无财务凭证' : '按回款记录合计'}</small></div>
        <div><span>交付档案</span><strong>${counts.deliveries}</strong><small>${counts.deliveries === EMPTY ? '尚未录入' : '条记录'}</small></div>
      </div>
      <section class="bops-ledger">
        <div class="bops-ledger-head">
          <div><span>VERIFIED LEDGER</span><h5>关键经营记录</h5><p>${escapeHTML(data.executiveNote || config.nextPrompt)}</p></div>
          <div class="bops-ledger-actions">
            <select id="bopsRecordFilter" aria-label="筛选经营记录">
              <option value="all">全部记录</option>
              ${Object.entries(RECORD_TYPES).map(([value, label]) => `<option value="${value}" ${activeFilter === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <button type="button" class="bops-primary" data-bops-action="record">＋ 新增经营记录</button>
          </div>
        </div>
        <div class="bops-record-table">${renderRecords(config, data)}</div>
      </section>`;
    detail.querySelectorAll('[data-record-edit]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        openRecordForm(button.dataset.recordEdit);
      };
    });
    detail.querySelectorAll('[data-record-delete]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        requestDelete(button.dataset.recordDelete);
      };
    });
  }

  function render() {
    renderCommand();
    renderNav();
    renderDetail();
  }

  function setActiveBusiness(id) {
    if (!BUSINESS_CONFIG.some((item) => item.id === id)) return;
    state.activeBusiness = id;
    activeFilter = 'all';
    saveState();
    render();
  }

  function openMetricForm() {
    const config = getConfig();
    const data = getData();
    document.getElementById('bopsMetricTitle').textContent = `录入经营数据 · ${config.shortName}`;
    const stage = document.getElementById('bopsStage');
    stage.innerHTML = config.stages.map((label, index) => `<option value="${index}" ${Number(data.stage) === index ? 'selected' : ''}>0${index + 1} · ${escapeHTML(label)}</option>`).join('');
    const fields = document.getElementById('bopsMetricFields');
    fields.innerHTML = config.kpis.map(([key, label, unit]) => `
      <label>${escapeHTML(label)}<span>${escapeHTML(unit)}</span><input name="${key}" value="${escapeHTML(data.metrics[key] ?? '')}" inputmode="decimal" placeholder="未确认请留空"></label>`).join('');
    document.querySelector('#bopsMetricForm [name="executiveNote"]').value = data.executiveNote || '';
    openModal('bopsMetricModal');
  }

  function openRecordForm(recordId = null) {
    const form = document.getElementById('bopsRecordForm');
    form.reset();
    editingRecordId = recordId;
    const record = recordId ? getData().records.find((item) => item.id === recordId) : null;
    document.getElementById('bopsRecordTitle').textContent = `${record ? '编辑' : '新增'}经营记录 · ${getConfig().shortName}`;
    if (record) {
      Object.entries(record).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = value ?? '';
      });
    } else {
      form.elements.date.value = todayISO();
      form.elements.status.value = '待确认';
    }
    openModal('bopsRecordModal');
  }

  function requestDelete(recordId) {
    const record = getData().records.find((item) => item.id === recordId);
    if (!record) return;
    pendingDeleteId = recordId;
    const input = document.getElementById('bopsDeleteConfirm');
    const button = document.getElementById('bopsDeleteButton');
    input.value = '';
    button.disabled = true;
    document.getElementById('bopsDeleteDescription').textContent = `将删除“${record.title}”。此操作只影响当前设备上的经营档案，删除后不能在本模块内恢复。`;
    openModal('bopsDeleteModal');
  }

  function bindEvents(section) {
    section.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-business-id]');
      if (nav) {
        setActiveBusiness(nav.dataset.businessId);
        return;
      }
      const action = event.target.closest('[data-bops-action]')?.dataset.bopsAction;
      if (action === 'metrics') openMetricForm();
      if (action === 'record') openRecordForm();
      if (action === 'channels') window.WorkspaceRouter?.go('channels');
      const edit = event.target.closest('[data-record-edit]')?.dataset.recordEdit;
      if (edit) openRecordForm(edit);
      const remove = event.target.closest('[data-record-delete]')?.dataset.recordDelete;
      if (remove) requestDelete(remove);
    });
    section.addEventListener('change', (event) => {
      if (event.target.id !== 'bopsRecordFilter') return;
      activeFilter = event.target.value;
      renderDetail();
    });

    document.querySelectorAll('.biz[data-biz]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = BUSINESS_CONFIG.find((config) => config.name === button.dataset.biz);
        if (!target) return;
        setActiveBusiness(target.id);
        if (window.WorkspaceRouter?.go) window.WorkspaceRouter.go('business');
        window.requestAnimationFrame(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      });
    });

    document.querySelectorAll('[data-bops-close]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.closest('.bops-modal')));
    });
    document.querySelectorAll('.bops-modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.querySelectorAll('.bops-modal.show').forEach(closeModal);
    });

    document.getElementById('bopsMetricForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const config = getConfig();
      const data = getData();
      data.stage = Number(formData.get('stage'));
      config.kpis.forEach(([key]) => {
        const value = String(formData.get(key) ?? '').trim();
        data.metrics[key] = value === '' ? null : value;
      });
      data.executiveNote = String(formData.get('executiveNote') ?? '').trim();
      data.updatedAt = todayISO();
      state.businesses[config.id] = data;
      saveState();
      closeModal(document.getElementById('bopsMetricModal'));
      render();
    });

    document.getElementById('bopsRecordForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = Object.fromEntries(new FormData(event.currentTarget));
      const data = getData();
      const clean = Object.fromEntries(Object.entries(formData).map(([key, value]) => [key, String(value).trim()]));
      const index = data.records.findIndex((item) => item.id === editingRecordId);
      if (index >= 0) {
        data.records[index] = { ...data.records[index], ...clean, updatedAt: todayISO() };
      } else {
        data.records.push({ ...clean, id: `record-${Date.now()}`, createdAt: todayISO() });
      }
      data.updatedAt = todayISO();
      state.businesses[state.activeBusiness] = data;
      saveState();
      editingRecordId = null;
      closeModal(document.getElementById('bopsRecordModal'));
      render();
    });

    const deleteInput = document.getElementById('bopsDeleteConfirm');
    const deleteButton = document.getElementById('bopsDeleteButton');
    deleteInput.addEventListener('input', () => {
      deleteButton.disabled = deleteInput.value.trim() !== '删除';
    });
    deleteButton.addEventListener('click', () => {
      if (!pendingDeleteId || deleteInput.value.trim() !== '删除') return;
      const data = getData();
      data.records = data.records.filter((item) => item.id !== pendingDeleteId);
      data.updatedAt = todayISO();
      state.businesses[state.activeBusiness] = data;
      saveState();
      pendingDeleteId = null;
      closeModal(document.getElementById('bopsDeleteModal'));
      render();
    });
  }

  function init() {
    const section = createSection();
    createModalShells();
    bindEvents(section);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = readState();
    render();
  });

  window.BusinessOperations = Object.freeze({
    storageKey: STORAGE_KEY,
    getState: () => JSON.parse(JSON.stringify(state)),
    getBusiness: (id) => JSON.parse(JSON.stringify(state.businesses[id] || null)),
    render
  });
}());
