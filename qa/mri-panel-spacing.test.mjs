import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={};for(const f of ['utils','colorbar','mri-figure'])vm.runInNewContext(await fs.readFile(new URL('../src/'+f+'.js',import.meta.url),'utf8'),ctx);const F=ctx.AtlasMRIFigure;
assert.equal(F.clean({panelGapMm:7}).panelGapXMm,7);assert.equal(F.clean({panelGapMm:7}).panelGapYMm,7);assert.equal(F.clean({panelGapXMm:0,panelGapYMm:12}).panelGapXMm,0);assert.equal(F.clean({panelGapXMm:-3,panelGapYMm:99}).panelGapYMm,30);
assert.equal(F.clean({panelGapXMm:-3}).panelGapXMm,-3);
assert.equal(F.clean({panelGapYMm:-12.5}).panelGapYMm,-12.5);
assert.equal(F.clean({panelGapXMm:-99,panelGapYMm:99}).panelGapXMm,-30);
assert.equal(F.clean({panelGapXMm:'-7.5',panelGapYMm:'-2'}).panelGapXMm,-7.5);
const legacyNegative=F.clean({panelGapMm:-6});
assert.equal(legacyNegative.panelGapXMm,-6);assert.equal(legacyNegative.panelGapYMm,-6);
const negativeSaved=F.clean(JSON.parse(JSON.stringify(F.clean({combination:'slice-grid',panelGapXMm:-7.5,panelGapYMm:-12,rows:3,columns:4}))));
assert.equal(negativeSaved.panelGapXMm,-7.5);assert.equal(negativeSaved.panelGapYMm,-12);assert.equal(negativeSaved.rows,3);assert.equal(negativeSaved.columns,4);
let cases=0;for(const x of [0,2.5,8,20])for(const y of [0,3,9,20])for(const combination of ['ortho-3d','slice-grid']){const c={combination,panelGapXMm:x,panelGapYMm:y,rows:2,columns:3},p=F.panelLayout(c,180,110);const cols=combination==='ortho-3d'?2:3;assert(Math.abs(p[1].x-p[0].x-p[0].width-x)<1e-10);assert(Math.abs(p[cols].y-p[0].y-p[0].height-y)<1e-10);for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const a=p[i],b=p[j];assert(!(a.x<b.x+b.width-1e-9&&a.x+a.width>b.x+1e-9&&a.y<b.y+b.height-1e-9&&a.y+a.height>b.y+1e-9));}cases++;}
let signedCases=0;
const close=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const overlap=(a,b,axis,size)=>Math.max(0,Math.min(a[axis]+a[size],b[axis]+b[size])-Math.max(a[axis],b[axis]));
for(const x of [-30,-12,-2.5,0,8])for(const y of [-30,-9,-1.5,0,9])for(const combination of ['ortho-3d','slice-grid']){
  const p=F.panelLayout({combination,panelGapXMm:x,panelGapYMm:y,rows:2,columns:3},180,110),cols=combination==='ortho-3d'?2:3;
  close(p[1].x-p[0].x-p[0].width,x);close(p[cols].y-p[0].y-p[0].height,y);
  close(overlap(p[0],p[1],'x','width'),Math.max(0,-x));close(overlap(p[0],p[cols],'y','height'),Math.max(0,-y));
  assert.equal(overlap(p[0],p[1],'x','width')>0,x<0);assert.equal(overlap(p[0],p[cols],'y','height')>0,y<0);
  assert(p[1].x>p[0].x);assert(p[cols].y>p[0].y);
  close(p[cols-1].x+p[cols-1].width,180);close(p.at(-1).y+p.at(-1).height,110);
  signedCases++;
}
// Negative gaps may overlap adjacent panels, but must not reverse panel order.
assert.throws(()=>F.panelLayout({combination:'slice-grid',rows:2,columns:3,panelGapXMm:-30,panelGapYMm:0},20,80));
assert.throws(()=>F.panelLayout({combination:'slice-grid',rows:2,columns:3,panelGapXMm:0,panelGapYMm:-30},180,20));
const panels=['axial','coronal','sagittal','render'].map(view=>({view}));for(const [layout,columns]of [[1,1],[2,2],[3,4]]){const p=F.panelLayout({combination:'current',panelGapXMm:6,panelGapYMm:10},180,160,{view:'mpr3d',layout,panels});assert.equal(p.length,4);if(columns>1)assert(Math.abs(p[1].x-p[0].width-6)<1e-10);if(columns<4)assert(Math.abs(p[columns].y-p[0].height-10)<1e-10);}
const grid=F.nativeGrid([[0,50,40,70],[0,0,40,45],[45,0,70,45],[45,50,70,70]]);assert.deepEqual(Array.from(grid,p=>[p.row,p.column]),[[1,0],[0,0],[0,1],[1,1]]);
const row=F.nativeGrid([[0,0,30,70],[35,0,30,35],[70,0,50,35]]);assert.deepEqual(Array.from(row,p=>[p.row,p.column]),[[0,0],[0,1],[0,2]]);
const col=F.nativeGrid([[0,0,30,70],[0,75,30,35],[0,115,50,35]]);assert.deepEqual(Array.from(col,p=>[p.row,p.column]),[[0,0],[1,0],[2,0]]);
const current=F.panelLayout({combination:'current'},180,110,{view:'mpr3d',layout:0,panels:panels.map((p,i)=>({...p,...grid[i]}))});assert.equal(current[0].row,1);assert.equal(current[1].row,0);assert(current[0].y>current[1].y);
const specs=[{title:'Z',range:[2,6],stops:[],negative:false}],w=F.imageWidth({legend:{orientation:'vertical',position:'right'}},183,specs);assert(w<177&&w>100);assert.equal(F.imageWidth({legend:{position:'bottom'}},183,specs),177);
const source=await fs.readFile(new URL('../src/mri-advanced-ui.js',import.meta.url),'utf8');assert(source.includes('id="advFigPanelGapXMm"'));assert(source.includes('id="advFigPanelGapYMm"'));assert(source.includes('captureCurrentPanels()||'));
console.log(JSON.stringify({status:'ok',spacingCases:cases,signedSpacingCases:signedCases,legacyPreserved:true,negativePersistence:true,intentionalOverlap:true,reversedStepsRejected:true,independentXY:true,currentViewsCovered:true,physicalSideLegendGaps:true}));
