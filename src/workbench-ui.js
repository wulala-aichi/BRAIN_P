(function(scope){
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const sidebar=document.querySelector('.sidebar');
  if(!sidebar||!scope.AtlasStudio)return;
  document.body.classList.add('studio-workbench');
  const groups=[
    {id:'view',name:'切片',icon:'layers-2',title:'切片与视图',description:'选择切面、片层位置和展示方式。',sections:[0,1]},
    {id:'data',name:'数据',icon:'database',title:'脑区与研究数据',description:'筛选脑区、导入分区赋值，或进入研究工作台。',sections:[4,5,2]},
    {id:'style',name:'样式',icon:'palette',title:'配色与色条',description:'调整视觉样式；不改变输入数据或统计结果。',sections:[3,6]},
    {id:'export',name:'导出',icon:'download',title:'画布、导出与项目',description:'检查图幅、标注与分辨率，保存可复现项目。',sections:[8,7]}
  ];
  const sections=[...sidebar.querySelectorAll(':scope > .control-section')];
  const opening=new Map(),panels=new Map();let active='view',searching=false;
  const intro=el('div','wb-sidebar-intro');
  intro.innerHTML='<div class="wb-eyebrow">ATLAS WORKSPACE <span>01—04</span></div><div class="wb-sidebar-title"><h2>图谱工作区</h2><button type="button" id="wbGuideOpen" class="wb-text-button">使用指南 <i data-lucide="circle-help"></i></button></div><label class="wb-search"><i data-lucide="search"></i><input id="wbSettingsSearch" type="search" placeholder="搜索设置，如：阈值、标签、DPI" aria-label="搜索全部图谱设置"></label>';
  const nav=el('div','wb-steps');nav.setAttribute('role','tablist');nav.setAttribute('aria-label','图谱操作步骤');
  const heading=el('div','wb-group-heading');heading.innerHTML='<h3 id="wbGroupTitle"></h3><p id="wbGroupDescription"></p>';
  const content=el('div','wb-settings-content'),empty=el('div','wb-search-empty','没有匹配的设置。试试“片层”“色条”或“导出”。');empty.hidden=true;empty.setAttribute('role','status');
  for(const [index,g]of groups.entries()){
    const button=el('button','wb-step');button.type='button';button.id='wb-tab-'+g.id;button.dataset.group=g.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','wb-panel-'+g.id);button.innerHTML=`<i data-lucide="${g.icon}"></i><span>${g.name}</span><small>0${index+1}</small>`;
    button.addEventListener('click',()=>{clearSearch();activate(g.id);});
    button.addEventListener('keydown',e=>{const keys={ArrowRight:1,ArrowLeft:-1};let next;if(e.key in keys)next=(index+keys[e.key]+groups.length)%groups.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=groups.length-1;else return;e.preventDefault();clearSearch();activate(groups[next].id);nav.children[next].focus();});
    nav.append(button);
    const panel=el('div','wb-settings-panel');panel.id='wb-panel-'+g.id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panels.set(g.id,panel);
    g.sections.forEach((i,order)=>{const section=sections[i];if(!section)return;const details=el('details','wb-section');details.dataset.search=(section.textContent+' '+[...section.querySelectorAll('[id]')].map(x=>x.id).join(' ')).toLocaleLowerCase();details.open=order===0||g.id==='view'&&order===0;const summary=el('summary');const h=section.querySelector('h2');if(h){summary.append(...h.childNodes);h.remove();}details.append(summary,section);panel.append(details);});
    content.append(panel);
  }
  sidebar.prepend(intro,nav,heading,content,empty);
  const source=sidebar.querySelector('.source-note');if(source)source.classList.add('wb-source');
  const search=$('wbSettingsSearch');
  function activate(id){active=id;const g=groups.find(x=>x.id===id);for(const[key,p]of panels)p.hidden=key!==id;for(const b of nav.children){const on=b.dataset.group===id;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}$('wbGroupTitle').textContent=g.title;$('wbGroupDescription').textContent=g.description;empty.hidden=true;sidebar.scrollTop=0;}
  function clearSearch(){if(!searching)return;search.value='';searching=false;for(const d of content.querySelectorAll('details')){if(d.classList.contains('wb-section'))d.hidden=false;if(opening.has(d))d.open=opening.get(d);}opening.clear();activate(active);}
  search.addEventListener('input',()=>{const q=search.value.trim().toLocaleLowerCase();if(!q){clearSearch();return;}if(!searching){for(const d of content.querySelectorAll('details'))opening.set(d,d.open);searching=true;}let count=0;for(const p of panels.values()){let matches=0;for(const d of p.children){const match=d.dataset.search.includes(q);d.hidden=!match;if(match){d.open=true;d.querySelectorAll('details').forEach(n=>n.open=true);matches++;}}p.hidden=!matches;count+=matches;}$('wbGroupTitle').textContent='设置搜索';$('wbGroupDescription').textContent=`找到 ${count} 个相关设置分组 · 清空搜索返回当前步骤；部分参数随视图启用`;empty.hidden=count!==0;});
  search.addEventListener('keydown',e=>{if(e.key==='Escape'){clearSearch();search.blur();}});
  activate('view');

  // Keep every original control and event listener; only reorganize presentation.
  const grid=$('gridControls'),spacing=grid?.querySelector('.spacing-heading');
  if(spacing){const d=el('details','wb-subsection');d.append(el('summary','','图间距与实际取片间隔'));let n=spacing;while(n){const next=n.nextSibling;d.append(n);n=next;}grid.append(d);}
  const captions={openResearch:'研究数据',openPublication:'图版排版',openNifti:'MRI / 统计',openMRIAdvanced:'MRI 3D / 高级'};
  for(const[id,label]of Object.entries(captions)){const b=$(id);if(b){b.textContent=label;b.classList.add('wb-module-button');b.title=({openResearch:'实验点、网络、注射/光纤/电极、ROI与研究数据',openPublication:'组合面板、编辑标注并导出图版',openNifti:'加载模板和统计图、调节统计值与簇阈值',openMRIAdvanced:'多图层影像、3D体渲染与组合出图'})[id];}}
  document.querySelector('.brand div > span').textContent='BRAIN_P BETA · 研究用途';
  for(const[id,label]of [['importSettings','打开项目'],['saveSettings','保存项目']]){const b=$(id);b.classList.add('wb-project-button');b.append(el('span','',label));}
  $('resetSettings').classList.add('wb-reset');
  $('resetSettings').addEventListener('click',e=>{if(!scope.confirm('恢复默认会清空当前会话中的数据、标注与图版设置。请先保存项目。已导出的项目文件不会被删除。\n\n确定恢复默认吗？')){e.preventDefault();e.stopImmediatePropagation();}},true);
  const toolbar=document.querySelector('.viewer-toolbar');
  const workspaceTag=el('span','wb-workspace-tag','Allen CCF');toolbar.querySelector('div').prepend(workspaceTag);
  const guide=el('dialog','wb-guide');guide.id='wbGuide';guide.setAttribute('aria-labelledby','wbGuideTitle');
  guide.innerHTML=`<header class="wb-guide-head"><div><div class="wb-eyebrow">QUICK START</div><h2 id="wbGuideTitle">从数据到可复现的科研图版</h2><p>按任务选择入口。所有文件在本地处理，无需联网。</p></div><button type="button" id="wbGuideClose" class="button secondary">关闭指南</button></header><div class="wb-guide-grid">
    <button type="button" class="wb-workflow" data-start="atlas"><i data-lucide="brain-circuit"></i><span class="wb-eyebrow">01 · 图谱</span><strong>浏览脑区与切片</strong><span>选择切面 → 单片 / 网格 / 3D → 调整片层</span><small>适合：Allen 解剖图、脑区示意</small></button>
    <button type="button" class="wb-workflow" data-start="values"><i data-lucide="table-properties"></i><span class="wb-eyebrow">02 · 定量</span><strong>脑区赋值与伪彩</strong><span>导入 CSV → 核对脑区与半球 → 设置色阶</span><small>适合：脑区统计量、效应量及表达值</small></button>
    <button type="button" class="wb-workflow" data-start="mri"><i data-lucide="scan"></i><span class="wb-eyebrow">03 · MRI</span><strong>模板与统计图叠加</strong><span>载入 NIfTI → 核对空间 → 设置阈值与簇条件</span><small>适合：T / Z / p / q 图及 3D 展示</small></button>
    <button type="button" class="wb-workflow" data-start="research"><i data-lucide="microscope"></i><span class="wb-eyebrow">04 · 实验</span><strong>实验位点与研究数据</strong><span>导入实验数据 → 叠加位点 / 网络 → 加入图版</span><small>适合：注射、光纤、电极、连接组与 ROI</small></button>
    </div><div class="wb-guide-finish"><i data-lucide="layout-template"></i><div><strong>最后一步：组合出图并保存项目</strong><p>“图版排版”整理面板与标注；“导出”设置尺寸和格式。保存项目可保留数据与参数，不只是图片。</p></div><button type="button" class="button primary" data-start="publication">进入图版排版</button></div><p class="wb-guide-note">坐标说明：图谱使用 Allen CCF 体积坐标；MRI 使用文件头世界坐标。两者不能直接视作 bregma，也不会自动配准。显示调整不等于重新统计分析。</p>`;
  document.body.append(guide);
  $('wbGuideOpen').addEventListener('click',()=>guide.showModal());$('wbGuideClose').addEventListener('click',()=>guide.close());
  guide.addEventListener('click',e=>{if(e.target===guide)guide.close();});
  function start(task){guide.close();clearSearch();if(task==='atlas')activate('view');if(task==='values'){activate('data');const d=$('assignmentTarget').closest('.wb-section');d.open=true;d.scrollIntoView({block:'start',behavior:'smooth'});$('importValues').focus({preventScroll:true});}if(task==='mri')$('openNifti').click();if(task==='research')$('openResearch').click();if(task==='publication')$('openPublication').click();}
  guide.querySelectorAll('[data-start]').forEach(b=>b.addEventListener('click',()=>start(b.dataset.start)));
  const welcome=el('div','wb-onboarding');welcome.id='wbOnboarding';welcome.innerHTML='<div><span class="wb-eyebrow">开始一个科研图版</span><strong>浏览图谱，或导入自己的研究结果</strong><p>左侧按四步调整图谱；MRI、实验数据和组合排版使用上方独立工作区。</p></div><div class="wb-onboarding-actions"><button type="button" class="button primary" id="wbWelcomeGuide">选择工作流</button><button type="button" class="wb-text-button" id="wbWelcomeHide">收起引导</button></div>';
  toolbar.after(welcome);
  try{welcome.hidden=localStorage.getItem('brain-p-public-guide-hidden')==='1';}catch{}
  $('wbWelcomeGuide').addEventListener('click',()=>guide.showModal());$('wbWelcomeHide').addEventListener('click',()=>{welcome.hidden=true;try{localStorage.setItem('brain-p-public-guide-hidden','1');}catch{}});

  // Jump links expose existing detail groups without duplicating scientific controls.
  function dialogNavigation(id,selector,help){const dialog=$(id),controls=dialog?.querySelector(selector);if(!controls)return;const ds=[...controls.children].filter(n=>n.tagName==='DETAILS');if(!ds.length)return;const block=el('div','wb-dialog-navigation');block.append(el('p','wb-dialog-help',help));const list=el('nav','wb-dialog-links');list.setAttribute('aria-label','跳转设置分组');ds.forEach(d=>{const title=d.querySelector('summary')?.textContent?.trim();if(!title)return;const b=el('button','',title.replace(/^\d+\s*·\s*/,''));b.type='button';b.addEventListener('click',()=>{d.open=true;d.scrollIntoView({block:'start',behavior:'smooth'});d.querySelector('summary').focus({preventScroll:true});});list.append(b);});block.append(list);controls.prepend(block);}
  dialogNavigation('niftiDialog','.nifti-controls','推荐顺序：载入模板和统计图 → 核对空间 → 应用阈值 → 组合与导出。');
  dialogNavigation('mriAdvancedDialog','.adv-controls','载入图层后，先“交互调整”，再切换“成图预览”导出；统计推断请在 MRI / 统计中完成。');
  for(const[id,subtitle]of [['niftiDialog','统计工作区 · 模板与统计图叠加、阈值过滤和二维图版'],['mriAdvancedDialog','高级影像工作区 · 多图层、3D 渲染与组合出图']]){const d=$(id),h=d?.querySelector('.nifti-head p');if(h){h.title=h.textContent;h.textContent=subtitle;}}
  const statuses=[['values','valueStatus'],['project','projectStatus'],['export','exportStatus']];
  for(const[,id]of statuses){const node=$(id);if(node){node.setAttribute('aria-live','polite');node.classList.add('wb-status');}}
  scope.AtlasWorkbench=Object.freeze({version:'1.0.0',groups:()=>groups.map(g=>({id:g.id,name:g.name,sectionCount:g.sections.length})),activeGroup:()=>active});
  scope.lucide?.createIcons();
})(window);
