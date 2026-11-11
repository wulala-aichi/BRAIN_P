(function(scope){
  'use strict';
  const mm=25.4/72,kinds=['text','label','arrow','line','rect','inset','injection','fiber','neuropixels'],implantKinds=['injection','fiber','neuropixels'];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number=(v,f,a,b)=>Number.isFinite(v)?clamp(v,a,b):f;
  function implantOptions(input={}){return{version:1,showLabel:input.showLabel!==false,symbolMm:number(input.symbolMm,2.4,.5,8),shaftMm:number(input.shaftMm,.8,.15,4),labelDxMm:number(input.labelDxMm,4,-80,80),labelDyMm:number(input.labelDyMm,-5,-80,80),siteStyle:['ring','square','target','dot','cross'].includes(input.siteStyle)?input.siteStyle:'ring',showCone:input.showCone!==false,coneLengthMm:number(input.coneLengthMm,8,1,25),coneAngleDeg:number(input.coneAngleDeg,35,5,100),coneOpacity:number(input.coneOpacity,.22,0,.65),shanks:Math.round(number(input.shanks,1,1,4)),contacts:Math.round(number(input.contacts,16,4,32)),activeFraction:number(input.activeFraction,.55,.1,1),shankSpacingMm:number(input.shankSpacingMm,1.8,.5,8)};}
  function clean(items,panels,model){
    const ids=new Set();return(Array.isArray(items)?items:[]).slice(0,400).flatMap((item,index)=>{
      if(!item||!kinds.includes(item.kind)||!panels.some(p=>p.id===item.panelId))return[];
      let id=typeof item.id==='string'?item.id.slice(0,80):'annotation-'+index;while(ids.has(id))id+='-copy';ids.add(id);
      const a={id,panelId:item.panelId,kind:item.kind,x:number(item.x,.4,-2,3),y:number(item.y,.4,-2,3),x2:number(item.x2,.6,-2,3),y2:number(item.y2,.6,-2,3),
        text:typeof item.text==='string'?item.text.slice(0,300):'',colour:/^#[0-9a-f]{6}$/i.test(item.colour)?item.colour:'#384b43',fontPt:number(item.fontPt,8,4,24),linePt:number(item.linePt,.7,.1,3),
        textHalo:item.textHalo!==false,showSource:item.showSource!==false,showConnector:item.showConnector!==false,showScale:item.showScale!==false};
      if(implantKinds.includes(a.kind))a.implant=implantOptions(item.implant);
      if(['rect','inset'].includes(a.kind)){
        [a.x,a.x2]=[Math.min(a.x,a.x2),Math.max(a.x,a.x2)];[a.y,a.y2]=[Math.min(a.y,a.y2),Math.max(a.y,a.y2)];
        if(a.kind==='inset'){a.x=clamp(a.x,0,.999);a.y=clamp(a.y,0,.999);a.x2=clamp(a.x2,a.x+.001,1);a.y2=clamp(a.y2,a.y+.001,1);}
      }
      if(a.kind==='inset'){a.showAnnotations=item.showAnnotations!==false;const b=item.box||{},p=panels.find(p=>p.id===a.panelId),cal=p.provenance?.insetCalibration,minimum=6+(a.text?a.fontPt*mm*1.6+1:0)+(a.showScale&&cal?.valid?a.fontPt*mm*1.6+2:0),w=number(b.w,38,12,model.width),h=number(b.h,32,Math.max(12,minimum),model.height);a.box={x:number(b.x,model.width-w-3,0,model.width-w),y:number(b.y,3,0,model.height-h),w,h};}
      return[a];
    });
  }
  function frame(panel,area){const scale=Math.min(area.w/panel.sourceWidth,area.h/panel.sourceHeight),w=panel.sourceWidth*scale,h=panel.sourceHeight*scale;return{x:panel.x+area.x+(area.w-w)/2,y:panel.y+area.y+(area.h-h)/2,w,h,scale};}
  const map=(f,x,y)=>({x:f.x+f.w*x,y:f.y+f.h*y});
  const unmap=(f,x,y)=>({x:(x-f.x)/f.w,y:(y-f.y)/f.h});
  function deviceGeometry(a,f){
    const i=implantOptions(a.implant),p=map(f,a.x,a.y),q=map(f,a.x2,a.y2),length=Math.max(.001,Math.hypot(q.x-p.x,q.y-p.y)),u={x:(q.x-p.x)/length,y:(q.y-p.y)/length},n={x:-u.y,y:u.x},at=(d,offset=0)=>({x:p.x+u.x*d+n.x*offset,y:p.y+u.y*d+n.y*offset});
    const points=a.kind==='injection'?[{x:p.x-i.symbolMm/2,y:p.y-i.symbolMm/2},{x:p.x+i.symbolMm/2,y:p.y+i.symbolMm/2}]:[at(-2,-i.shaftMm),at(-2,i.shaftMm),at(length,-i.shaftMm),at(length,i.shaftMm)];
    if(a.kind==='fiber'&&i.showCone){const spread=Math.tan(i.coneAngleDeg*Math.PI/360)*i.coneLengthMm;points.push(at(length+i.coneLengthMm,-spread),at(length+i.coneLengthMm,spread));}
    const shanks=[];if(a.kind==='neuropixels')for(let index=0;index<i.shanks;index++){const offset=(index-(i.shanks-1)/2)*i.shankSpacingMm,tip=Math.min(1.8,length*.14);const polygon=[at(0,offset-i.shaftMm/2),at(length-tip,offset-i.shaftMm/2),at(length,offset),at(length-tip,offset+i.shaftMm/2),at(0,offset+i.shaftMm/2)];shanks.push({offset,polygon});points.push(...polygon);}
    return{i,p,q,length,u,n,at,points,shanks,label:a.kind==='injection'?q:{x:p.x+i.labelDxMm,y:p.y+i.labelDyMm}};
  }
  function insetLayout(a,p,f){
    const b=a.box,font=a.fontPt*mm,header=a.text?font*1.6+1:0,cal=p.provenance?.insetCalibration,calibrated=cal?.version===1&&cal.valid===true&&Number.isFinite(cal.unitsPerMm)&&cal.unitsPerMm>0;
    const footer=a.showScale&&calibrated?font*1.6+2:0,sourceW=(a.x2-a.x)*p.sourceWidth,sourceH=(a.y2-a.y)*p.sourceHeight;
    const scale=Math.max(.000001,Math.min((b.w-2)/sourceW,Math.max(1,b.h-header-footer-2)/sourceH)),w=sourceW*scale,h=sourceH*scale;
    const image={x:b.x+(b.w-w)/2,y:b.y+header+(b.h-header-footer-h)/2,w,h};
    const unitLength=calibrated?cal.unitsPerMm*scale:0,limit=(b.w-4)*.55;
    const physical=[10,5,2,1,.5,.2,.1,.05,.02,.01,.005,.002,.001].find(v=>unitLength*v<=limit);
    return{image,header,footer,scale,magnification:scale/f.scale,calibrated,ruler:a.showScale&&calibrated&&physical?{mm:physical,length:physical*unitLength}:null};
  }
  function bounds(a,f,measure){
    if(a.kind==='inset')return{...a.box};
    if(implantKinds.includes(a.kind)){const d=deviceGeometry(a,f),points=[...d.points];if(d.i.showLabel&&a.text){const size=a.fontPt*mm,lines=a.text.split(/\r?\n/).slice(0,4),w=Math.max(...lines.map(line=>measure?measure(line,size):line.length*size*.65));points.push({x:d.label.x,y:d.label.y-size},{x:d.label.x+w,y:d.label.y+size*(lines.length-1)*1.5});}const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x:x-.5,y:y-.5,w:Math.max(...points.map(p=>p.x))-x+1,h:Math.max(...points.map(p=>p.y))-y+1};}
    const p=map(f,a.kind==='label'?a.x2:a.x,a.kind==='label'?a.y2:a.y),q=map(f,a.x2,a.y2);
    if(['text','label'].includes(a.kind)){const size=a.fontPt*mm,lines=(a.text||'标注').split(/\r?\n/).slice(0,4),w=Math.max(...lines.map(line=>measure?measure(line,size):line.length*size*.65));return{x:p.x,y:p.y-size,w:Math.max(2,w),h:size*(1+(lines.length-1)*1.5)};}
    return{x:Math.min(p.x,q.x)-.5,y:Math.min(p.y,q.y)-.5,w:Math.max(1,Math.abs(p.x-q.x))+1,h:Math.max(1,Math.abs(p.y-q.y))+1};
  }
  function duplicate(items,idMap,offset=3){return items.filter(a=>idMap.has(a.panelId)).map((a,i)=>{const copy=JSON.parse(JSON.stringify(a));copy.id=a.id+'-copy-'+Date.now().toString(36)+'-'+i;copy.panelId=idMap.get(a.panelId);if(copy.box){copy.box.x+=offset;copy.box.y+=offset;}return copy;});}
  const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  function labelBounds(a,f,measure){
    if(!a.text)return null;let p;if(implantKinds.includes(a.kind)){if(!implantOptions(a.implant).showLabel)return null;p=deviceGeometry(a,f).label;}else if(['text','label'].includes(a.kind))p=map(f,a.kind==='label'?a.x2:a.x,a.kind==='label'?a.y2:a.y);else return null;
    const font=a.fontPt*mm,lines=a.text.split(/\r?\n/).slice(0,4),width=Math.max(...lines.map(t=>measure?measure(t,font):t.length*font*.65));return{x:p.x,y:p.y-font,w:width,h:font*(1+(lines.length-1)*1.5)};
  }
  function arrangeImplantLabels(model,frames,measure,panelId){let changed=0;const P=scope.AtlasImplantPublication;if(!P)return 0;
    for(const panel of model.panels.filter(p=>!panelId||p.id===panelId)){const f=frames.get(panel.id);if(!f)continue;const items=model.annotations.filter(a=>a.panelId===panel.id&&implantKinds.includes(a.kind)&&labelBounds(a,f,measure)),font=Math.max(7*mm,...items.map(a=>a.fontPt*mm));const points=items.map(a=>{const p=map(f,a.x,a.y),b=labelBounds(a,f,measure);return{id:a.id,x:p.x,y:p.y,text:a.text,width:b.w,height:b.h};}),layout=P.layoutLabels(points,{x:f.x,y:f.y,w:f.w,h:f.h},{font,pad:1,gap:.8,truncate:false});
      for(const row of layout.rows){const a=items.find(a=>a.id===row.id);if(a.kind==='injection'){const q=unmap(f,row.lx,row.ly);a.x2=q.x;a.y2=q.y;}else{const p=map(f,a.x,a.y);a.implant={...implantOptions(a.implant),labelDxMm:row.lx-p.x,labelDyMm:row.ly-p.y};}changed++;}
    }return changed;
  }
  function warnings(model,frames,measure){
    const out=[],textBoxes=[];
    for(const a of model.annotations){const f=frames.get(a.panelId);if(!f)continue;const b=bounds(a,f,measure);
      if(b.x<0||b.y<0||b.x+b.w>model.width||b.y+b.h>model.height)out.push(`标注“${a.text||a.kind}”超出画布`);
      const label=labelBounds(a,f,measure);if(label){for(const other of textBoxes)if(intersects(label,other.b))out.push(`文字标注“${a.text}”与“${other.text}”重叠`);textBoxes.push({b:label,text:a.text});
        for(const p of model.panels){const header={x:p.x,y:p.y,w:p.w,h:frames.get(p.id)?.header||0};if(header.h&&intersects(label,header))out.push(`文字标注“${a.text}”可能遮挡面板 ${p.label||p.id} 标题`);}
      }
      if(a.kind==='inset')for(const p of model.panels)if(intersects(b,{x:p.x,y:p.y,w:p.w,h:frames.get(p.id)?.header||0}))out.push(`放大插图“${a.text||'ROI'}”可能遮挡面板标题`);
    }
    return out;
  }
  function render({root,model,frames,selected,ui,source,namespace,measure,idPrefix=''}){
    const NS='http://www.w3.org/2000/svg',el=(name,attrs={},text)=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
    const addText=(group,a,x,y,value,maxWidth=Infinity)=>{const n=el('text',{x,y,fill:a.colour,'font-size':a.fontPt*mm,'paint-order':a.textHalo===false?'fill':'stroke fill',stroke:a.textHalo===false?'none':'#ffffff','stroke-width':a.textHalo===false?0:.45,'stroke-linejoin':'round','data-manual-text':a.id});
      (value||'标注').split(/\r?\n/).slice(0,4).forEach((line,i)=>{let visible=line;if(Number.isFinite(maxWidth)){while(visible&&measure(visible+(visible===line?'':'…'),a.fontPt*mm)>maxWidth)visible=visible.slice(0,-1);if(visible!==line)visible+='…';}n.append(el('tspan',{x,dy:i?a.fontPt*mm*1.5:0},visible));});group.append(n);};
    const ordered=ui?[...model.annotations.filter(a=>a.id!==selected),...model.annotations.filter(a=>a.id===selected)]:model.annotations;
    for(const item of ordered){const a=['rect','inset'].includes(item.kind)?{...item,x:Math.min(item.x,item.x2),y:Math.min(item.y,item.y2),x2:Math.max(item.x,item.x2,Math.min(item.x,item.x2)+.000001),y2:Math.max(item.y,item.y2,Math.min(item.y,item.y2)+.000001)}:item,panel=model.panels.find(p=>p.id===a.panelId),f=frames.get(a.panelId);if(!panel||!f)continue;
      const g=el('g',{'data-publication-annotation':a.id,'data-annotation-kind':a.kind,'data-source-panel':a.panelId}),p=map(f,a.x,a.y),q=map(f,a.x2,a.y2),stroke={'stroke':a.colour,'stroke-width':a.linePt*mm,'stroke-linecap':'round','stroke-linejoin':'round',fill:'none'};
      if(a.kind==='inset'){
        const b=a.box,l=insetLayout(a,panel,f);if(a.showSource)g.append(el('rect',{x:p.x,y:p.y,width:q.x-p.x,height:q.y-p.y,...stroke,'stroke-dasharray':'1 .7','data-inset-source':a.id}));
        if(a.showConnector){const right=b.x>q.x,left=b.x+b.w<p.x,sx=right?q.x:left?p.x:(p.x+q.x)/2,tx=right?b.x:left?b.x+b.w:b.x+b.w/2;g.append(el('line',{x1:sx,y1:(p.y+q.y)/2,x2:tx,y2:b.y+b.h/2,...stroke,'stroke-dasharray':'1 .8','data-inset-connector':a.id}));}
        g.append(el('rect',{x:b.x,y:b.y,width:b.w,height:b.h,...stroke,'data-inset-frame':a.id}));
        const crop=namespace(source(panel),'inset-'+a.id.replace(/[^\w-]/g,'_')),v=crop.getAttribute('viewBox').trim().split(/[ ,]+/).map(Number);
        crop.setAttribute('viewBox',`${v[0]+a.x*v[2]} ${v[1]+a.y*v[3]} ${(a.x2-a.x)*v[2]} ${(a.y2-a.y)*v[3]}`);
        if(a.showAnnotations){const overlay=el('g',{transform:`matrix(${1/f.scale} 0 0 ${1/f.scale} ${v[0]-f.x/f.scale} ${v[1]-f.y/f.scale})`,'data-inset-annotations':a.id});render({root:overlay,model:{...model,annotations:model.annotations.filter(item=>item.panelId===panel.id&&item.kind!=='inset')},frames,ui:false,source,namespace,measure,idPrefix:'crop-'+a.id+'-'});crop.append(overlay);}
        for(const[k,vv]of Object.entries({x:l.image.x,y:l.image.y,width:l.image.w,height:l.image.h,overflow:'hidden',preserveAspectRatio:'xMidYMid meet','data-inset-crop':a.id}))crop.setAttribute(k,vv);g.append(crop);
        if(a.text)addText(g,a,b.x+1,b.y+a.fontPt*mm*1.2,a.text.split(/\r?\n/)[0],b.w-2);
        if(l.ruler){const x=b.x+2,y=b.y+b.h-1;g.append(el('line',{x1:x,y1:y,x2:x+l.ruler.length,y2:y,...stroke,'data-inset-scale-mm':l.ruler.mm,'data-inset-scale-length-mm':l.ruler.length}));addText(g,{...a,fontPt:Math.min(8,a.fontPt)},x,y-1,`${l.ruler.mm} mm`);}
        g.append(el('title',{},`Source: ${panel.provenance.description||panel.id}; crop [${[a.x,a.y,a.x2,a.y2].map(v=>Number((v*100).toFixed(2))).join(', ')}]%; ${l.calibrated?'calibrated orthographic slice':'display crop only; no physical scale'}`));
      }else if(implantKinds.includes(a.kind)){
        const d=deviceGeometry(a,f),i=d.i,points=values=>values.map(p=>`${p.x},${p.y}`).join(' ');g.setAttribute('data-implant-schematic','true');
        if(a.kind==='injection'){const r=i.symbolMm/2;
          if(i.siteStyle==='square')g.append(el('rect',{x:p.x-r,y:p.y-r,width:r*2,height:r*2,fill:'none',stroke:a.colour,'stroke-width':a.linePt*mm,'data-injection-marker':'square'}));
          else if(i.siteStyle==='cross')g.append(el('path',{d:`M${p.x-r},${p.y}H${p.x+r}M${p.x},${p.y-r}V${p.y+r}`,...stroke,'data-injection-marker':'cross'}));
          else{g.append(el('circle',{cx:p.x,cy:p.y,r,fill:i.siteStyle==='dot'?a.colour:'none',stroke:a.colour,'stroke-width':a.linePt*mm,'data-injection-marker':i.siteStyle}));if(i.siteStyle==='target')g.append(el('circle',{cx:p.x,cy:p.y,r:Math.max(.25,r*.28),fill:a.colour}));}
          if(i.showLabel&&a.text){const width=Math.max(...a.text.split(/\r?\n/).map(t=>measure(t,a.fontPt*mm))),end={x:q.x+(q.x<p.x?width:0),y:q.y-a.fontPt*mm*.25},dx=end.x-p.x,dy=end.y-p.y,length=Math.hypot(dx,dy),edge=i.siteStyle==='square'?r/Math.max(Math.abs(dx)/length,Math.abs(dy)/length):r,t=length?Math.min(1,edge/length):0;g.append(el('line',{x1:p.x+dx*t,y1:p.y+dy*t,x2:end.x,y2:end.y,...stroke}));}
        }else if(a.kind==='fiber'){
          if(i.showCone){const gradient=idPrefix+'fiber-light-'+a.id.replace(/[^\w-]/g,'_'),defs=el('defs'),end=d.at(d.length+i.coneLengthMm),spread=Math.tan(i.coneAngleDeg*Math.PI/360)*i.coneLengthMm,grad=el('linearGradient',{id:gradient,gradientUnits:'userSpaceOnUse',x1:q.x,y1:q.y,x2:end.x,y2:end.y});grad.append(el('stop',{offset:'0%','stop-color':a.colour,'stop-opacity':i.coneOpacity}),el('stop',{offset:'100%','stop-color':a.colour,'stop-opacity':0}));defs.append(grad);g.append(defs,el('polygon',{points:points([q,d.at(d.length+i.coneLengthMm,-spread),d.at(d.length+i.coneLengthMm,spread)]),fill:`url(#${gradient})`,'data-fiber-light-cone':'illustrative, not simulated fluence'}));}
          g.append(el('polygon',{points:points([d.at(0,-i.shaftMm/2),d.at(d.length,-i.shaftMm/2),d.at(d.length,i.shaftMm/2),d.at(0,i.shaftMm/2)]),fill:a.colour,'fill-opacity':.18,stroke:'#405458','stroke-width':a.linePt*mm,'data-fiber-shaft':'true'}));
          g.append(el('polygon',{points:points([d.at(-2,-i.shaftMm),d.at(.7,-i.shaftMm),d.at(.7,i.shaftMm),d.at(-2,i.shaftMm)]),fill:'#dce4e5',stroke:'#405458','stroke-width':a.linePt*mm}));
          const left=d.at(d.length,-i.shaftMm/2),right=d.at(d.length,i.shaftMm/2);g.append(el('line',{x1:left.x,y1:left.y,x2:right.x,y2:right.y,stroke:a.colour,'stroke-width':Math.max(.4,a.linePt*mm),'data-fiber-tip':'true'}));
        }else{for(const shank of d.shanks){g.append(el('polygon',{points:points(shank.polygon),fill:'#d3d9de',stroke:a.colour,'stroke-width':a.linePt*mm,'data-neuropixels-shank':'true'}));for(let j=0;j<i.contacts;j++){const along=d.length*(1-i.activeFraction)+(j+.5)/i.contacts*d.length*i.activeFraction*.91,site=d.at(along,shank.offset+(j%2?1:-1)*i.shaftMm*.2),r=Math.min(.24,i.shaftMm*.18,d.length*i.activeFraction/i.contacts*.27);g.append(el('rect',{x:site.x-r,y:site.y-r*.6,width:r*2,height:r*1.2,rx:r*.12,fill:'#c99a32','data-neuropixels-contact':'illustrative'}));}}}
        if(i.showLabel&&a.text){if(a.kind!=='injection'){const width=Math.max(...a.text.split(/\r?\n/).map(t=>measure(t,a.fontPt*mm))),left=d.label.x<p.x,endX=d.label.x+(left?width:0),endY=d.label.y-a.fontPt*mm*.25,sign=Math.sign((d.label.x-p.x)*d.n.x+(d.label.y-p.y)*d.n.y)||1,start=d.at(Math.min(1,d.length*.18),sign*(i.shaftMm/2+a.linePt*mm));g.append(el('path',{d:`M${start.x},${start.y}L${endX+(left?1:-1)},${endY}H${endX}`,...stroke,'data-implant-leader':a.id}));}addText(g,a,d.label.x,d.label.y,a.text);}
        g.append(el('title',{},a.kind==='injection'?'Injection location symbol; marker diameter is a figure display parameter, not spread/volume.':a.kind==='fiber'?'Optical fiber schematic; light cone is illustrative, not an optical simulation.':'Neuropixels schematic; shanks/contacts are illustrative, not channel coordinates or manufacturer CAD.'));
      }else if(a.kind==='text')addText(g,a,p.x,p.y,a.text);
      else if(a.kind==='label'){g.append(el('line',{x1:p.x,y1:p.y,x2:q.x,y2:q.y,...stroke}));g.append(el('circle',{cx:p.x,cy:p.y,r:.4,fill:a.colour}));addText(g,a,q.x,q.y,a.text);}
      else if(a.kind==='rect')g.append(el('rect',{x:Math.min(p.x,q.x),y:Math.min(p.y,q.y),width:Math.abs(q.x-p.x),height:Math.abs(q.y-p.y),...stroke}));
      else{g.append(el('line',{x1:p.x,y1:p.y,x2:q.x,y2:q.y,...stroke}));if(a.kind==='arrow'){const angle=Math.atan2(q.y-p.y,q.x-p.x),size=Math.max(1.3,a.linePt*mm*4),c=Math.cos(angle),s=Math.sin(angle);g.append(el('path',{d:`M${q.x-size*c+size*.45*s} ${q.y-size*s-size*.45*c}L${q.x} ${q.y}L${q.x-size*c-size*.45*s} ${q.y-size*s+size*.45*c}`,...stroke}));}}
      if(ui){const b=bounds(a,f,measure),active=selected===a.id;g.append(el('rect',{x:b.x-.6,y:b.y-.6,width:b.w+1.2,height:b.h+1.2,fill:'transparent',stroke:active?'#bd623d':'none','stroke-width':.25,'stroke-dasharray':'.7 .7','data-ui':'annotation-hit','data-annotation-hit':a.id}));
        if(active){const handle=(x,y,name)=>g.append(el('rect',{x:x-.9,y:y-.9,width:1.8,height:1.8,fill:'#bd623d',stroke:'#ffffff','stroke-width':.2,'data-ui':'annotation-handle','data-annotation-handle':name,'data-annotation-hit':a.id}));
          if(a.kind==='inset')handle(a.box.x+a.box.w,a.box.y+a.box.h,'resize');else if(a.kind!=='text'){handle(p.x,p.y,'start');handle(q.x,q.y,'end');}}
      }
      root.append(g);
    }
  }
  scope.AtlasPublicationAnnotations=Object.freeze({clean,frame,map,unmap,insetLayout,bounds,duplicate,kinds,implantKinds,implantOptions,deviceGeometry,mm,render,warnings,labelBounds,arrangeImplantLabels});
})(typeof window==='undefined'?globalThis:window);
