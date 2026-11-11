import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx={};
for(const name of ['utils','colorbar','mri-figure'])vm.runInNewContext(await fs.readFile(new URL('../src/'+name+'.js',import.meta.url),'utf8'),ctx);
const F=ctx.AtlasMRIFigure,context={center:[1,2,3],range:[-4,8]};
assert.equal(F.defaults().combination,'current');
assert.equal(F.clean({combination:'bad'}).combination,'current');
assert.equal(F.clean({rows:99,columns:0}).rows,6);
assert.equal(F.clean({rows:99,columns:0}).columns,1);
const counts={'ortho-row':3,'ortho-column':3,'ortho-3d':4,'ortho-3d-row':4,'plane-3d':2,'render-row':3,'slice-grid':8};
let cases=0;
for(const combination of Object.keys(counts))for(const width of [100,183,300])for(const height of [110,180])for(const annotations of [true,false]){
  const p=F.panelLayout({combination,annotations,showPanelLetters:true,showSliceLabels:true,showCoordinates:true},width,height,context);
  assert.equal(p.length,counts[combination]);
  for(const a of p){assert(a.x>=0&&a.y>=0&&a.x+a.width<=width+1e-8&&a.y+a.height<=height+1e-8);assert(a.imageHeight>0);assert.equal(a.imageY,a.y+a.header);if(!annotations)assert.equal(a.header,0);}
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const a=p[i],b=p[j];assert(!(a.x<b.x+b.width-1e-8&&a.x+a.width>b.x+1e-8&&a.y<b.y+b.height-1e-8&&a.y+a.height>b.y+1e-8));}
  cases++;
}
const ortho=F.panelLayout({combination:'ortho-row'},180,100,context);assert.deepEqual(Array.from(ortho,p=>p.mm),[3,2,1]);
const grid=F.panelLayout({combination:'slice-grid',rows:3,columns:3},180,120,context);assert.equal(grid[0].mm,-4);assert.equal(grid.at(-1).mm,8);assert.equal(grid[4].mm,2);
const manual=F.panelLayout({combination:'slice-grid',sliceAutoRange:false,sliceStart:10,sliceEnd:2},180,120,context);assert.equal(manual[0].mm,10);assert.equal(manual.at(-1).mm,2);
const one=F.panelLayout({combination:'slice-grid',rows:1,columns:1},180,120,context);assert.equal(one[0].mm,2);
const poses=F.panelLayout({combination:'render-row'},180,120,context);assert.deepEqual(Array.from(poses,p=>Array.from(p.camera)),[[0,90],[0,0],[270,0]]);
assert.throws(()=>F.panelLayout({combination:'slice-grid',rows:6,columns:6,panelGapMm:15},100,100,context),/空间不足/);
console.log(JSON.stringify({status:'ok',cases,panelBounds:true,noOverlap:true,worldCoordinates:true,automaticAndManualRanges:true,labelsOptional:true}));
