(function(scope){
  'use strict';
  const aliases={sample_id:['sample_id','sample','animal','animal_id','subject','动物','样本'],group:['group','condition','组别'],region:['region','structure_id','acronym','脑区'],hemisphere:['hemisphere','hemi','半球'],value:['value','数值'],metric:['metric','measure','指标'],unit:['unit','单位'],timepoint:['timepoint','time','时间点'],sex:['sex','性别'],batch:['batch','批次'],ap:['ap','ccf_ap','x'],ml:['ml','ccf_ml','y'],dv:['dv','ccf_dv','z'],cell_type:['cell_type','type','细胞类型'],intensity:['intensity','signal','强度'],positive:['positive','阳性'],point_id:['point_id','cell_id','id'],source:['source','from','源'],target:['target','to','目标'],weight:['weight','connection','权重'],track_id:['track_id','track','轨迹'],order:['order','index','顺序']};
  const number=value=>{const text=String(value??'').trim();return text!==''&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)&&Number.isFinite(Number(text))?Number(text):null;};
  const text=value=>String(value??'').trim();
  const regionIndex=data=>{const map=new Map();for(const r of data.regions)for(const key of [r.id,r.structureId,r.name])if(key!==null&&key!==undefined)map.set(String(key).toLowerCase(),r);return map;};
  function readCSV(csv,parser){const result=parser.parse(csv.replace(/^\uFEFF/,''),{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim()});if(result.errors.length)throw new Error('CSV 列数或引号不一致：'+result.errors[0].message);if(!result.meta.fields?.length)throw new Error('CSV 没有表头');return result;}
  function suggest(fields){return Object.fromEntries(Object.entries(aliases).map(([key,list])=>[key,fields.find(field=>list.includes(field.toLowerCase()))||'']));}
  function parse(csv,kind,data,parser,mapping={},options={}){
    const parsed=readCSV(csv,parser),map={...suggest(parsed.meta.fields),...mapping},regions=regionIndex(data),issues=[],records=[],seen=new Set(),samples=new Map();
    const required=kind==='table'?['sample_id','region','value']:kind==='points'?['sample_id','ap','ml','dv']:kind==='tracks'?['track_id','order','ap','ml','dv']:['source','target','weight'];
    for(const key of required)if(!map[key]||!parsed.meta.fields.includes(map[key]))throw new Error('请映射必需列：'+key);
    const issue=(row,severity,code,message)=>issues.push({row,severity,code,message});
    parsed.data.forEach((row,index)=>{
      const line=index+2,get=key=>map[key]?text(row[map[key]]):'',item={row:line};let invalid=false;
      const fail=(code,message)=>{issue(line,'error',code,message);invalid=true;};
      if(kind==='edges'){
        const source=regions.get(get('source').toLowerCase()),target=regions.get(get('target').toLowerCase()),weight=number(get('weight'));
        if(!source||!target)fail('unknown_region','未知连接端点：'+get('source')+' → '+get('target'));
        if(weight===null)fail('invalid_value','连接权重不是有限数值');
        if(!invalid){const key=source.id+'|'+target.id;if(seen.has(key))fail('duplicate','重复连接，必须先明确合并方法');else{seen.add(key);records.push({source:source.id,target:target.id,weight});}}return;
      }
      item.sample_id=get('sample_id')||(kind==='tracks'?'track-sample':'');item.group=get('group')||'未分组';
      for(const key of ['timepoint','sex','batch'])item[key]=get(key);
      if(!item.sample_id)fail('missing_sample','缺少独立动物/样本编号');
      const sampleKey=JSON.stringify([item.sample_id,item.timepoint]),sampleMeta=JSON.stringify([item.group,item.sex,item.batch]);
      if(samples.has(sampleKey)&&samples.get(sampleKey)!==sampleMeta)fail('sample_conflict','同一动物和时间点的组别/性别/批次不一致');else samples.set(sampleKey,sampleMeta);
      if(kind==='table'){
        const region=regions.get(get('region').toLowerCase());if(!region)fail('unknown_region','未知脑区：'+get('region'));else item.region=region.id;
        item.value=number(get('value'));if(item.value===null)fail('missing_or_invalid_value','数值为空或不是有限数字（缺失值不视为0）');
        item.hemisphere=scope.AtlasProfessional.parseHemisphere(get('hemisphere'),'B');if(!item.hemisphere)fail('hemisphere','半球应为 B/L/R');
        item.metric=get('metric')||'value';item.unit=get('unit');
        const key=JSON.stringify([item.sample_id,item.timepoint,item.region,item.hemisphere,item.metric]);
        if(seen.has(key))fail('duplicate','同一样本/时间/脑区/半球/指标有重复行，未静默覆盖');else seen.add(key);
      }else{
        const factor=options.unit==='um'?.001:1;
        for(const axis of ['ap','ml','dv']){const value=number(get(axis));if(value===null)fail('coordinate','坐标缺失或无效：'+axis);item[axis]=value===null?null:value*factor;}
        if(!invalid&&(item.ap<0||item.ap>13.2||item.dv<0||item.dv>8||item.ml< -5.7||item.ml>5.7))issue(line,'warning','outside_volume','坐标超出当前Allen体积，保留但不参与脑区定量');
        if(kind==='points'){
          item.point_id=get('point_id')||String(index+1);item.cell_type=get('cell_type')||'未分类';
          item.intensity=get('intensity')===''?null:number(get('intensity'));if(get('intensity')!==''&&item.intensity===null)fail('intensity','强度不是有限数值');
          const positive=get('positive').toLowerCase();item.positive=['1','true','yes','阳性'].includes(positive)?true:['0','false','no','阴性'].includes(positive)?false:null;
          if(positive&&item.positive===null)fail('positive','positive 应为0/1或true/false');
          const key=JSON.stringify([item.sample_id,item.timepoint,item.point_id]);if(seen.has(key))fail('duplicate','重复点编号');else seen.add(key);
        }else{item.track_id=get('track_id');item.order=number(get('order'));if(!item.track_id||item.order===null)fail('track','轨迹编号或顺序无效');const key=item.track_id+'|'+item.order;if(seen.has(key))fail('duplicate','轨迹序号重复');else seen.add(key);}
      }
      if(!invalid)records.push(item);
    });
    return{kind,fields:parsed.meta.fields,mapping:map,rows:parsed.data.length,records,issues,errors:issues.filter(x=>x.severity==='error').length,warnings:issues.filter(x=>x.severity==='warning').length};
  }
  function matrix(csv,data,parser,directed=true){
    const result=parser.parse(csv,{skipEmptyLines:'greedy'});if(result.errors.length)throw new Error('矩阵 CSV 格式错误');
    const rows=result.data,regions=regionIndex(data),ids=rows[0].slice(1).map(id=>regions.get(text(id).toLowerCase())?.id);
    if(ids.some(id=>!id)||new Set(ids).size!==ids.length||rows.length!==ids.length+1)throw new Error('矩阵必须是已知脑区组成的方阵，表头和首列为脑区');
    const values=rows.slice(1).map((row,i)=>{if(regions.get(text(row[0]).toLowerCase())?.id!==ids[i]||row.length!==ids.length+1)throw new Error('矩阵行列顺序或大小不一致');return row.slice(1).map(v=>{const n=number(v);if(n===null)throw new Error('矩阵含缺失或非法权重');return n;});});
    const edges=[];for(let i=0;i<ids.length;i++)for(let j=0;j<ids.length;j++){
      if(!directed&&Math.abs(values[i][j]-values[j][i])>1e-9)throw new Error('无向矩阵必须对称');
      if(i!==j&&values[i][j]!==0&&(directed||i<j))edges.push({source:ids[i],target:ids[j],weight:values[i][j]});
    }return edges;
  }
  function lookup(reference,labels,point){
    const indices=[Math.round((point.ap-.05)/.1),Math.round((point.dv-.05)/.1),Math.round((point.ml-reference.mlOffset)/.1)],dim=reference.dim;
    if(indices.some((v,i)=>v<0||v>=dim[i]))return{region:null,status:'outside',hemisphere:point.ml<0?'L':'R',boundary:false};
    const at=([i,j,k])=>labels[i+dim[0]*(j+dim[1]*k)],code=at(indices);
    let boundary=false;for(let axis=0;axis<3;axis++)for(const delta of [-1,1]){const next=[...indices];next[axis]+=delta;if(next[axis]>=0&&next[axis]<dim[axis]&&at(next)!==code)boundary=true;}
    return{region:code?reference.regions[code-1]:null,status:code?'assigned':'unlabelled',hemisphere:point.ml<0?'L':'R',boundary};
  }
  const mean=values=>values.reduce((s,v)=>s+v,0)/values.length;
  const variance=values=>{const m=mean(values);return values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1);};
  function quantify(points,volumes,{complete=false,cellType=''}={}){
    const samples=new Map(),bins=new Map();
    for(const point of points){
      const sampleKey=JSON.stringify([point.sample_id,point.timepoint]);if(!samples.has(sampleKey))samples.set(sampleKey,point);
      if(!point.region||point.status!=='assigned'||(cellType&&point.cell_type!==cellType))continue;
      for(const hemisphere of ['B',point.hemisphere]){const key=JSON.stringify([sampleKey,point.region,hemisphere]);const bin=bins.get(key)||{sample:point,region:point.region,hemisphere,points:[]};bin.points.push(point);bins.set(key,bin);}
    }
    if(complete)for(const [key,sample]of samples)for(const region of volumes)for(const hemisphere of ['B','L','R']){const id=JSON.stringify([key,region.id,hemisphere]);if(!bins.has(id))bins.set(id,{sample,region:region.id,hemisphere,points:[]});}
    const volumeMap=new Map(volumes.map(row=>[row.id,row])),rows=[];
    for(const bin of bins.values()){
      const {sample,region,hemisphere,points:list}=bin,volume=volumeMap.get(region)?.[hemisphere];
      const add=(metric,value,unit,denominator)=>{if(Number.isFinite(value))rows.push({sample_id:sample.sample_id,group:sample.group,timepoint:sample.timepoint||'',sex:sample.sex||'',batch:sample.batch||'',region,hemisphere,metric,value,unit,denominator,reference_volume_mm3:volume??null});};
      add('cell_count',list.length,'cells',list.length);
      if(volume>0)add('atlas_density',list.length/volume,'cells/reference mm³',volume);
      const positive=list.filter(p=>typeof p.positive==='boolean');if(positive.length)add('positive_fraction',positive.filter(p=>p.positive).length/positive.length,'fraction',positive.length);
      const intensity=list.map(p=>p.intensity).filter(Number.isFinite);if(intensity.length)add('mean_intensity',mean(intensity),'input units',intensity.length);
    }return rows;
  }
  function aggregate(rows,{metric,group='',sample='',timepoint='',hemisphere='B'}={}){
    const bins=new Map();for(const row of rows){if(row.metric!==metric||row.hemisphere!==hemisphere||(group&&row.group!==group)||(sample&&row.sample_id!==sample)||(timepoint&&row.timepoint!==timepoint))continue;const list=bins.get(row.region)||[];list.push(row);bins.set(row.region,list);}
    const units=new Set([...bins.values()].flat().map(r=>r.unit));if(units.size>1)throw new Error('当前指标单位不一致，不能合并');
    return[...bins].map(([region,list])=>{const keys=list.map(r=>r.sample_id);if(new Set(keys).size!==keys.length)throw new Error('同一动物存在多个时间点，请选择单个时间点后汇总');return{region,value:mean(list.map(r=>r.value)),n:list.length,unit:list[0].unit};});
  }
  // Numerical Recipes continued fraction for the regularized incomplete beta.
  function logGamma(z){const p=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);z--;let x=.99999999999980993;for(let i=0;i<p.length;i++)x+=p[i]/(z+i+1);const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);}
  function betaFraction(a,b,x){let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<1e-30)d=1e-30;d=1/d;let h=d;for(let m=1;m<=300;m++){let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;h*=d*c;aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));d=1+aa*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+aa/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<3e-14)break;}return h;}
  function beta(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const value=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));return x<(a+1)/(a+b+2)?value*betaFraction(a,b,x)/a:1-value*betaFraction(b,a,1-x)/b;}
  const tP=(t,df)=>Math.min(1,Math.max(0,beta(df/(df+t*t),df/2,.5)));
  const fP=(f,df1,df2)=>f<=0?1:Math.min(1,Math.max(0,beta(df2/(df2+df1*f),df2/2,df1/2)));
  function tCritical(df){let low=0,high=100;for(let i=0;i<80;i++){const mid=(low+high)/2;if(tP(mid,df)>.05)low=mid;else high=mid;}return(low+high)/2;}
  function welch(a,b){
    const result={nA:a.length,nB:b.length,meanA:a.length?mean(a):null,meanB:b.length?mean(b):null,p:null,q:null,ciLow:null,ciHigh:null,t:null,df:null,hedges_g:null,status:'n<2'};
    result.value=result.meanA!==null&&result.meanB!==null?result.meanB-result.meanA:null;
    if(a.length<2||b.length<2)return result;
    const va=variance(a),vb=variance(b),sa=va/a.length,sb=vb/b.length,se=Math.sqrt(sa+sb);if(se===0){result.status='zero variance';return result;}
    const df=(sa+sb)**2/(sa*sa/(a.length-1)+sb*sb/(b.length-1)),t=result.value/se,critical=tCritical(df);
    Object.assign(result,{t,df,p:tP(t,df),ciLow:result.value-critical*se,ciHigh:result.value+critical*se,status:'ok'});
    const pooled=((a.length-1)*va+(b.length-1)*vb)/(a.length+b.length-2),correction=1-3/(4*(a.length+b.length)-9);if(pooled>0)result.hedges_g=correction*result.value/Math.sqrt(pooled);return result;
  }
  function bh(rows){const sorted=rows.filter(r=>Number.isFinite(r.p)).sort((a,b)=>a.p-b.p);let minimum=1;for(let i=sorted.length-1;i>=0;i--){minimum=Math.min(minimum,sorted[i].p*sorted.length/(i+1));sorted[i].q=minimum;}return rows;}
  function compare(rows,{metric,groupA,groupB,timepoint='',hemisphere='B'}){
    if(!groupA||!groupB||groupA===groupB)throw new Error('请选择两个不同组别');
    const filtered=rows.filter(r=>r.metric===metric&&r.hemisphere===hemisphere&&(!timepoint||r.timepoint===timepoint)&&[groupA,groupB].includes(r.group));
    if(new Set(filtered.map(r=>r.unit)).size>1)throw new Error('指标单位不一致');
    const samples=new Map(),bins=new Map();for(const row of filtered){const key=row.sample_id+'|'+row.region;if(samples.has(key))throw new Error('同一动物存在重复/多时间点；当前分析仅支持独立动物，请先选择时间点');samples.set(key,row.group);const bin=bins.get(row.region)||{A:[],B:[]};bin[row.group===groupA?'A':'B'].push(row);bins.set(row.region,bin);}
    return bh([...bins].map(([region,bin])=>({region,metric,unit:filtered[0]?.unit||'',groupA,groupB,hemisphere,timepoint,...welch(bin.A.map(r=>r.value),bin.B.map(r=>r.value)),animalsA:bin.A.map(r=>({sample_id:r.sample_id,value:r.value})),animalsB:bin.B.map(r=>({sample_id:r.sample_id,value:r.value}))})));
  }
  const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.ap-points[i].ap,p.ml-points[i].ml,p.dv-points[i].dv),0);
  function clipSegment(a,b,axis,position,thickness){const delta=b[axis]-a[axis],low=position-thickness/2,high=position+thickness/2;if(Math.abs(delta)<1e-12)return a[axis]>=low&&a[axis]<=high?[a,b]:null;let t0=(low-a[axis])/delta,t1=(high-a[axis])/delta;if(t0>t1)[t0,t1]=[t1,t0];t0=Math.max(0,t0);t1=Math.min(1,t1);if(t1<t0)return null;return[t0,t1].map(t=>Object.fromEntries(['ap','ml','dv'].map(key=>[key,a[key]+(b[key]-a[key])*t])));}
  const area=polygon=>Math.abs(polygon.reduce((s,p,i)=>{const n=polygon[(i+1)%polygon.length];return s+p[0]*n[1]-n[0]*p[1];},0))/2;
  function inside(point,polygon){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
  function clean(input){
    const base={version:1,records:[],points:[],tracks:[],edges:[],rois:[],sources:[],stats:[],quantRows:[],imageRows:[],customStructures:[],settings:{metric:'value',group:'',sample:'',timepoint:'',hemisphere:'B',pointSize:3,pointSlab:.1,showPoints:true,showEdges:true,edgeThreshold:0,edgeLimit:300,directed:true,completeCoverage:false,imageMap:'gray',imageOpacity:50}};
    if(!input||input.version!==1)return base;
    for(const key of ['records','points','tracks','edges','rois','sources','stats','quantRows','imageRows','customStructures'])if(Array.isArray(input[key]))base[key]=structuredClone(input[key]);
    for(const key of ['assets','sliceImage','customValues','customStatistics','quantSettings'])if(input[key]&&typeof input[key]==='object')base[key]=structuredClone(input[key]);
    if(input.connectome&&scope.AtlasConnectomeCore)base.connectome=scope.AtlasConnectomeCore.clean(input.connectome);
    if(input.implants&&scope.AtlasImplants)base.implants=scope.AtlasImplants.clean(input.implants);
    if(input.merfish&&scope.AtlasMerfishCore)base.merfish=scope.AtlasMerfishCore.clean(input.merfish);
    if(input.aav&&scope.AtlasAavCore)base.aav=scope.AtlasAavCore.clean(input.aav);
    if(input.settings&&typeof input.settings==='object')base.settings={...base.settings,...input.settings};return base;
  }
  scope.AtlasResearchCore=Object.freeze({aliases,number,regionIndex,readCSV,suggest,parse,matrix,lookup,quantify,aggregate,mean,variance,welch,bh,compare,length,clipSegment,area,inside,clean,tP,fP});
})(typeof window==='undefined'?globalThis:window);
