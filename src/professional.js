(function(scope){
  'use strict';
  const hemispheres=['B','L','R'];
  const key=(id,hemisphere='B')=>hemisphere==='B'?String(id):`${id}|${hemisphere}`;
  function cleanAssignments(input,ids){return scope.AtlasValues.cleanMap(input,ids.flatMap(id=>hemispheres.map(hemi=>key(id,hemi))));}
  function resolve(region,hemisphere,state){
    const candidates=[];
    function add(target,id,map){
      for(const hemi of hemisphere==='B'?['B']:[hemisphere,'B']){
        const identifier=key(id,hemi);
        if(Object.hasOwn(map,identifier))candidates.push({value:map[identifier],target,id,hemisphere:hemi,statistics:state.statistics?.[`${target}:${identifier}`]||{}});
      }
    }
    add('region',region.id,state.values);
    for(const id of [region.structureId,...[...(region.ancestors||[])].reverse()].filter(id=>id!==null&&id!==undefined))add('tree',id,state.structureValues||{});
    add('family',region.family,state.familyValues);
    return candidates[0]||{value:null,statistics:{},target:null};
  }
  function range(data,state){
    let result;
    if(!state.autoRange)result=[state.valueMin,state.valueMax];
    else{
      const sides=state.hemisphere==='B'?['L','R']:[state.hemisphere];
      const values=data.regions.flatMap(region=>sides.map(hemi=>resolve(region,hemi,state).value)).filter(Number.isFinite);
      if(!values.length)result=[0,1];
      else{let low=Math.min(...values),high=Math.max(...values);if(low===high){const span=Math.max(Math.abs(low)*.1,.5);low-=span;high+=span;}result=[low,high];}
    }
    if(state.symmetricRange){const maximum=Math.max(Math.abs(result[0]),Math.abs(result[1]))||1;return[-maximum,maximum];}
    return result;
  }
  function passes(record,state){
    if(!Number.isFinite(record.value))return false;
    if(state.statFilter==='value')return Math.abs(record.value)>=state.absoluteThreshold;
    if(state.statFilter==='p'||state.statFilter==='q'){
      const value=record.statistics[state.statFilter];return Number.isFinite(value)&&value<=state.statThreshold;
    }
    return true;
  }
  function pointFromPlane(orientation,x,y,position,voxelMm=.01){
    if(orientation==='coronal')return{ap:position,ml:(x-.5)*voxelMm-5.695,dv:(y-.5)*voxelMm};
    if(orientation==='sagittal')return{ap:(1319.5-x)*voxelMm,ml:position,dv:(y-.5)*voxelMm};
    return{ap:(y-.5)*voxelMm,ml:(x-.5)*voxelMm-5.695,dv:position};
  }
  function pointToPlane(orientation,point,voxelMm=.01){
    if(orientation==='coronal')return[(point.ml+5.695)/voxelMm+.5,point.dv/voxelMm+.5];
    if(orientation==='sagittal')return[1319.5-point.ap/voxelMm,point.dv/voxelMm+.5];
    return[(point.ml+5.695)/voxelMm+.5,point.ap/voxelMm+.5];
  }
  function parseHemisphere(raw,fallback='B'){
    if(raw===undefined||raw===null||String(raw).trim()==='')return fallback;
    const value=String(raw).trim().toLowerCase();
    if(['b','both','bilateral','双侧'].includes(value))return'B';
    if(['l','left','左','左侧'].includes(value))return'L';
    if(['r','right','右','右侧'].includes(value))return'R';return null;
  }
  function parseCSV(text,target,data,parser,fallback='B'){
    const parsed=parser.parse(text.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy',transformHeader:header=>header.trim().toLowerCase()});
    if(parsed.errors.length)throw new Error('CSV 列数或引号格式有误');
    const fields=parsed.meta.fields||[];
    if(target==='family'&&fields.some(field=>['region','structure_id','acronym','分区','脑区'].includes(field)))throw new Error('这是脑区文件，请切换为脑区结构或层级节点');
    const header=(target==='family'?['family','group','分组']:target==='tree'?['structure_id','region','acronym','分区','脑区']:['region','acronym','structure_id','structure','label','分区','脑区']).find(field=>fields.includes(field));
    const valueHeader=['value','score','statistic','数值','值'].find(field=>fields.includes(field));
    const hemisphereHeader=['hemisphere','hemi','半球'].find(field=>fields.includes(field));
    if(!header||!valueHeader)throw new Error('CSV 需要 region（或 structure_id / family）和 value 列');
    const available=new Set(data.regions.flatMap(region=>[region.structureId,...region.ancestors]));
    const entries=target==='family'?[...new Set(data.regions.map(region=>region.family))].map(id=>({id,name:id})):target==='tree'?data.ontology.filter(node=>available.has(node.id)).map(node=>({id:node.id,acronym:node.acronym,name:node.name})):data.regions;
    const canonical=new Map();
    for(const entry of entries)for(const alias of [entry.id,entry.acronym,entry.structureId,entry.name])if(alias!==null&&alias!==undefined)canonical.set(String(alias).toLowerCase(),String(entry.id));
    const patch={},statistics={},unknown=[],invalid=[];let duplicates=0;
    const numeric=raw=>{
      const value=String(raw??'').trim();
      if(value===''||/^(na|nan|null)$/i.test(value))return null;
      return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)&&Number.isFinite(Number(value))?Number(value):NaN;
    };
    parsed.data.forEach((row,index)=>{
      const raw=String(row[header]??'').trim(),id=canonical.get(raw.toLowerCase());
      if(!id){unknown.push({row:index+2,id:raw});return;}
      const hemisphere=parseHemisphere(row[hemisphereHeader],fallback),value=numeric(row[valueHeader]);
      const stats={};let problem=!hemisphere||Number.isNaN(value);
      for(const field of ['p','q','n'])if(fields.includes(field)){
        const number=numeric(row[field]);
        if(Number.isNaN(number)||(number!==null&&(field==='n'?(number<1||!Number.isInteger(number)):(number<0||number>1))))problem=true;
        if(number!==null)stats[field]=number;
      }
      if(problem){invalid.push({row:index+2,id});return;}
      const identifier=key(id,hemisphere);if(Object.hasOwn(patch,identifier))duplicates++;
      patch[identifier]=value;statistics[`${target}:${identifier}`]=stats;
    });
    return{patch,statistics,unknown,invalid,duplicates,rows:parsed.data.length};
  }
  function project(data,state,history=[]){return{format:'mouse-atlas-project',version:1,appVersion:'2.0.0',savedAt:new Date().toISOString(),atlas:{id:data.atlasId,fingerprint:data.fingerprint,source:data.source,coordinates:data.coordinates},state:structuredClone(state),imports:structuredClone(history)};}
  function readProject(input,data){
    if(input?.format!=='mouse-atlas-project'||![1,2].includes(input.version))throw new Error('不支持的项目格式或版本');
    if(input.atlas?.id!==data.atlasId||input.atlas?.fingerprint!==data.fingerprint)throw new Error('项目图谱版本与当前 HTML 不一致，请使用保存项目时的配套 HTML');
    if(!input.state||typeof input.state!=='object'||!Array.isArray(input.imports))throw new Error('项目缺少数据或设置');
    if(input.version===2&&input.research?.version!==1)throw new Error('研究项目缺少有效research数据，请使用配套新版HTML');
    return{state:input.state,history:input.imports};
  }
  scope.AtlasProfessional=Object.freeze({key,hemispheres,cleanAssignments,resolve,range,passes,pointFromPlane,pointToPlane,parseCSV,parseHemisphere,project,readProject});
})(typeof window==='undefined'?globalThis:window);
