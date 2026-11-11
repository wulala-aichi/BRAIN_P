import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={window:{}};vm.runInNewContext(await fs.readFile(new URL('../src/slice-depth.js',import.meta.url),'utf8'),context);
const S=context.window.AtlasSliceDepth;
assert.equal(S.defaults().sliceDepth,false);
assert.equal(S.clean({sliceThickness:100,sliceShadow:-3,sliceYaw:Infinity,slicePitch:-70}).sliceThickness,24);
assert.equal(S.clean({sliceShadow:-3}).sliceShadow,0);assert.equal(S.clean({slicePitch:-70}).slicePitch,-55);
let cases=0;
for(const [width,height]of [[1140,800],[1320,800],[1140,1320]])for(const scale of [.06,.23,.78])for(const mode of ['grid','ortho','single'])for(const pitch of [-55,0,20,55])for(const yaw of [-55,-18,0,55]){
  const p=S.projection({width,height,scale,x:30,y:80,mode,state:{sliceDepth:true,sliceThickness:24,sliceShadow:45,slicePitch:pitch,sliceYaw:yaw}});
  assert(p.matrix.every(Number.isFinite));assert(p.matrix[0]*p.matrix[3]-p.matrix[1]*p.matrix[2]>0);
  for(const point of [[0,0],[width/2,height/2],[width,height],[width*.13,height*.62]]){
    const screen=p.map(point),back=p.inverse(screen);assert(Math.abs(back[0]-point[0])<1e-9);assert(Math.abs(back[1]-point[1])<1e-9);
  }
  if(mode!=='single'){assert.equal(p.tilted,false);assert.equal(p.matrix[1],0);assert.equal(p.matrix[2],0);assert.equal(p.fit,.94);}
  else assert.equal(p.tilted,pitch!==0||yaw!==0);
  cases++;
}
const flat=S.projection({width:1140,height:800,scale:.7,x:30,y:80,mode:'single',state:{sliceDepth:false,slicePitch:55,sliceYaw:-55}});
assert.deepEqual([...flat.map([70,90])],[79,143]);assert.equal(flat.enabled,false);assert.equal(flat.tilted,false);
console.log(JSON.stringify({status:'ok',projectionCases:cases,inverseCoordinates:'passed',nonSingular:'passed',flatLegacy:'passed',uniformGridScale:'passed'}));
