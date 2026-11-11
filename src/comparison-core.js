(function(scope){
  'use strict';
  const dims=['group','timepoint','metric','slice'],names={group:'组别',timepoint:'时间点',metric:'指标',slice:'片层'},modes={mean:'Group mean',difference:'B−A',effect:'Hedges g'},C=scope.AtlasResearchCore,B=scope.AtlasColorbar;
  const unique=a=>[...new Set(a)],strings=a=>Array.isArray(a)?unique(a.filter(v=>typeof v==='string').map(v=>v.slice(0,160))):null;
  const number=(v,f,a,b)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
  function defaults(){return{version:1,row:'group',column:'slice',mode:'mean',reference:'',orientation:'coronal',hemisphere:'B',groups:null,times:null,metrics:null,slices:[2,3.2,4.4,5.6,6.8,8,9.2,10.4],rowsPerPage:8,columnsPerPage:8,cellWidth:42,cellHeight:36,gap:3,fontPt:7,title:'Multi-condition comparison',transparent:true,showNames:false,maps:{}};}
  function clean(input={}){const out=defaults();if(!input||typeof input!=='object')return out;
    for(const key of ['row','column'])if(dims.includes(input[key]))out[key]=input[key];
    if(Object.hasOwn(modes,input.mode))out.mode=input.mode;if(['coronal','sagittal','horizontal'].includes(input.orientation))out.orientation=input.orientation;if(['B','L','R'].includes(input.hemisphere))out.hemisphere=input.hemisphere;
    for(const key of ['groups','times','metrics'])out[key]=strings(input[key]);if(Array.isArray(input.slices))out.slices=unique(input.slices.filter(Number.isFinite));
    for(const[key,min,max]of [['rowsPerPage',1,8],['columnsPerPage',1,8],['cellWidth',25,100],['cellHeight',25,100],['gap',0,12],['fontPt',5,12]])out[key]=number(input[key],out[key],min,max);
    out.rowsPerPage=Math.round(out.rowsPerPage);out.columnsPerPage=Math.round(out.columnsPerPage);for(const key of ['transparent','showNames'])if(typeof input[key]==='boolean')out[key]=input[key];
    for(const[key,n]of [['title',200],['reference',160]])if(typeof input[key]==='string')out[key]=input[key].slice(0,n);
    if(input.maps&&typeof input.maps==='object')for(const[key,value]of Object.entries(input.maps).slice(0,200)){if(!value||typeof value!=='object')continue;out.maps[key]={manual:value.manual===true,min:Number.isFinite(value.min)?value.min:null,max:Number.isFinite(value.max)?value.max:null,map:Object.hasOwn(scope.AtlasValues.maps,value.map)?value.map:null,colorbar:B.clean(value.colorbar)};}
    return out;
  }
  function catalogue(rows){return{groups:unique(rows.map(r=>r.group)).sort(),times:unique(rows.map(r=>r.timepoint||'')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),metrics:unique(rows.map(r=>r.metric)).sort()};}
  function sliceLabel(position,orientation){return({coronal:'AP',sagittal:'ML',horizontal:'DV'}[orientation]||'')+' '+Number(position.toFixed(3))+' mm';}
  const label=(dimension,value,orientation)=>dimension==='slice'?sliceLabel(value,orientation):value||'未指定';
  function plan(rows,input,atlas){
    const config=clean(input),catalog=catalogue(rows),notes=[];if(config.row===config.column)throw new Error('矩阵的行、列必须使用不同维度');
    const dimensions={group:config.groups??catalog.groups,timepoint:config.times??catalog.times,metric:config.metrics??catalog.metrics,slice:config.slices};
    for(const [dim,allowed]of [['group',catalog.groups],['timepoint',catalog.times],['metric',catalog.metrics]])if(dimensions[dim].some(v=>!allowed.includes(v)))throw new Error(names[dim]+'包含当前长表中不存在的值，请重新选择');
    if(config.mode!=='mean'){if(!catalog.groups.includes(config.reference))throw new Error('请选择长表中存在的参考 A 组');if(dimensions.group.includes(config.reference)){dimensions.group=dimensions.group.filter(g=>g!==config.reference);notes.push('参考组 '+config.reference+' 不作为 B 组重复比较');}}
    for(const dim of dims)if(!dimensions[dim].length)throw new Error('请至少选择一个'+names[dim]);
    const slices=atlas.planes[config.orientation].slices,low=slices[0].position,high=slices.at(-1).position;
    if(dimensions.slice.some(p=>p<low-1e-8||p>high+1e-8))throw new Error(`片层超出当前方向范围 ${low}–${high} mm`);
    dimensions.slice=unique(dimensions.slice.map(position=>slices.reduce((best,s)=>Math.abs(s.position-position)<Math.abs(best.position-position)-1e-10?s:best,slices[0]).position));
    if(JSON.stringify(dimensions.slice)!==JSON.stringify(config.slices))notes.push('片层已吸附到现有浏览片层；不做插值');config.slices=[...dimensions.slice];
    const total=dims.reduce((n,d)=>n*dimensions[d].length,1);if(total>512)throw new Error(`当前选择产生 ${total} 个单元，超过离线单次 512 个上限；请分批选择条件`);
    const selected=rows.filter(r=>dimensions.metric.includes(r.metric)&&dimensions.timepoint.includes(r.timepoint||'')&&r.hemisphere===config.hemisphere&&(dimensions.group.includes(r.group)||(config.mode!=='mean'&&r.group===config.reference)));
    if(selected.some(r=>!Number.isFinite(r.value)||!r.sample_id||!r.region))throw new Error('动物长表包含非法数值或缺少动物/脑区编号，请先完成数据质控');
    const quantities=new Map(),cache=new Map();
    for(const metric of dimensions.metric){const units=unique(selected.filter(r=>r.metric===metric).map(r=>r.unit||''));if(units.length>1)throw new Error(`指标 ${metric} 的单位不一致，不能跨条件统一色阶；请先统一单位`);const sourceUnit=units[0]||'',unit=config.mode==='effect'?'standardized effect (dimensionless)':sourceUnit,key=JSON.stringify([metric,sourceUnit,config.mode]);quantities.set(metric,{key,metric,sourceUnit,unit,kind:config.mode==='effect'?'effect':config.mode==='difference'?'difference':'value',title:metric+' · '+modes[config.mode],values:[]});}
    function summarize(condition){const {group,timepoint,metric}=condition,key=JSON.stringify([group,timepoint,metric]);if(cache.has(key))return cache.get(key);const matching=selected.filter(r=>r.metric===metric&&(r.timepoint||'')===timepoint),q=quantities.get(metric);
      let data;if(config.mode==='mean')data=C.aggregate(matching.filter(r=>r.group===group),{metric,group,hemisphere:config.hemisphere});else data=C.compare(matching,{metric,groupA:config.reference,groupB:group,timepoint,hemisphere:config.hemisphere}).map(r=>({...r,value:config.mode==='effect'?r.hedges_g:r.value,unit:q.unit}));
      data=data.map(r=>({...r,unit:q.unit}));const values=data.map(r=>r.value).filter(Number.isFinite);q.values.push(...values);
      const animals=unique(matching.filter(r=>r.group===group).map(r=>r.sample_id)),referenceAnimals=config.mode==='mean'?[]:unique(matching.filter(r=>r.group===config.reference).map(r=>r.sample_id));
      const result={rows:data,quantity:q.key,hasData:values.length>0,status:values.length?'ok':matching.some(r=>r.group===group)?'no_estimable_value':'no_data',animals,referenceAnimals,validTests:data.filter(r=>Number.isFinite(r.p)).length};cache.set(key,result);return result;
    }
    const pages=[],remaining=dims.filter(d=>![config.row,config.column].includes(d));let combinations=[{}];for(const dim of remaining)combinations=combinations.flatMap(c=>dimensions[dim].map(value=>({...c,[dim]:value})));
    for(const fixed of combinations)for(let r0=0;r0<dimensions[config.row].length;r0+=config.rowsPerPage)for(let c0=0;c0<dimensions[config.column].length;c0+=config.columnsPerPage){
      const rowValues=dimensions[config.row].slice(r0,r0+config.rowsPerPage),columnValues=dimensions[config.column].slice(c0,c0+config.columnsPerPage),cells=[];
      for(const [r,rowValue]of rowValues.entries())for(const [c,columnValue]of columnValues.entries()){const condition={...fixed,[config.row]:rowValue,[config.column]:columnValue},summary=summarize(condition);cells.push({id:`cell-${pages.length+1}-${r}-${c}`,r,c,condition,sliceIndex:slices.findIndex(s=>Math.abs(s.position-condition.slice)<1e-8),...summary});}
      pages.push({id:'page-'+(pages.length+1),fixed,rowOffset:r0,columnOffset:c0,rowValues,columnValues,cells,title:remaining.map(d=>`${names[d]}: ${label(d,fixed[d],config.orientation)}`).join(' · ')});
    }
    for(const q of quantities.values()){const override=config.maps[q.key]||{},values=q.values,qc=override.colorbar||B.clean({lengthMm:26,fontPt:6,align:'start'});let range;
      if(override.manual){if(!Number.isFinite(override.min)||!Number.isFinite(override.max)||override.min>=override.max)throw new Error(q.metric+' 的手动色阶必须为有限且递增的上下限');range=[override.min,override.max];}
      else if(!values.length)range=[-1,1];else if(config.mode!=='mean'){const a=Math.max(...values.map(Math.abs))||1;range=[-a,a];}else{let a=Math.min(...values),b=Math.max(...values);if(a===b){const pad=Math.max(.5,Math.abs(a)*.05);a-=pad;b+=pad;}range=[a,b];}
      const map=override.map||(config.mode==='mean'?'viridis':'diverging');q.range=range;q.rangeSource=override.manual?'manual':values.length?'all selected conditions':'no_data_placeholder';q.noData=!values.length;q.map=map;q.colorbar=B.clean({...qc,orientation:'horizontal',position:'bottom',align:'start'});q.spec={version:2,quantity:q.key,title:q.title,unit:q.unit,kind:q.kind,range,stops:scope.AtlasValues.maps[map].map((colour,i,all)=>({at:i/(all.length-1),colour})),missingColour:'#e0e3e4',filter:'none',filtered:false};delete q.values;
    }
    notes.push('脑区汇总数值投影到各片层，不是逐片层重新定量；缺失不补零。','每个时间点分别汇总/比较，不执行配对、重复测量或纵向推断。');
    if(config.mode!=='mean')notes.push('独立组 Welch；BH 范围为每个指标/时间点/半球/B−A 对比内有效脑区检验；不同片层不重复校正。');
    return{version:1,config,dimensions,quantities:[...quantities.values()],pages,totalCells:total,notes,selectedRows:selected,model:config.mode==='mean'?'Independent animal means within each exact timepoint':'Independent groups Welch / Hedges g within each exact timepoint; BH by metric/timepoint/hemisphere/contrast'};
  }
  scope.AtlasComparisonCore=Object.freeze({defaults,clean,catalogue,sliceLabel,label,plan,dims,names,modes});
})(typeof window==='undefined'?globalThis:window);
