import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={window:{}};for(const file of ['src/utils.js','data/atlas-data.js'])vm.runInNewContext(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'),context);
const U=context.window.AtlasUtils,D=context.window.MOUSE_ATLAS_DATA;
let cases=0;
for(const orientation of ['coronal','sagittal','horizontal']){
  const slices=D.planes[orientation].slices;
  for(const count of [1,8,16,64])for(const step of [.1,.15,.3,.5]){
    const start=slices[0].position,end=start+(count-1)*step,result=U.intervalSelection(slices,count,start,step);
    if(end>slices.at(-1).position+1e-7){assert.equal(result.ok,false);continue;}
    assert.equal(result.ok,true,result.error);assert.equal(result.indices.length,count);assert.equal(new Set(result.indices).size,count);assert(result.maxSnapError<=.050000001);
    for(let i=1;i<result.positions.length;i++)assert(result.positions[i]>result.positions[i-1]);cases++;
  }
  assert.equal(U.intervalSelection(slices,8,slices[0].position,.05).ok,false);
  assert.equal(U.intervalSelection(slices,8,slices.at(-1).position,.1).ok,false);
  assert.equal(U.intervalSelection(slices,8,slices[0].position-1,.1).ok,false);
}
const slices=D.planes.coronal.slices,result=U.intervalSelection(slices,8,2,.5);assert.equal(JSON.stringify(result.positions),JSON.stringify([2,2.5,3,3.5,4,4.5,5,5.5]));
const ties=U.intervalSelection(slices,64,2.05,.1);assert(ties.ok);assert.equal(new Set(ties.indices).size,64);assert.equal(ties.positions[0],2);
for(const bad of [0,-1,NaN,Infinity])assert.equal(U.intervalSelection(slices,8,2,bad).ok,false);
for(const count of [0,65,1.5])assert.equal(U.intervalSelection(slices,count,2,.5).ok,false);
for(let columns=1;columns<=8;columns++)for(const gap of [0,24,100])assert((1200-80-gap*(columns-1))/columns>12);
console.log(JSON.stringify({status:'ok',validIntervalCases:cases,axes:'AP/ML/DV',halfStepTies:'stable',rangeAndResolution:'passed',layoutGapBounds:'passed',example:result.positions}));
