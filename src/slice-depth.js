(function(scope){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const defaults=()=>({sliceDepth:false,sliceThickness:6,sliceShadow:20,slicePitch:20,sliceYaw:-18,sliceRotate:false});
  const clamp=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
  function clean(input={}){
    const result=defaults();
    for(const key of ['sliceDepth','sliceRotate'])if(typeof input[key]==='boolean')result[key]=input[key];
    for(const [key,min,max]of [['sliceThickness',0,24],['sliceShadow',0,45],['slicePitch',-55,55],['sliceYaw',-55,55]])result[key]=Math.round(clamp(input[key],min,max,result[key]));
    return result;
  }
  function projection({width,height,scale,x,y,mode,state}){
    const settings=clean(state),enabled=settings.sliceDepth&&mode!=='3d',single=enabled&&mode==='single';
    const pitch=single?settings.slicePitch*Math.PI/180:0,yaw=single?settings.sliceYaw*Math.PI/180:0;
    const a=Math.cos(yaw),b=0,c=Math.sin(yaw)*Math.sin(pitch),d=Math.cos(pitch);
    const depth=enabled?settings.sliceThickness*(single?1:.6)*Math.min(1,Math.min(width,height)*scale/180):0;
    const side=single?[-Math.sin(yaw)*Math.cos(pitch)*depth,Math.sin(pitch)*depth]:[depth*.48,depth*.8];
    const corners=[[0,0],[width,0],[0,height],[width,height]].map(([u,v])=>[a*u+c*v,b*u+d*v]);
    const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0]));
    const minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));
    const padding=enabled?2+(settings.sliceShadow>0?5:0):0;
    const fit=enabled?(single?Math.max(.05,Math.min(1,(width*scale-2*padding-Math.abs(side[0]))/((maxX-minX)*scale),(height*scale-2*padding-Math.abs(side[1]))/((maxY-minY)*scale))):.94):1;
    const s=scale*fit,tx=x+width*scale/2-(minX+maxX)*s/2-side[0]/2,ty=y+height*scale/2-(minY+maxY)*s/2-side[1]/2;
    const matrix=[a*s,b*s,c*s,d*s,tx,ty];
    const map=([u,v])=>[matrix[0]*u+matrix[2]*v+matrix[4],matrix[1]*u+matrix[3]*v+matrix[5]];
    const inverse=([u,v])=>{const px=u-tx,py=v-ty,det=matrix[0]*matrix[3]-matrix[1]*matrix[2];return[(matrix[3]*px-matrix[2]*py)/det,(-matrix[1]*px+matrix[0]*py)/det];};
    return{enabled,single,tilted:single&&(Math.abs(pitch)>1e-8||Math.abs(yaw)>1e-8),matrix,map,inverse,side,scale:s,fit,settings};
  }
  const matrixText=(matrix,dx=0,dy=0)=>`matrix(${matrix.slice(0,4).join(' ')} ${matrix[4]+dx} ${matrix[5]+dy})`;
  function el(name,attributes={}){const node=document.createElementNS(NS,name);for(const[key,value]of Object.entries(attributes))node.setAttribute(key,value);return node;}
  function decorate(panel,{projection:p,payload,index,orientation,hemisphere,selectionOnly,box}){
    if(!p.enabled||!payload.regions.length)return;
    const sourceId=`slice-silhouette-${index}`,maskId=`slice-outside-${index}`,filterId=`slice-shadow-${index}`;
    const defs=el('defs'),source=el('g',{id:sourceId,'fill-rule':'evenodd'});
    const clip=hemisphere!=='B'&&orientation!=='sagittal'?{'clip-path':`url(#hemi-${index}-${hemisphere})`}:{};
    if(payload.outline&&!selectionOnly)source.append(el('path',{d:payload.outline,...clip}));
    else for(const[,path,,,hemi]of payload.regions)source.append(el('path',{d:path,...(orientation!=='sagittal'?{'clip-path':`url(#hemi-${index}-${hemi})`}:{})}));
    defs.append(source);
    const bounds={x:box.x-16,y:box.y-16,width:box.width+32,height:box.height+32};
    const mask=el('mask',{id:maskId,maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',...bounds});
    mask.append(el('rect',{...bounds,fill:'#ffffff'}));
    mask.append(el('use',{href:'#'+sourceId,transform:matrixText(p.matrix),fill:'#000000'}));defs.append(mask);
    const filter=el('filter',{id:filterId,filterUnits:'userSpaceOnUse',...bounds,'color-interpolation-filters':'sRGB'});
    filter.append(el('feGaussianBlur',{stdDeviation:2.2}));defs.append(filter);panel.append(defs);
    const group=el('g',{'data-slice-depth':p.single?'slab':'relief','pointer-events':'none','mask':`url(#${maskId})`,'aria-hidden':'true'});
    if(p.settings.sliceShadow>0)group.append(el('use',{href:'#'+sourceId,transform:matrixText(p.matrix,p.side[0]+2,p.side[1]+3),fill:'#1b3029',opacity:p.settings.sliceShadow/100,filter:`url(#${filterId})`,'data-slice-shadow':'true'}));
    const steps=Math.ceil(Math.hypot(...p.side)*2);
    for(let step=steps;step>0;step--){
      const t=step/steps,colour=[166,183,173].map(channel=>Math.round(channel-35*t)).map(channel=>channel.toString(16).padStart(2,'0')).join('');
      group.append(el('use',{href:'#'+sourceId,transform:matrixText(p.matrix,p.side[0]*t,p.side[1]*t),fill:'#'+colour,'data-slice-side':'true'}));
    }
    panel.append(group);
  }
  function bindRotation(host,{enabled,getAngles,onInput,onCommit}){
    let drag=null,frame=null,pending=null,suppressClick=false;
    const flush=()=>{frame=null;if(pending){onInput(pending);pending=null;}};
    host.addEventListener('pointerdown',event=>{
      if(event.button!==0||!enabled()||!event.target.closest('[data-panel]')||!document.querySelector('#researchFinishROI').hidden)return;
      const angles=getAngles();drag={x:event.clientX,y:event.clientY,pitch:angles.pitch,yaw:angles.yaw,moved:false};host.setPointerCapture(event.pointerId);event.preventDefault();
    });
    host.addEventListener('pointermove',event=>{
      if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;
      if(!drag.moved)return;
      pending={pitch:Math.round(clamp(drag.pitch+dy*.3,-55,55,20)),yaw:Math.round(clamp(drag.yaw+dx*.3,-55,55,-18))};
      if(!frame)frame=requestAnimationFrame(flush);
    });
    const end=()=>{if(!drag)return;const moved=drag.moved;drag=null;if(frame){cancelAnimationFrame(frame);frame=null;}flush();if(moved){suppressClick=true;onCommit();}};
    host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);
    host.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
  }
  scope.AtlasSliceDepth=Object.freeze({defaults,clean,projection,matrixText,decorate,bindRotation});
})(window);
