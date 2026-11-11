import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={};for(const file of ['publication-annotations.js','publication-core.js'])vm.runInNewContext(await fs.readFile(new URL('../src/'+file,import.meta.url),'utf8'),ctx);const A=ctx.AtlasPublicationAnnotations,C=ctx.AtlasPublicationCore;
const panel={id:'slice',svg:'<svg viewBox="15 30 1000 800"/>',kind:'slice',sourceWidth:1000,sourceHeight:800,x:10,y:10,w:80,h:75,provenance:{insetCalibration:{version:1,valid:true,unitsPerMm:100}}};
const source={id:'a',panelId:'slice',kind:'inset',x:.6,y:.5,x2:.2,y2:.1,text:'CA1',fontPt:8,box:{x:100,y:20,w:40,h:40}};
const m=C.clean({...C.defaults(),panels:[panel],annotations:[source,{...source,id:'a'},{...source,panelId:'missing'},{...source,kind:'invalid'}]});assert.equal(m.annotations.length,2);assert.notEqual(m.annotations[0].id,m.annotations[1].id);assert.equal(m.annotations[0].x,.2);assert.equal(m.annotations[0].x2,.6);
const a=m.annotations[0],p=m.panels[0],area={x:0,y:10,w:80,h:60},f=A.frame(p,area);assert.equal(f.w,75);assert.equal(f.h,60);assert.equal(f.scale,.075);
for(const x of [-.3,0,.2,.8,1,1.4])for(const y of [0,.2,1]){const point=A.map(f,x,y),back=A.unmap(f,point.x,point.y);assert(Math.abs(x-back.x)<1e-12);assert(Math.abs(y-back.y)<1e-12);}
const l=A.insetLayout(a,p,f);assert(l.calibrated);assert(l.ruler);assert(Math.abs(l.ruler.length-l.ruler.mm*100*l.scale)<1e-10);assert(l.ruler.length<=a.box.w*.55);assert.equal(l.image.w/l.image.h,(a.x2-a.x)*1000/((a.y2-a.y)*800));
for(const kind of ['3d','view','chart']){const raster={...p,kind,provenance:{}};assert.equal(A.insetLayout(a,raster,f).ruler,null);}
assert.equal(A.insetLayout(a,{...p,provenance:{insetCalibration:{version:1,valid:false,unitsPerMm:100}}},f).ruler,null);
assert.equal(A.insetLayout({...a,showScale:false},p,f).ruler,null);
let cases=0;for(const width of [80,183,400])for(const height of [60,140,500])for(const fontPt of [4,8,24])for(const boxSize of [12,32,600]){
 const model=C.clean({width,height,panels:[panel],annotations:[{...source,x:-100,y:-1,x2:4,y2:8,fontPt,box:{x:500,y:500,w:boxSize,h:boxSize}}]});const aa=model.annotations[0],ff=A.frame(model.panels[0],area),ll=A.insetLayout(aa,model.panels[0],ff);
 assert(aa.x>=0&&aa.y>=0&&aa.x2<=1&&aa.y2<=1);assert(aa.box.x>=0&&aa.box.y>=0&&aa.box.x+aa.box.w<=model.width+1e-8&&aa.box.y+aa.box.h<=model.height+1e-8);assert(ll.image.w>0&&ll.image.h>0);assert(ll.image.y>=aa.box.y-1e-8);assert(ll.image.y+ll.image.h<=aa.box.y+aa.box.h+1e-8);cases++;
}
const round=C.clean(JSON.parse(JSON.stringify(m)));assert.equal(JSON.stringify(round),JSON.stringify(m));assert.equal(C.clean({...m,panels:[]}).annotations.length,0);assert.equal(C.clean({panels:[panel]}).annotations.length,0);
const copies=A.duplicate(m.annotations,new Map([['slice','copy']]));assert.equal(copies.length,2);assert.equal(copies[0].panelId,'copy');assert.notEqual(copies[0].id,a.id);assert.equal(copies[0].box.x,a.box.x+3);assert.equal(a.box.x,100);
assert.equal(C.clean({...m,annotations:Array.from({length:420},()=>source)}).annotations.length,400);
const warningModel=C.clean({...m,annotations:[{...source,kind:'text',x:-.5,text:'outside'},{...source,id:'b',kind:'label',x2:0,y2:0,text:'title'}]});assert(A.warnings(warningModel,new Map([['slice',{...f,header:10}]]),v=>v.length).some(v=>v.includes('超出画布')));
console.log(JSON.stringify({status:'ok',geometryCases:cases,checks:['source-relative roundtrip','nonzero source origin supported by normalized coordinates','isotropic crop','calibrated physical ruler','no fake 3D/tilted rulers','bounds at 4–24pt','legacy defaults','cascade delete','duplicate provenance','400 limit']}));
let devices=0;
for(const kind of A.implantKinds)for(const angle of [0,30,90,160,220,270,359])for(const shanks of [1,4]){
 const r=angle*Math.PI/180,item={id:'device',panelId:p.id,kind,x:.4,y:.4,x2:.4+Math.cos(r)*.3,y2:.4+Math.sin(r)*.3,text:kind,implant:{shanks,contacts:32}},model=C.clean({...m,annotations:[item]}),aa=model.annotations[0],d=A.deviceGeometry(aa,f),b=A.bounds(aa,f);
 assert(d.length>0);assert(d.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h));
 if(kind==='neuropixels')assert.equal(d.shanks.length,shanks);
 assert.equal(JSON.stringify(C.clean(JSON.parse(JSON.stringify(model)))),JSON.stringify(model));devices++;
}
const constrained=A.implantOptions({contacts:10000,shanks:100,shaftMm:-1,coneOpacity:100,activeFraction:0});assert.equal(constrained.contacts,32);assert.equal(constrained.shanks,4);assert.equal(constrained.shaftMm,.15);assert.equal(constrained.coneOpacity,.65);assert.equal(constrained.activeFraction,.1);
assert.equal(C.clean({...m,annotations:[source]}).annotations[0].showAnnotations,true);
console.log(JSON.stringify({status:'ok',deviceGeometryCases:devices,schematics:['injection','fiber','neuropixels'],options:'bounded',roundtrip:'exact'}));
