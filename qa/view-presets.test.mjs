import fs from 'node:fs/promises';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx={window:{}};for(const f of ['vendor/three.min.js','src/mesh-viewer.js'])vm.runInNewContext(await fs.readFile(new URL('../'+f,import.meta.url),'utf8'),ctx);
const V=ctx.window.AtlasMeshViewer,T=ctx.THREE,expected={dorsal:[0,1,0],ventral:[0,-1,0],anterior:[0,0,1],posterior:[0,0,-1],right:[1,0,0],left:[-1,0,0]};
const camera=new T.PerspectiveCamera(38,1.5,.1,200),directions={};
for(const[name,axis]of Object.entries(expected)){
  const pose=V.presetPose(name);V.orientCamera(camera,pose);const actual=camera.position.clone().sub(new T.Vector3(...pose.target)).normalize();directions[name]=actual;
  assert(actual.distanceTo(new T.Vector3(...axis))<1e-12,name+' camera lies on anatomical axis');
  assert(Math.abs(camera.up.length()-1)<1e-12);assert(Math.abs(camera.up.dot(actual))<1e-12,'non-singular camera basis');
  assert([...camera.matrixWorld.elements,...camera.quaternion.toArray()].every(Number.isFinite));assert(Math.abs(camera.matrixWorld.determinant()-1)<1e-12);
  const centre=new T.Vector3(...pose.target).project(camera);assert(Math.hypot(centre.x,centre.y)<1e-12,'target centred');
  if(!['dorsal','ventral'].includes(name))assert(new T.Vector3(0,1,0).project(camera).y>0,'dorsal edge stays up');
  const restored=JSON.parse(JSON.stringify(pose));V.orientCamera(camera,restored);assert(camera.position.clone().normalize().distanceTo(actual)<1e-12,'JSON roundtrip');
}
for(const[a,b]of [['dorsal','ventral'],['anterior','posterior'],['right','left']])assert(Math.abs(directions[a].dot(directions[b])+1)<1e-12,'opposite views');
assert.equal(JSON.stringify(V.presetPose('default')),JSON.stringify(V.initialPose()));
const a=V.presetPose('dorsal'),b=V.presetPose('dorsal');a.target[0]=10;assert.equal(b.target[0],0);
for(const pitch of [-Math.PI/2,-1.5,0,.5,1.5,Math.PI/2]){V.orientCamera(camera,{yaw:.65,pitch,radius:23,target:[2,1,-3]});assert([...camera.matrixWorld.elements].every(Number.isFinite));}
const html=await fs.readFile(new URL('../src/index.html',import.meta.url),'utf8'),app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');for(const name of Object.keys(expected)){assert(html.includes(`id="${name}3d"`));assert(app.includes(`['${name}3d','${name}']`));}
assert(app.includes('utils.clamp(input.camera3d.pitch,-Math.PI/2,Math.PI/2)'));
console.log(JSON.stringify({status:'ok',standardViews:6,oppositePairs:3,exactPoles:true,stableCameraUp:true,roundtrip:true,legacyReset:true}));
