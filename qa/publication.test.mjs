import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={};vm.runInNewContext(await fs.readFile(new URL('../src/publication-core.js',import.meta.url),'utf8'),ctx);const C=ctx.AtlasPublicationCore;
const source=i=>({id:'p'+i,svg:'<svg viewBox="0 0 100 100"><path d="M0 0H10V10Z"/></svg>',kind:i%2?'3d':'slice',sourceWidth:100,sourceHeight:100,x:8,y:8,w:60,h:45,label:C.letter(i),title:'',provenance:{position:2+i*.5}});
let tests=0;
for(const count of [1,2,4,8,16,64])for(const columns of [1,2,4,8]){
 const model=C.clean({...C.defaults(),height:500,columns,panels:Array.from({length:count},(_,i)=>source(i))});
 try{C.arrange(model);}catch(e){assert.match(e.message,/画布过小/);continue;}
 assert.equal(C.warnings(model).length,0);for(const p of model.panels){assert(p.x>=model.margin-1e-8);assert(p.y>=C.top(model)-1e-8);assert(p.x+p.w<=model.width-model.margin+1e-8);assert(p.y+p.h<=model.height-model.margin+1e-8);}tests++;
}
const clean=C.clean({width:NaN,height:1,font:'Fake',fontSize:100,margin:200,title:'test',panels:[source(0),source(0)]});assert.equal(clean.width,183);assert(clean.height>=60);assert.equal(clean.font,'Arial');assert.notEqual(clean.panels[0].id,clean.panels[1].id);assert(clean.panels.every(p=>p.y+p.h<=clean.height-clean.margin+1e-8));
assert.equal(C.letter(0),'A');assert.equal(C.letter(25),'Z');assert.equal(C.letter(26),'AA');assert.equal(C.letter(51),'AZ');assert.equal(C.letter(52),'BA');
const m=C.clean({...C.defaults(),panels:[source(0),source(1),source(2)]});C.arrange(m);const ids=m.panels.map(p=>p.id);m.panels[1].x+=2;C.align(m,ids,'left');assert.equal(new Set(m.panels.map(p=>p.x)).size,1);assert(C.warnings(m).length>0);C.arrange(m);C.align(m,ids,'width');assert.equal(new Set(m.panels.map(p=>p.w)).size,1);
const before=JSON.stringify(m.panels[2]);C.align(m,ids.slice(0,2),'top');assert.equal(JSON.stringify(m.panels[2]),before);
const restored=C.clean(JSON.parse(JSON.stringify(m)));assert.equal(JSON.stringify(restored),JSON.stringify(m));assert.equal(restored.panels[1].kind,'3d');assert.equal(restored.panels[1].provenance.position,2.5);
assert.equal(C.clean(null).panels.length,0);assert.equal(C.clean({panels:[{svg:'not SVG'}]}).panels.length,0);assert.equal(C.clean({panels:Array.from({length:70},(_,i)=>source(i))}).panels.length,64);
const headed=C.clean({...C.defaults(),title:'Study',rowTitles:['Control','Treatment'],columnTitles:['Coronal','Sagittal'],panels:Array.from({length:4},(_,i)=>source(i))});C.arrange(headed);assert.equal(C.warnings(headed).length,0);assert(headed.panels.every(p=>p.x>=C.left(headed)&&p.y>=C.top(headed)));assert(C.left(headed)>headed.margin);assert(C.top(headed)>headed.margin+9);
console.log(JSON.stringify({status:'ok',layoutCases:tests,checks:['bounds','no overlap after arrange','alignment','selection scope','roundtrip','source provenance','legacy defaults','64 panel limit','numbering']}));
