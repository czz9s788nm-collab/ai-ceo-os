(function(){
  'use strict';

  const PLATFORM_KEY='ai-ceo-workspace-platform';
  const BUSINESS_OPERATIONS_KEY='ai-ceo-os:business-operations:v1';
  const REPOSITORY_VERSION=1;
  const MANAGED_KEYS=[
    'ai-ceo-preset-channels','ai-ceo-custom-channels','ai-ceo-risk-register',
    'ai-ceo-monthly-metrics','ai-ceo-calendar-events','ai-ceo-calendar-reminders-sent',
    BUSINESS_OPERATIONS_KEY,PLATFORM_KEY
  ];
  const BUSINESS_LABELS={
    germany:'国际人才项目',bearing:'分销业务',supply:'供应链业务',
    trade:'国际增长业务',content:'内容与 AI 业务',gene:'健康创新业务'
  };

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const isoDate=(date=new Date())=>{
    const offset=date.getTimezoneOffset()*60000;
    return new Date(date.getTime()-offset).toISOString().slice(0,10);
  };
  const safeJSON=(value,fallback)=>{try{const parsed=JSON.parse(value);return parsed??fallback}catch{return fallback}};
  const numberValue=value=>{
    if(value===null||value===undefined||value==='')return null;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    const cleaned=String(value).replace(/[¥￥,$,，\s]/g,'').replace(/万$/,'0000');
    const result=Number(cleaned);
    return Number.isFinite(result)?result:null;
  };
  const numberText=value=>Number.isFinite(value)?value.toLocaleString('zh-CN'):'—';
  const moneyText=value=>Number.isFinite(value)?`¥${value.toLocaleString('zh-CN')}`:'—';
  const escapeText=value=>String(value??'').replace(/[\u0000-\u001f]/g,' ').trim();

  class WorkspaceRepository{
    constructor(){this.version=REPOSITORY_VERSION}
    read(key,fallback=null){return safeJSON(localStorage.getItem(key),fallback)}
    write(key,value){localStorage.setItem(key,JSON.stringify(value))}
    platform(){
      return {
        version:this.version,publicMode:false,remindersEnabled:true,overdueAlerts:true,
        reportHistory:[],lastBackupAt:'',
        ...(this.read(PLATFORM_KEY,{})||{})
      };
    }
    savePlatform(patch){const next={...this.platform(),...patch,version:this.version};this.write(PLATFORM_KEY,next);return next}
    keys(){
      // Only export the explicitly managed business datasets. Authentication,
      // session or other unrelated qu-* values must never enter a backup.
      return MANAGED_KEYS.filter(key=>localStorage.getItem(key)!==null);
    }
    snapshot(){
      const data={};
      this.keys().forEach(key=>{data[key]=safeJSON(localStorage.getItem(key),localStorage.getItem(key))});
      return {schema:'ai-ceo-os-workspace-backup',version:this.version,generatedAt:new Date().toISOString(),scope:'local-only',data};
    }
    restore(payload){
      if(!payload||payload.schema!=='ai-ceo-os-workspace-backup'||!payload.data||typeof payload.data!=='object')throw new Error('备份文件格式不正确');
      const allowed=new Set(MANAGED_KEYS);
      const entries=Object.entries(payload.data).filter(([key])=>allowed.has(key));
      if(!entries.length)throw new Error('备份中没有可恢复的工作台数据');
      entries.forEach(([key,value])=>localStorage.setItem(key,typeof value==='string'?value:JSON.stringify(value)));
      return entries.length;
    }
  }

  const repository=new WorkspaceRepository();
  let activeTab='diagnosis';
  let lastFingerprint='';
  let refreshTimer=null;

  function readDOMMetric(id){
    const node=document.getElementById(id);
    if(!node)return null;
    return numberValue(node.textContent.replace(/未提供|待补充|—/g,''));
  }

  function collectChannels(){
    const preset=repository.read('ai-ceo-preset-channels',null);
    const custom=repository.read('ai-ceo-custom-channels',null);
    const stored=[
      ...(preset&&typeof preset==='object'&&!Array.isArray(preset)?Object.values(preset):[]),
      ...(Array.isArray(custom)?custom:[])
    ].filter(Boolean);
    const fields=['leads','signed','delivered','revenue'];
    const metrics={};
    if(stored.length){
      fields.forEach(field=>{
        const values=stored.map(item=>numberValue(item[field])).filter(Number.isFinite);
        metrics[field]=values.length?values.reduce((sum,value)=>sum+value,0):null;
        metrics[`${field}Known`]=values.length;
      });
    }else{
      metrics.leads=readDOMMetric('summaryLeads');
      metrics.signed=readDOMMetric('summarySigned');
      metrics.delivered=readDOMMetric('summaryDelivered');
      metrics.revenue=readDOMMetric('summaryRevenue');
      fields.forEach(field=>{metrics[`${field}Known`]=Number.isFinite(metrics[field])?1:0});
    }
    const known=fields.reduce((sum,field)=>sum+metrics[`${field}Known`],0);
    const denominator=stored.length?stored.length*fields.length:fields.length;
    return {items:stored,metrics,source:stored.length?'本机渠道台账':'页面实时汇总',completeness:denominator?Math.round(known/denominator*100):0};
  }

  function collectRisks(){
    const saved=repository.read('ai-ceo-risk-register',null);
    if(Array.isArray(saved))return {items:saved,source:'本机风险台账'};
    const dom=$$('.risk-item').map((node,index)=>({
      id:`page-risk-${index}`,level:$('.risk-level',node)?.textContent.trim()||'P2',
      title:$('.risk-copy strong',node)?.textContent.trim()||'风险事项待补充',
      action:$('.risk-copy p',node)?.textContent.trim()||'',
      status:node.classList.contains('closed')?'closed':'open'
    }));
    return {items:dom,source:dom.length?'页面实时风险':'待补充'};
  }

  function collectMonthly(){
    const saved=repository.read('ai-ceo-monthly-metrics',null);
    return {items:Array.isArray(saved)?saved:[],source:Array.isArray(saved)?'本机月度经营数据':'待补充'};
  }

  function collectBusinessOperations(){
    const stored=repository.read(BUSINESS_OPERATIONS_KEY,null);
    const runtime=window.BusinessOperations?.getState?.();
    const state=stored&&typeof stored==='object'?stored:runtime;
    if(!state?.businesses||typeof state.businesses!=='object')return {items:[],source:'待补充',coverage:null};
    const items=Object.keys(BUSINESS_LABELS).map(id=>{
      const item=state.businesses[id]||{};
      const metrics=item.metrics&&typeof item.metrics==='object'?Object.values(item.metrics):[];
      const knownMetrics=metrics.filter(value=>value!==null&&value!==undefined&&String(value).trim()!=='').length;
      const records=Array.isArray(item.records)?item.records.length:0;
      return {id,label:BUSINESS_LABELS[id],knownMetrics,records,hasData:knownMetrics>0||records>0};
    });
    const active=items.filter(item=>item.hasData).length;
    return {items,source:stored?'本机六业务经营档案':'页面六业务经营档案',coverage:Math.round(active/items.length*100)};
  }

  function collectEvents(){
    const saved=repository.read('ai-ceo-calendar-events',null);
    return {items:Array.isArray(saved)?saved:[],source:Array.isArray(saved)?'本机日程数据':($('.calendar-day .day-event')?'页面已加载，提醒配置待同步':'待补充')};
  }

  function isCompleted(event,date){return Array.isArray(event.completedDates)&&event.completedDates.includes(date)}
  function eventOccursOn(event,date){
    if(!event?.date)return false;
    if(event.repeat==='daily')return date>=event.date;
    if(event.repeat==='weekly'){
      const origin=new Date(`${event.date}T00:00:00`),target=new Date(`${date}T00:00:00`);
      return date>=event.date&&Math.round((target-origin)/86400000)%7===0;
    }
    return event.date===date;
  }

  function collectAutomation(events){
    const today=isoDate();
    const now=new Date();
    const overdue=[];
    const upcoming=[];
    events.forEach(event=>{
      if(!event?.date||!event?.title)return;
      const reminderConfigured=event.reminder!==undefined&&event.reminder!==null&&event.reminder!==''&&event.reminder!=='none';
      if(event.repeat==='none'||!event.repeat){
        const stamp=new Date(`${event.date}T${event.time||'23:59'}:00`);
        if(stamp<now&&!isCompleted(event,event.date))overdue.push({...event,occurrence:event.date});
      }else if(eventOccursOn(event,today)){
        const stamp=new Date(`${today}T${event.time||'23:59'}:00`);
        if(stamp<now&&!isCompleted(event,today))overdue.push({...event,occurrence:today});
      }
      if(reminderConfigured){
        for(let offset=0;offset<8;offset++){
          const date=new Date();date.setDate(date.getDate()+offset);
          const dateText=isoDate(date);
          if(eventOccursOn(event,dateText)&&!isCompleted(event,dateText)){
            const stamp=new Date(`${dateText}T${event.time||'23:59'}:00`);
            if(stamp>=now){upcoming.push({...event,occurrence:dateText,stamp});break}
          }
        }
      }
    });
    upcoming.sort((a,b)=>a.stamp-b.stamp);
    return {overdue,upcoming};
  }

  function buildSnapshot(){
    const channels=collectChannels(),risks=collectRisks(),monthly=collectMonthly(),calendar=collectEvents(),businessOps=collectBusinessOperations();
    const automation=collectAutomation(calendar.items);
    const openRisks=risks.items.filter(item=>item.status!=='closed');
    const p0=openRisks.filter(item=>item.level==='P0');
    const latest=[...monthly.items].filter(item=>item&&item.month).sort((a,b)=>String(a.month).localeCompare(String(b.month))).at(-1)||null;
    return {generatedAt:new Date(),channels,risks,monthly,calendar,businessOps,automation,openRisks,p0,latest};
  }

  function diagnose(data){
    const signals=[];
    if(data.p0.length){
      signals.push({level:'P0',title:`${data.p0.length} 项高优先级风险仍未关闭`,detail:data.p0.slice(0,2).map(item=>item.title).join('；'),action:'先核验证据、负责人和截止时间，再更新处理状态。',source:data.risks.source});
    }else if(data.openRisks.length){
      signals.push({level:'P1',title:`${data.openRisks.length} 项经营风险仍在处理中`,detail:data.openRisks.slice(0,2).map(item=>item.title).join('；'),action:'按风险等级和截止时间逐项复核。',source:data.risks.source});
    }else{
      signals.push({level:'INFO',title:'高优先级风险状态待补充',detail:'当前数据中未读取到未关闭的 P0 风险。',action:'如有新风险，请先录入风险台账。',source:data.risks.source});
    }
    if(data.automation.overdue.length){
      signals.push({level:'P1',title:`${data.automation.overdue.length} 项日程已逾期未完成`,detail:data.automation.overdue.slice(0,2).map(item=>`${item.occurrence} ${item.title}`).join('；'),action:'确认是否完成、延期或重新安排。',source:data.calendar.source});
    }
    const missing=['signed','delivered','revenue'].filter(field=>!Number.isFinite(data.channels.metrics[field]));
    if(missing.length){
      const labels={signed:'签约',delivered:'交付',revenue:'回款'};
      signals.push({level:'DATA',title:'核心经营结果仍有待补充字段',detail:`${missing.map(field=>labels[field]).join('、')}尚未读取到已确认数字。`,action:'仅在证据核验后补录；未确认继续保持“—”。',source:data.channels.source});
    }else{
      signals.push({level:'INFO',title:'渠道结果指标已形成可读闭环',detail:`已确认签约 ${numberText(data.channels.metrics.signed)}，交付 ${numberText(data.channels.metrics.delivered)}，回款数据已录入。`,action:'继续按月复核凭证与交付结果。',source:data.channels.source});
    }
    if(!data.monthly.items.length){
      signals.push({level:'DATA',title:'月度经营趋势待补充',detail:'尚未读取到本机月度经营数据。',action:'补录最近月份的线索、签约、交付与回款。',source:data.monthly.source});
    }
    if(data.businessOps.items.length){
      const missing=data.businessOps.items.filter(item=>!item.hasData);
      if(missing.length)signals.push({level:'DATA',title:`${missing.length} 项业务尚未形成可核验经营数据`,detail:missing.map(item=>item.label).join('、'),action:'先补充一个确认指标或一条带证据来源的经营记录。',source:data.businessOps.source});
    }
    return signals.slice(0,4);
  }

  function reportModel(data){
    const m=data.channels.metrics;
    const now=data.generatedAt;
    const knownChannelCount=data.channels.items.length||($('.channel-row')?$$('.channel-row').length:0);
    const lines=[
      `德斯本达个人工作台｜实时经营摘要`,
      `生成时间：${now.toLocaleString('zh-CN',{hour12:false})}`,
      `数据边界：仅汇总当前浏览器本地数据与页面已显示数据；未确认指标保留“—”。`,
      '',
      `一、经营概览`,
      `渠道/项目记录：${knownChannelCount||'—'}`,
      `已确认线索/客户：${numberText(m.leads)}`,
      `已确认签约：${numberText(m.signed)}`,
      `已确认交付：${numberText(m.delivered)}`,
      `已确认回款：${moneyText(m.revenue)}`,
      `渠道核心字段完整度：${data.channels.completeness}%`,
      `六业务经营档案覆盖：${data.businessOps.coverage===null?'—':`${data.businessOps.coverage}%`}`,
      '',
      `二、风险与执行`,
      `未关闭风险：${data.risks.source==='待补充'?'—':data.openRisks.length}`,
      `其中 P0：${data.risks.source==='待补充'?'—':data.p0.length}`,
      `逾期未完成日程：${data.calendar.items.length?data.automation.overdue.length:'—'}`,
      `未来 7 日已配置提醒：${data.calendar.items.length?data.automation.upcoming.length:'—'}`,
      '',
      `三、证据来源`,
      `业务档案：${data.businessOps.source}`,`渠道：${data.channels.source}`,`风险：${data.risks.source}`,`日程：${data.calendar.source}`,`月度数据：${data.monthly.source}`
    ];
    return {title:'实时经营摘要',generatedAt:now.toISOString(),lines,text:lines.join('\n')};
  }

  function download(name,content,type='application/json'){
    const blob=new Blob([content],{type:`${type};charset=utf-8`});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function shell(){
    const section=document.createElement('section');
    section.id='workspacePlatform';section.className='workspace-platform';
    section.dataset.workspacePage='platform';
    section.dataset.workspaceView='assistant reports';
    section.innerHTML=`
      <header class="platform-header">
        <div><p class="platform-kicker">EXECUTIVE INTELLIGENCE · LOCAL DATA</p><h3>经营智能与数据底座</h3><p>经营诊断、实时报告、隐私展示与本地自动化统一在一个可核验控制层中。</p></div>
        <div class="platform-mode"><span id="platformModeLabel">私密经营模式</span><button type="button" id="platformModeToggle">切换公开展示</button></div>
      </header>
      <div class="platform-metrics" id="platformMetrics"></div>
      <nav class="platform-tabs" aria-label="经营智能模块">
        <button type="button" class="active" data-platform-tab="diagnosis">AI 经营诊断</button>
        <button type="button" data-platform-tab="report">实时经营报告</button>
        <button type="button" data-platform-tab="automation">本地自动化中心</button>
        <button type="button" data-platform-tab="data">数据与备份</button>
      </nav>
      <div class="platform-panels">
        <section class="platform-panel active" data-platform-panel="diagnosis"><div class="platform-panel-head"><div><span>AI EXECUTIVE REVIEW</span><h4>基于真实经营数据的诊断</h4></div><button type="button" data-platform-refresh>刷新诊断</button></div><p class="platform-boundary">系统只读取已录入的本机数据和当前页面信息；没有证据的数字显示为“—”或“待补充”。</p><div class="diagnosis-grid" id="platformDiagnosis"></div></section>
        <section class="platform-panel" data-platform-panel="report"><div class="platform-panel-head"><div><span>LIVE BUSINESS REPORT</span><h4>实时经营摘要</h4></div><div class="platform-actions"><button type="button" id="platformPrint">打印</button><button type="button" id="platformExportReport">导出摘要</button></div></div><article class="report-sheet" id="platformReport"></article></section>
        <section class="platform-panel" data-platform-panel="automation"><div class="platform-panel-head"><div><span>LOCAL AUTOMATION</span><h4>提醒与逾期预警</h4></div><small>仅在本机浏览器内工作，不发送外部消息</small></div><div class="automation-controls" id="platformAutomationControls"></div><div class="automation-list" id="platformAutomation"></div></section>
        <section class="platform-panel" data-platform-panel="data"><div class="platform-panel-head"><div><span>DATA GOVERNANCE</span><h4>版本化本地数据仓库</h4></div><span class="repository-version">SCHEMA v${REPOSITORY_VERSION}</span></div><div class="data-governance"><article><b>本地备份</b><p>导出当前浏览器内所有 qu- 工作台数据。文件不上传、不外发。</p><button type="button" id="platformBackup">导出 JSON 备份</button></article><article><b>本地恢复</b><p>选择工作台备份文件并在确认后覆盖对应本机数据。</p><label class="platform-file">选择备份文件<input type="file" id="platformRestore" accept="application/json,.json"></label></article><article><b>数据原则</b><p>未知值不记为 0；报告保留生成时间和证据来源；敏感金额可在公开模式遮蔽。</p><span id="platformStorageStatus">等待读取</span></article></div><div class="platform-message" id="platformMessage" role="status"></div></section>
      </div>`;
    const main=document.querySelector('main');
    if(!main)return null;
    const risk=document.querySelector('.risk-trend-center');
    if(risk&&risk.parentNode===main)risk.insertAdjacentElement('afterend',section);else main.appendChild(section);
    return section;
  }

  function renderMetrics(data){
    const root=$('#platformMetrics');if(!root)return;
    const sourceCount=[data.businessOps.source,data.channels.source,data.risks.source,data.calendar.source,data.monthly.source].filter(source=>source!=='待补充').length;
    const values=[
      ['可读数据源',`${sourceCount} / 5`,'业务 · 渠道 · 风险 · 日程 · 月度'],
      ['字段完整度',`${data.channels.completeness}%`,'未知指标不记为零'],
      ['未关闭风险',data.risks.source==='待补充'?'—':String(data.openRisks.length),data.risks.source==='待补充'?'风险台账待补充':`其中 ${data.p0.length} 项 P0`],
      ['展示状态',repository.platform().publicMode?'公开展示':'私密经营',repository.platform().publicMode?'金额与个人字段已遮蔽':'仅Owner本机查看']
    ];
    root.innerHTML='';
    values.forEach(([label,value,note])=>{const item=document.createElement('div');item.innerHTML='<span></span><strong></strong><small></small>';item.querySelector('span').textContent=label;item.querySelector('strong').textContent=value;item.querySelector('small').textContent=note;root.appendChild(item)});
  }

  function renderDiagnosis(data){
    const root=$('#platformDiagnosis');if(!root)return;root.innerHTML='';
    diagnose(data).forEach((signal,index)=>{
      const card=document.createElement('article');card.className=`diagnosis-card level-${signal.level.toLowerCase()}`;
      card.innerHTML='<div class="diagnosis-index"></div><div><span class="diagnosis-level"></span><h5></h5><p></p><small></small><b></b></div>';
      $('.diagnosis-index',card).textContent=String(index+1).padStart(2,'0');
      $('.diagnosis-level',card).textContent=signal.level;
      $('h5',card).textContent=signal.title;$('p',card).textContent=signal.detail;
      $('small',card).textContent=`建议动作：${signal.action}`;$('b',card).textContent=`证据：${signal.source}`;
      root.appendChild(card);
    });
  }

  function renderReport(data){
    const root=$('#platformReport');if(!root)return;
    const report=reportModel(data),m=data.channels.metrics;
    root.innerHTML='<div class="report-title"><div><span>AI CEO OS · EXECUTIVE REPORT</span><h5></h5></div><time></time></div><div class="report-kpis"></div><div class="report-body"><section><h6>经营状态</h6><div id="reportStatus"></div></section><section><h6>风险与执行</h6><div id="reportRisk"></div></section></div><footer></footer>';
    $('.report-title h5',root).textContent=report.title;
    $('.report-title time',root).textContent=data.generatedAt.toLocaleString('zh-CN',{hour12:false});
    const kpis=[['线索/客户',numberText(m.leads)],['已签约',numberText(m.signed)],['已交付',numberText(m.delivered)],['已确认回款',moneyText(m.revenue)]];
    const kpiRoot=$('.report-kpis',root);
    kpis.forEach(([label,value],index)=>{const item=document.createElement('div');item.innerHTML='<span></span><strong></strong>';item.querySelector('span').textContent=label;item.querySelector('strong').textContent=value;if(index===3)item.classList.add('workspace-sensitive');kpiRoot.appendChild(item)});
    const status=$('#reportStatus',root),risk=$('#reportRisk',root);
    [['六业务档案覆盖',data.businessOps.coverage===null?'—':`${data.businessOps.coverage}%`],['渠道数据源',data.channels.source],['核心字段完整度',`${data.channels.completeness}%`],['月度数据',data.monthly.source]].forEach(([label,value])=>appendReportRow(status,label,value));
    [['未关闭风险',data.risks.source==='待补充'?'—':`${data.openRisks.length} 项`],['其中 P0',data.risks.source==='待补充'?'—':`${data.p0.length} 项`],['逾期日程',data.calendar.items.length?`${data.automation.overdue.length} 项`:'—'],['未来 7 日提醒',data.calendar.items.length?`${data.automation.upcoming.length} 项`:'—']].forEach(([label,value])=>appendReportRow(risk,label,value));
    $('footer',root).textContent='数据边界：仅汇总当前本机已录入和页面已显示的信息；未知值不推算、不补零。';
    root.dataset.reportText=report.text;
  }

  function appendReportRow(root,label,value){const row=document.createElement('p');row.innerHTML='<span></span><strong></strong>';row.querySelector('span').textContent=label;row.querySelector('strong').textContent=value;root.appendChild(row)}

  function renderAutomation(data){
    const settings=repository.platform(),controls=$('#platformAutomationControls'),root=$('#platformAutomation');
    if(!controls||!root)return;
    controls.innerHTML='';
    [
      ['remindersEnabled','日程本地提醒',settings.remindersEnabled,'管理已配置提醒的本地状态'],
      ['overdueAlerts','逾期工作预警',settings.overdueAlerts,'突出显示已逾期未完成事项']
    ].forEach(([key,label,on,note])=>{
      const item=document.createElement('article');item.innerHTML='<div><b></b><small></small></div><button type="button"></button>';
      $('b',item).textContent=label;$('small',item).textContent=note;
      const button=$('button',item);button.textContent=on?'已启用':'已暂停';button.classList.toggle('on',on);
      button.onclick=()=>{repository.savePlatform({[key]:!repository.platform()[key]});renderAll(true)};
      controls.appendChild(item);
    });
    root.innerHTML='';
    const items=[];
    if(settings.overdueAlerts)data.automation.overdue.slice(0,4).forEach(event=>items.push({type:'逾期',title:event.title,meta:`${event.occurrence} ${event.time||''}`.trim(),tone:'danger'}));
    if(settings.remindersEnabled)data.automation.upcoming.slice(0,4).forEach(event=>items.push({type:'提醒',title:event.title,meta:`${event.occurrence} ${event.time||''}`.trim(),tone:'normal'}));
    if(!data.calendar.items.length)items.push({type:'待补充',title:'尚未读取到本机日程数据',meta:data.calendar.source,tone:'muted'});
    if(data.calendar.items.length&&!items.length)items.push({type:'状态',title:'当前没有需要展示的逾期或未来 7 日提醒',meta:'本地规则运行正常',tone:'muted'});
    items.forEach(item=>{const row=document.createElement('article');row.className=`automation-item ${item.tone}`;row.innerHTML='<span></span><div><strong></strong><small></small></div><i></i>';row.querySelector('span').textContent=item.type;row.querySelector('strong').textContent=item.title;row.querySelector('small').textContent=item.meta;row.querySelector('i').textContent='LOCAL';root.appendChild(row)});
  }

  function applyPublicMode(){
    const state=repository.platform(),label=$('#platformModeLabel'),button=$('#platformModeToggle');
    document.body.classList.toggle('workspace-public-mode',state.publicMode);
    if(label)label.textContent=state.publicMode?'公开展示模式':'私密经营模式';
    if(button)button.textContent=state.publicMode?'返回私密经营':'切换公开展示';
    const selectors=[
      '#summaryRevenue','#yuejiaoRevenue','#customRevenue',
      '.trend-row[data-metric="revenue"] strong','input[name="revenue"]','input[name="owner"]',
      '.repository-version','.channel-row strong','.channel-header h4','.timeline','.evidence',
      '.bops-record-main p','.bops-record-main small'
    ];
    selectors.forEach(selector=>$$(selector).forEach(node=>node.classList.add('workspace-sensitive')));
    $$('.risk-copy small').filter(node=>node.textContent.includes('负责人')).forEach(node=>node.classList.add('workspace-sensitive'));
  }

  function renderDataStatus(){
    const node=$('#platformStorageStatus');if(!node)return;
    const state=repository.platform(),keys=repository.keys();
    node.textContent=`已识别 ${keys.length} 个本地数据集${state.lastBackupAt?` · 最近备份 ${new Date(state.lastBackupAt).toLocaleString('zh-CN',{hour12:false})}`:' · 尚未记录备份时间'}`;
  }

  function renderAll(force=false){
    if(!document.getElementById('workspacePlatform'))return;
    const fingerprint=repository.keys().map(key=>{
      const value=localStorage.getItem(key)||'';
      let hash=0;for(let index=0;index<value.length;index++)hash=(hash*31+value.charCodeAt(index))|0;
      return `${key}:${value.length}:${hash}`;
    }).join('|');
    if(!force&&fingerprint===lastFingerprint)return;
    lastFingerprint=fingerprint;
    const data=buildSnapshot();
    renderMetrics(data);renderDiagnosis(data);renderReport(data);renderAutomation(data);renderDataStatus();applyPublicMode();
  }

  function message(text,error=false){const node=$('#platformMessage');if(!node)return;node.textContent=text;node.classList.toggle('error',error);clearTimeout(message.timer);message.timer=setTimeout(()=>{node.textContent='';node.classList.remove('error')},5200)}

  function bind(){
    $$('.platform-tabs button').forEach(button=>button.onclick=()=>{
      activeTab=button.dataset.platformTab;
      $$('.platform-tabs button').forEach(item=>item.classList.toggle('active',item===button));
      $$('.platform-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.platformPanel===activeTab));
      renderAll(true);
    });
    $('#platformModeToggle').onclick=()=>{const state=repository.platform();repository.savePlatform({publicMode:!state.publicMode});renderAll(true)};
    $$('[data-platform-refresh]').forEach(button=>button.onclick=()=>{renderAll(true);message('诊断已按当前本机数据刷新')});
    $('#platformBackup').onclick=()=>{
      const backup=repository.snapshot(),stamp=backup.generatedAt.replace(/[:.]/g,'-');
      download(`ai-ceo-os-backup-${stamp}.json`,JSON.stringify(backup,null,2));
      repository.savePlatform({lastBackupAt:backup.generatedAt});renderDataStatus();message('本地备份已生成，未上传或外发');
    };
    $('#platformRestore').onchange=async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{
        const payload=JSON.parse(await file.text());
        if(!window.confirm('恢复将覆盖备份文件中对应的本机工作台数据。确认继续？')){event.target.value='';return}
        const count=repository.restore(payload);message(`已恢复 ${count} 个本地数据集，页面将刷新`);setTimeout(()=>location.reload(),650);
      }catch(error){message(error?.message||'备份文件无法读取',true);event.target.value=''}
    };
    $('#platformExportReport').onclick=()=>{
      const report=reportModel(buildSnapshot()),stamp=isoDate();
      download(`ai-ceo-os-report-${stamp}.txt`,report.text,'text/plain');message('实时经营摘要已导出到本机');
    };
    $('#platformPrint').onclick=()=>{document.body.classList.add('workspace-print-platform');window.print();setTimeout(()=>document.body.classList.remove('workspace-print-platform'),300)};
    window.addEventListener('storage',()=>renderAll(true));
    window.addEventListener('focus',()=>renderAll());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderAll()});
    document.addEventListener('submit',()=>setTimeout(()=>renderAll(true),100));
    document.addEventListener('click',()=>setTimeout(()=>renderAll(),120));
  }

  function init(){
    if(document.getElementById('workspacePlatform'))return;
    const root=shell();if(!root)return;
    bind();renderAll(true);
    refreshTimer=setInterval(()=>renderAll(),10000);
    window.WorkspacePlatform={refresh:()=>renderAll(true),repository,version:REPOSITORY_VERSION,destroy:()=>clearInterval(refreshTimer)};
    window.dispatchEvent(new CustomEvent('workspace:platform-ready',{detail:{version:REPOSITORY_VERSION}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
