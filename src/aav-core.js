(function(scope){
  'use strict';
  const number=(v,d,a,b)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):d;
  function settings(s={}){return{enabled:s.enabled===true,url:typeof s.url==='string'?s.url:'http://127.0.0.1:8765',experiment:typeof s.experiment==='string'?s.experiment:'',resolution:Math.round(number(s.resolution,50,10,1000)),threshold:number(s.threshold,.001,0,1),slab:number(s.slab,.1,.01,5),limit:Math.round(number(s.limit,200000,1,500000)),excludeInjection:s.excludeInjection===true,opacity:number(s.opacity,.85,0,1),pointSize:number(s.pointSize,.08,.01,.5),map:Object.hasOwn(scope.AtlasValues.maps,s.map)?s.map:'inferno',scale:s.scale==='linear'?'linear':'log',autoRange:s.autoRange!==false,minimum:number(s.minimum,0,0,1),maximum:number(s.maximum,1,0,1),brain:['shell','none'].includes(s.brain)?s.brain:'current',legend:s.legend!==false};}
  const baseSettings=settings;settings=(s={})=>({...baseSettings(s),...scope.AtlasAavRaster?.settings(s)});
  function clean(m){const s=settings(m?.settings);if(scope.AtlasAavRaster&&m?.settings&&!Object.hasOwn(m.settings,'renderRaster')){s.renderRaster=false;s.background='atlas';}return{version:1,settings:s,data:m?.data?.format==='mouse-atlas-aav-overlay'?m.data:null,omitted:m?.omitted===true};}
  function light(m){const v=clean(m);return{...v,data:null,omitted:!!v.data||v.omitted};}
  function request(s,view){s=settings(s);return{experiment:s.experiment,resolution:s.resolution,threshold:s.threshold,slab:s.slab,limit:s.limit,excludeInjection:s.excludeInjection,volume:!!view.volume,hemisphere:view.hemisphere||'B',planes:view.volume?[]:view.planes.map(({orientation,position})=>({orientation,position})),...scope.AtlasAavRaster?.request(s,view)};}
  function range(m){const s=m.settings,r=s.autoRange?m.data?.range:[s.minimum,s.maximum];return r?.every(Number.isFinite)&&r[1]>r[0]?r:[0,1];}
  function colour(value,m){const[a,b]=range(m);let t=Math.max(0,Math.min(1,(value-a)/(b-a)));if(m.settings.scale==='log')t=Math.log1p(999*t)/Math.log(1000);return scope.AtlasValues.valueColour(t,0,1,m.settings.map);}
  function ticks(m){const[a,b]=range(m);return[0,.5,1].map(t=>a+(b-a)*(m.settings.scale==='log'?Math.expm1(t*Math.log(1000))/999:t));}
  function clipVolume(data,reference,labels){
    const dim=reference.dim,spacing=reference.spacing||.1,centre=reference.voxelCentreAPDV??.05;
    if(!labels||labels.length!==dim[0]*dim[1]*dim[2])throw new Error('3D脑模板掩膜尺寸不匹配');
    const source=data.voxels||[],voxels=source.filter(v=>{
      if(!v.slice(0,3).every(Number.isFinite))return false;
      // Use half-open template cells; deterministic midpoint ties avoid FP-dependent sides.
      const cell=(value,first)=>Math.floor((value-first+spacing/2)/spacing+1e-9),i=cell(v[0],centre),j=cell(v[2],centre),k=cell(v[1],reference.mlOffset);
      return i>=0&&j>=0&&k>=0&&i<dim[0]&&j<dim[1]&&k<dim[2]&&labels[i+dim[0]*(j+dim[1]*k)]>0;
    });
    return{voxels,summary:{enabled:true,source:'Allen CCF annotation; same sampled volume as 3D shell',resolution_mm:spacing,method:'nearest template voxel; positive brain label; display-only voxel-centre filter',fingerprint:reference.fingerprint,inputPoints:source.length,visiblePoints:voxels.length,outsideHidden:source.length-voxels.length,rawMatched:data.matched}};
  }
  function summary(m){m=clean(m);return{enabled:m.settings.enabled,loaded:!!m.data,settings:m.settings,experiment:m.data?.experiment,range:range(m),matched:m.data?.matched||0,displayed:m.data?.displayed||0,sampling:m.data?.sampling,query:m.data?.query,qc:m.data?.qc,contract:m.data?.contract,provenance:m.data?.provenance,displaySemantics:m.data?.display_semantics,...(scope.AtlasAavRaster?{display:scope.AtlasAavRaster.summary(m)}:{})};}
  scope.AtlasAavCore=Object.freeze({settings,clean,light,request,range,colour,ticks,summary,clipVolume});
})(typeof window==='undefined'?globalThis:window);
