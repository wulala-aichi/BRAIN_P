import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';
const ctx={window:{},structuredClone,Blob,Response,DecompressionStream,TextEncoder,Uint8Array,DataView,atob,btoa,console,setTimeout};
for(const file of ['src/research-core.js','src/research-volume.js','src/nifti-stats-core.js'])vm.runInNewContext(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'),ctx);
const C=ctx.window.AtlasNiftiStatsCore,V=ctx.window.AtlasResearchVolume,R=ctx.window.AtlasResearchCore,near=(a,b,t=1e-7)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
near(C.critical({type:'t',thresholdMode:'p',alpha:.05,df1:20}).cutoff,2.0859634472658364);
near(C.critical({type:'z',thresholdMode:'p',alpha:.001}).cutoff,3.2905267314918945,3e-7);
near(C.critical({type:'f',thresholdMode:'p',alpha:.05,df1:2,df2:20}).cutoff,3.492828476735632,2e-7);
near(R.fP(1,2,20),(20/22)**10,1e-10);
assert.throws(()=>C.critical({type:'z',thresholdMode:'p',tail:'one',sign:'both'}),/单尾/);
assert.throws(()=>C.critical({type:'t',thresholdMode:'p',df1:Infinity}),/自由度/);
assert.throws(()=>C.critical({type:'value',thresholdMode:'p'}),/t\/Z\/F/);
assert.throws(()=>C.critical({threshold:-1}),/非负/);
assert.throws(()=>C.critical({type:'p',alpha:0}),/0和1/);
for(const[type,pass,fail]of [['p',.01,.06],['q',.01,.06],['p_corr',.01,.06],['one_minus_p',.99,.90],['neg_log10_p',2,1]]){const c=C.clean({type,alpha:.05,ignoreZero:false}),cut=C.critical(c);assert.equal(C.passing(pass,c,cut),1);assert.equal(C.passing(fail,c,cut),0);assert.equal(C.passing(NaN,c,cut),0);if(type!=='neg_log10_p')assert.equal(C.passing(1.2,c,cut),0);}
assert.equal(C.passing(0,C.clean({type:'p',ignoreZero:false}),C.critical({type:'p'})),1);
assert.equal(C.infer({intent:{code:24}}),'log10_p');assert.equal(C.infer({intent:{code:23}}),'ln_p');
for(const [type,value]of [['log10_p',-2],['ln_p',Math.log(.01)]]){const c=C.clean({type,alpha:.05});assert.equal(C.passing(value,c,C.critical(c)),1);assert.equal(C.passing(.1,c,C.critical(c)),0);}
assert.equal(C.neighbors(6).length,6);assert.equal(C.neighbors(18).length,18);assert.equal(C.neighbors(26).length,26);
const affine=[[.5,0,0,-2],[0,1,0,3],[0,0,2,-4],[0,0,0,1]];
function volume(dims,values,a=affine){return{dims,values:Float32Array.from(values),affine:a,inverse:V.inverse(a),voxelMm3:Math.abs(V.determinant(a)),space:'sform',units:'mm',frames:1,min:Math.min(...values),max:Math.max(...values)};}
const v=volume([3,3,3],Array(27).fill(0));v.values[0]=4;v.values[1]=4;v.values[2]=-4;v.values[26]=5;
assert.equal(C.indexAt(v,[-1.5,3,-4]),1);assert.equal(C.sample(v,[-1.5,3,-4]),4);assert.equal(C.sample(v,[-50,3,-4]),null);near(C.sample(v,[-1.75,3,-4],true),4);
const original=[...v.values];let result=await C.analyse(v,null,null,{threshold:3,connectivity:6});assert.equal(result.clusters.length,3);assert.deepEqual(Array.from(result.clusters,c=>c.voxels),[2,1,1]);assert.equal(result.retainedVoxels,4);near(result.retainedMm3,4);assert.deepEqual([...v.values],original);
result=await C.analyse(v,null,null,{threshold:3,minVoxels:2,connectivity:26});assert.equal(result.clusters.length,1);assert.equal(result.retainedVoxels,2);near(result.clusters[0].peakWorld[0],-2);
result=await C.analyse(v,null,null,{threshold:3,minMm3:2.01});assert.equal(result.retainedVoxels,0);
result=await C.analyse(C.scaled(v,.1),null,null,{threshold:3,minMm3:.0019});assert.equal(result.retainedVoxels,2);near(result.retainedMm3,.002,1e-12);
for(const[i,expected]of [[4,[2,1,1]],[13,[2,2,1]]]){const a=volume([3,3,3],Array(27).fill(0));a.values[0]=5;a.values[i]=5;const counts=[];for(const k of [6,18,26])counts.push((await C.analyse(a,null,null,{connectivity:k})).clusters.length);assert.deepEqual(counts,expected);}
const template=volume([3,3,3],Array(27).fill(1));template.values[26]=0;const mask=volume([3,3,3],Array(27).fill(1));mask.values[2]=0;result=await C.analyse(v,template,mask,{threshold:3});assert.equal(result.retainedVoxels,2);
const shifted=volume([3,3,3],Array(27).fill(0),[[.5,0,0,-1.5],[0,1,0,3],[0,0,2,-4],[0,0,0,1]]);shifted.values[0]=1;result=await C.analyse(v,null,shifted,{threshold:3});assert.equal(result.retainedVoxels,1);assert.equal(result.kept[1],1);
const rotated=volume([3,3,3],Array(27).fill(0),[[0,-1,0,2],[1,0,0,-3],[0,0,2,5],[0,0,0,1]]);rotated.values[4]=9;assert.equal(C.indexAt(rotated,[1,-2,7]),13);assert.equal(C.sample(rotated,[1,-2,5]),9);
assert(C.overlap(v,template));assert(!C.overlap(v,volume([1,1,1],[1],[[1,0,0,100],[0,1,0,100],[0,0,1,100],[0,0,0,1]])));
assert.throws(()=>C.validateVolume({...v,frames:2}),/3D/);assert.throws(()=>C.validateVolume({...v,higherDims:[2,1,1]}),/3D/);assert.throws(()=>C.validateVolume({...v,space:'uncalibrated'}),/sform/);assert.throws(()=>C.validateVolume({...v,units:'unknown-assumed-mm'}),/单位/);
await assert.rejects(C.analyse(v,null,null,{minVoxels:1.1}),/正整数/);await assert.rejects(C.analyse(v,null,null,{templateCutoff:NaN}),/有限/);
const raw=V.writeMask(v.dims,v.affine,Uint8Array.from(original,x=>x!==0));const parsed=await V.read(raw);C.validateVolume(parsed);near(parsed.voxelMm3,v.voxelMm3);assert.deepEqual([...parsed.values],original.map(x=>Number(x!==0)));
const compressed=await V.read(new Uint8Array(gzipSync(raw)));assert.deepEqual([...compressed.values],[...parsed.values]);await assert.rejects(V.read(raw,{maxVoxels:5}),/体素上限/);
const p=volume([2,1,1],[.01,.02]);result=await C.analyse(p,null,null,{type:'p',alpha:.05,ignoreZero:false});near(result.clusters[0].peakValue,.01,1e-8);
console.log('NIfTI stats: distributions, native-grid clusters, extents, affine reslicing, masks, gzip and metadata PASS');
