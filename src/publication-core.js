(function(scope){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const num=(v,f,a,b)=>Number.isFinite(v)?clamp(v,a,b):f;
  const text=(v,n=160)=>typeof v==='string'?v.slice(0,n):'';
  const fonts=['Arial','Helvetica','Times New Roman','Microsoft YaHei'];
  function defaults(){return{version:2,width:183,height:140,margin:8,gap:5,columns:2,title:'',rowTitles:[],columnTitles:[],font:'Arial',fontSize:8,labelSize:10,transparent:true,background:'#ffffff',snap:true,sharedLegend:null,panels:[],annotations:[]};}
  function sharedInfo(model){const s=model.sharedLegend,B=scope.AtlasColorbar;if(!s?.enabled||!B)return null;const panels=model.panels.filter(p=>s.panelIds.includes(p.id)),items=panels.map(p=>({spec:p.provenance.colourMapping,config:p.colorbar}));if(panels.length<2)return{ok:false,error:'共用色条至少需要两个定量面板'};const match=B.compatible(items);if(!match.ok)return match;const spec=items[0].spec;if(B.key(spec,s.config)!==B.key(spec,items[0].config))return{ok:false,error:'共用色条的映射与面板不一致'};const config=B.clean(s.config),plan=B.plan(spec,config,config.orientation==='horizontal'?Math.max(5,model.width-2*model.margin-20):Infinity);const side=['left','right'].includes(config.position);if(config.show&&((side&&plan.width+2*model.margin+20>model.width)||(!side&&plan.height+2*model.margin+20>model.height)||plan.height+2*model.margin>model.height))return{ok:false,error:'画布空间不足以放置共用色条；请增大画布或缩短色条'};return{ok:true,panels,spec,config,plan,reserve:config.show?(side?plan.width:plan.height)+4:0};}
  const sharedReserve=(model,side)=>{const info=sharedInfo(model);return info?.ok&&info.config.position===side?info.reserve:0;};
  const titleBand=model=>model.fontSize*25.4/72*3.2+2;
  const top=model=>model.margin+(model.title?model.fontSize*25.4/72*3.2+3:0)+(model.columnTitles?.some(Boolean)?titleBand(model):0)+sharedReserve(model,'top');
  const left=model=>model.margin+(model.rowTitles?.some(Boolean)?titleBand(model):0)+sharedReserve(model,'left');
  const right=model=>model.margin+sharedReserve(model,'right'),bottom=model=>model.margin+sharedReserve(model,'bottom');
  const minHeight=(p,model)=>Math.max(12,Math.max(p.title?model.fontSize*3.2:0,p.label?model.labelSize*3.2:0)*25.4/72+8);
  function fit(panel,model){
    const l=left(model),t=top(model),r=right(model),b=bottom(model),maxW=model.width-l-r,maxH=model.height-t-b;
    panel.w=clamp(panel.w,12,maxW);panel.h=clamp(panel.h,Math.min(minHeight(panel,model),maxH),maxH);
    panel.x=clamp(panel.x,l,model.width-r-panel.w);panel.y=clamp(panel.y,t,model.height-b-panel.h);
    return panel;
  }
  function clean(input){
    const out=defaults();if(!input||typeof input!=='object')return out;
    out.width=num(input.width,out.width,80,400);out.height=num(input.height,out.height,60,500);
    out.margin=num(input.margin,8,2,20);out.gap=num(input.gap,5,0,25);out.columns=Math.round(num(input.columns,2,1,8));
    out.title=text(input.title);out.font=fonts.includes(input.font)?input.font:'Arial';
    for(const key of ['rowTitles','columnTitles'])if(Array.isArray(input[key]))out[key]=input[key].slice(0,64).map(v=>text(v,80));
    out.fontSize=num(input.fontSize,8,4,24);out.labelSize=num(input.labelSize,10,5,30);
    for(const key of ['transparent','snap'])if(typeof input[key]==='boolean')out[key]=input[key];
    if(/^#[0-9a-f]{6}$/i.test(input.background))out.background=input.background;
    const minimum=Math.max(12,...(Array.isArray(input.panels)?input.panels:[]).filter(Boolean).map(p=>minHeight(p,out)));
    out.height=Math.max(out.height,Math.ceil(top(out)+out.margin+minimum));
    const ids=new Set();
    for(const [index,p]of (Array.isArray(input.panels)?input.panels:[]).slice(0,64).entries()){
      if(!p||typeof p.svg!=='string'||!p.svg.includes('<svg'))continue;
      let id=text(p.id,80)||'panel-'+index;while(ids.has(id))id+='-copy';ids.add(id);
      const panel={id,title:text(p.title),label:text(p.label,12),kind:['slice','view','3d','chart'].includes(p.kind)?p.kind:'view',
        svg:p.svg,sourceWidth:num(p.sourceWidth,1200,.001,100000),sourceHeight:num(p.sourceHeight,900,.001,100000),
        x:num(p.x,out.margin,0,out.width),y:num(p.y,out.margin,0,out.height),w:num(p.w,75,12,400),h:num(p.h,55,12,500),
        colorbar:scope.AtlasColorbar?scope.AtlasColorbar.clean(p.colorbar):null,
        provenance:p.provenance&&typeof p.provenance==='object'?JSON.parse(JSON.stringify(p.provenance)): {}};
      out.panels.push(fit(panel,out));
    }
    if(input.sharedLegend?.enabled&&Array.isArray(input.sharedLegend.panelIds))out.sharedLegend={enabled:true,panelIds:[...new Set(input.sharedLegend.panelIds.filter(id=>out.panels.some(p=>p.id===id)))],config:scope.AtlasColorbar?scope.AtlasColorbar.clean(input.sharedLegend.config):null};
    out.panels.forEach(p=>fit(p,out));
    out.annotations=scope.AtlasPublicationAnnotations?scope.AtlasPublicationAnnotations.clean(input.annotations,out.panels,out):[];
    return out;
  }
  function letter(index){let out='';do{out=String.fromCharCode(65+index%26)+out;index=Math.floor(index/26)-1;}while(index>=0);return out;}
  function arrange(model,ids){
    const chosen=model.panels.filter(p=>!ids?.length||ids.includes(p.id));if(!chosen.length)return;
    const cols=Math.min(model.columns,chosen.length),rows=Math.ceil(chosen.length/cols),t=top(model),l=left(model),minH=Math.max(...chosen.map(p=>minHeight(p,model)));
    const gap=Math.min(model.gap,(model.width-l-right(model)-cols*12)/Math.max(1,cols-1),(model.height-t-bottom(model)-rows*minH)/Math.max(1,rows-1));
    if(gap<0)throw new Error('画布过小，请增加高度或减少面板数量');
    const w=(model.width-l-right(model)-gap*(cols-1))/cols,h=(model.height-t-bottom(model)-gap*(rows-1))/rows;
    chosen.forEach((p,i)=>Object.assign(p,{x:l+(i%cols)*(w+gap),y:t+Math.floor(i/cols)*(h+gap),w,h}));
  }
  function align(model,ids,action){
    const panels=model.panels.filter(p=>ids.includes(p.id));if(panels.length<2)return;
    const first=panels[0],left=Math.min(...panels.map(p=>p.x)),top=Math.min(...panels.map(p=>p.y));
    if(action==='left')panels.forEach(p=>p.x=left);
    if(action==='top')panels.forEach(p=>p.y=top);
    if(action==='width')panels.forEach(p=>p.w=first.w);
    if(action==='height')panels.forEach(p=>p.h=first.h);
    if(action==='horizontal'||action==='vertical'){
      const horizontal=action==='horizontal',pos=horizontal?'x':'y',size=horizontal?'w':'h';
      panels.sort((a,b)=>a[pos]-b[pos]);const start=panels[0][pos],end=Math.max(...panels.map(p=>p[pos]+p[size]));
      const gap=(end-start-panels.reduce((s,p)=>s+p[size],0))/(panels.length-1);
      if(gap<0)throw new Error('选中面板空间不足，无法无重叠均匀分布；请使用网格排版');
      let cursor=start;panels.forEach(p=>{p[pos]=cursor;cursor+=p[size]+gap;});
    }
    panels.forEach(p=>fit(p,model));
  }
  function warnings(model){
    const out=[];if(!model.panels.length)out.push('画布尚无面板');
    const shared=sharedInfo(model);if(shared&&!shared.ok)out.push('共用色条未显示：'+shared.error+'；已恢复独立色条');
    for(let i=0;i<model.panels.length;i++)for(let j=i+1;j<model.panels.length;j++){
      const a=model.panels[i],b=model.panels[j];if(a.x<b.x+b.w-.01&&a.x+a.w>b.x+.01&&a.y<b.y+b.h-.01&&a.y+a.h>b.y+.01)out.push(`面板 ${a.label||i+1} 与 ${b.label||j+1} 重叠`);
    }
    return out;
  }
    scope.AtlasPublicationCore=Object.freeze({defaults,clean,fit,arrange,align,letter,warnings,fonts,top,left,right,bottom,titleBand,sharedInfo});
})(typeof window==='undefined'?globalThis:window);
