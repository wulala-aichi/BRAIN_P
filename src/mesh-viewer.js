(function(scope){
  'use strict';
  const initialPose=()=>({yaw:.65,pitch:.5,radius:23,target:[0,0,0]});
  const viewPresets=Object.freeze({dorsal:[0,Math.PI/2],ventral:[0,-Math.PI/2],anterior:[0,0],posterior:[Math.PI,0],right:[Math.PI/2,0],left:[-Math.PI/2,0]});
  function presetPose(name){const pose=initialPose(),angles=viewPresets[name];if(angles)[pose.yaw,pose.pitch]=angles;return pose;}
  function orientCamera(camera,pose){
    const {yaw,pitch,radius,target}=pose;
    camera.position.set(target[0]+radius*Math.cos(pitch)*Math.sin(yaw),target[1]+radius*Math.sin(pitch),target[2]+radius*Math.cos(pitch)*Math.cos(yaw));
    // The pitch tangent remains well-defined at the dorsal/ventral poles.
    camera.up.set(-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),-Math.sin(pitch)*Math.cos(yaw));
    camera.lookAt(...target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  const toWorld=point=>[point.ml,4-point.dv,6.6-point.ap];
  const fromWorld=point=>({ap:6.6-point.z,ml:point.x,dv:4-point.y});
  const smoothingLabel=value=>value===0?'0 · 关闭':value===100?'100 · 标准':value===200?'200 · 增强':String(value);
  // Interpolate immutable references, never the previous output (no cumulative drift).
  function interpolatePositions(target,raw,standard,strong,strength){
    const value=Math.max(0,Math.min(200,Number.isFinite(strength)?strength:100));
    const a=value<=100?raw:standard,b=value<=100?standard:strong,t=value<=100?value/100:(value-100)/100;
    if(t===0)target.set(a);else if(t===1)target.set(b);else for(let i=0;i<target.length;i++)target[i]=a[i]+(b[i]-a[i])*t;
    return target;
  }
  let decodedPromise=null;
  async function decode(){
    if(!decodedPromise)decodedPromise=(async()=>{
      const bundle=scope.MOUSE_ATLAS_3D;if(!bundle)throw new Error('缺少三维网格数据');
      const bytes=Uint8Array.from(atob(bundle.packed),value=>value.charCodeAt(0));
      const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
      return{bundle,buffer};
    })();
    return decodedPromise;
  }
  class MeshViewer{
    static async create(host,callbacks){
      const decoded=await decode();
      if(decoded.bundle.sourceFingerprint!==scope.MOUSE_ATLAS_DATA.fingerprint)throw new Error('三维网格与二维图谱版本不匹配');
      return new MeshViewer(host,callbacks,decoded);
    }
    constructor(host,callbacks,decoded){
      const T=scope.THREE;if(!T)throw new Error('3D 渲染库未载入');
      this.host=host;this.callbacks=callbacks;this.bundle=decoded.bundle;this.objects=[];this.active=true;this.pose=initialPose();
      try{this.renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});}catch{throw new Error('当前浏览器无法创建 WebGL；请启用硬件加速，或继续使用二维模式。');}
      this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.setClearColor(0xffffff,0);
      this.renderer.outputColorSpace=T.SRGBColorSpace;
      this.renderer.domElement.setAttribute('aria-label','三维小鼠脑区，拖动旋转，滚轮缩放，Shift 拖动平移，点击选择脑区');
      this.renderer.domElement.tabIndex=0;host.replaceChildren(this.renderer.domElement);host.style.position='relative';this.labelOverlay=document.createElementNS('http://www.w3.org/2000/svg','svg');this.labelOverlay.setAttribute('data-implant-label-overlay','true');this.labelOverlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden';host.append(this.labelOverlay);
      this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(38,1,.1,200);
      this.scene.add(new T.HemisphereLight(0xffffff,0x74817c,2.1));
      const keyLight=new T.DirectionalLight(0xffffff,2.2);keyLight.position.set(-8,14,20);this.scene.add(keyLight);
      const fill=new T.DirectionalLight(0xe0efff,.8);fill.position.set(12,2,-10);this.scene.add(fill);
      for(const record of this.bundle.meshes){
        const geometry=new T.BufferGeometry();
        const standard=new Float32Array(decoded.buffer,record.offset,record.vertices*3);
        const raw=new Float32Array(decoded.buffer,record.rawOffset,record.vertices*3),strong=new Float32Array(decoded.buffer,record.strongOffset,record.vertices*3);
        geometry.setAttribute('position',new T.BufferAttribute(standard.slice(),3));
        geometry.userData.smoothing={raw,standard,strong,strength:100};
        geometry.setIndex(new T.BufferAttribute(new Uint32Array(decoded.buffer,record.offset+record.vertices*12,record.faces*3),1));
        geometry.computeVertexNormals();geometry.computeBoundingSphere();
        const material=new T.MeshPhongMaterial({color:0xdfe5e2,shininess:18,side:T.DoubleSide});
        const mesh=new T.Mesh(geometry,material);mesh.userData=record;this.scene.add(mesh);
        if(record.regionIndex<0){this.shell=mesh;mesh.renderOrder=4;}else this.objects.push(mesh);
      }
      this.planes=[];
      for(const [orientation,width,height,colour]of [['coronal',11.4,8,0x299cae],['sagittal',13.2,8,0x9964c0],['horizontal',11.4,13.2,0xd28c35]]){
        const geometry=new T.PlaneGeometry(width,height);
        const material=new T.MeshBasicMaterial({color:colour,transparent:true,opacity:.08,side:T.DoubleSide,depthWrite:false});
        const mesh=new T.Mesh(geometry,material);
        const edges=new T.LineSegments(new T.EdgesGeometry(geometry),new T.LineBasicMaterial({color:colour,transparent:true,opacity:.8}));mesh.add(edges);
        if(orientation==='sagittal')mesh.rotation.y=Math.PI/2;
        if(orientation==='horizontal')mesh.rotation.x=-Math.PI/2;
        mesh.userData.orientation=orientation;mesh.renderOrder=5;this.scene.add(mesh);this.planes.push(mesh);
      }
      this.axesGroup=new T.Group();this.axesGroup.visible=false;this.scene.add(this.axesGroup);
      const origin=new T.Vector3(0,4,6.6);
      function label(text,colour,position){
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=80;const context=canvas.getContext('2d');
        context.font='bold 40px Arial';context.textAlign='center';context.textBaseline='middle';context.strokeStyle='rgba(255,255,255,.95)';context.lineWidth=9;context.strokeText(text,160,40);context.fillStyle=colour;context.fillText(text,160,40);
        const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthTest:false,depthWrite:false}));sprite.position.set(...position);sprite.scale.set(2.6,.65,1);sprite.renderOrder=20;return sprite;
      }
      for(const [direction,length,colour,text,position]of [
        [[1,0,0],6.2,0xb84e4e,'ML+ (R)',[6.6,4,6.6]],
        [[-1,0,0],6.2,0xb84e4e,'ML- (L)',[-6.6,4,6.6]],
        [[0,0,-1],13.5,0x427a9f,'AP+ (P)',[0,4,-7.6]],
        [[0,-1,0],8.4,0x7b5ba8,'DV+ (V)',[0,-5,6.6]]
      ]){this.axesGroup.add(new T.ArrowHelper(new T.Vector3(...direction),origin,length,colour,.4,.2));this.axesGroup.add(label(text,'#'+colour.toString(16).padStart(6,'0'),position));}
      this.raycaster=new T.Raycaster();this.pointer=new T.Vector2();this.drag=null;this.hoverFrame=null;this.zoomTimer=null;
      const canvas=this.renderer.domElement;
      canvas.addEventListener('contextmenu',event=>event.preventDefault());
      canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);this.drag={x:event.clientX,y:event.clientY,total:0,pan:event.button===2||event.shiftKey};});
      canvas.addEventListener('pointermove',event=>{
        if(this.drag){
          const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y;this.drag.total+=Math.abs(dx)+Math.abs(dy);this.drag.x=event.clientX;this.drag.y=event.clientY;
          if(this.drag.pan){
            this.camera.updateMatrixWorld();
            const right=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1),target=new T.Vector3(...this.pose.target);
            target.addScaledVector(right,-dx*this.pose.radius/700).addScaledVector(up,dy*this.pose.radius/700);this.pose.target=target.toArray();
          }else{this.pose.yaw-=dx*.007;this.pose.pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,this.pose.pitch+dy*.007));}
          this.render();
        }else if(!this.hoverFrame){const x=event.clientX,y=event.clientY;this.hoverFrame=requestAnimationFrame(()=>{this.hoverFrame=null;const hit=this.pick(x,y);callbacks.onHover(hit?.object.userData||null);});}
      });
      canvas.addEventListener('pointerup',event=>{
        if(!this.drag)return;const click=this.drag.total<5;this.drag=null;this.commit();
        if(click){const hit=this.pick(event.clientX,event.clientY);if(hit)callbacks.onPick(hit.object.userData,fromWorld(hit.point));}
      });
      canvas.addEventListener('pointercancel',()=>{this.drag=null;this.commit();});
      canvas.addEventListener('pointerleave',()=>{if(!this.drag)callbacks.onHover(null);});
      canvas.addEventListener('wheel',event=>{event.preventDefault();this.pose.radius=Math.max(10,Math.min(75,this.pose.radius*Math.exp(event.deltaY*.001)));this.render();clearTimeout(this.zoomTimer);this.zoomTimer=setTimeout(()=>this.commit(),180);},{passive:false});
      this.resizeObserver=new ResizeObserver(()=>{if(this.active)this.resize();});this.resizeObserver.observe(host);
      this.resize();
    }
    pick(x,y){
      const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const network=this.raycaster.intersectObjects(this.networkPickables||[],false),brain=this.raycaster.intersectObjects(this.objects.filter(mesh=>mesh.visible&&mesh.material.opacity>=.2),false),hit=this.connectomePlan?.settings.occlusion==='overlay'?(network[0]||brain[0]):[...network,...brain].sort((a,b)=>a.distance-b.distance)[0];
      if(hit?.object.userData.fcRecords){const record=hit.object.userData.fcRecords[hit.instanceId];return{...hit,object:{userData:record}};}return hit||null;
    }
    commit(){this.callbacks.onCamera({...this.pose,target:[...this.pose.target]});}
    resize(){const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;this.renderer.setSize(width,height);this.camera.aspect=width/height;this.render();}
    setActive(active){const changed=this.active!==active;this.active=active;if(active&&changed)this.resize();}
    setSmoothing(strength){
      for(const mesh of [...this.objects,this.shell]){
        const geometry=mesh.geometry,reference=geometry.userData.smoothing;
        // A hidden mesh is updated when it next becomes visible.
        if(!mesh.visible||reference.strength===strength)continue;
        const position=geometry.getAttribute('position');
        interpolatePositions(position.array,reference.raw,reference.standard,reference.strong,strength);
        position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
        reference.strength=strength;
      }
      this.smoothingStrength=strength;
    }
    setResearch(options){
      if(this.researchRevision===options.revision)return;this.researchRevision=options.revision;
      const T=scope.THREE;if(this.researchGroup){this.scene.remove(this.researchGroup);this.researchGroup.traverse(object=>{if(object.isInstancedMesh)object.dispose();object.geometry?.dispose();if(Array.isArray(object.material))object.material.forEach(m=>{m.map?.dispose();m.dispose();});else{object.material?.map?.dispose();object.material?.dispose();}});}
      const group=new T.Group();this.researchGroup=group;this.scene.add(group);
      if(options.points.length){const positions=new Float32Array(options.points.length*3),colours=new Float32Array(options.points.length*3);options.points.forEach((point,index)=>{positions.set(toWorld(point),index*3);const colour=new T.Color(point.colour);colours.set([colour.r,colour.g,colour.b],index*3);});const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colours,3));const points=new T.Points(geometry,new T.PointsMaterial({size:options.pointSize,vertexColors:true,transparent:true,opacity:.9,depthTest:false,depthWrite:false}));points.renderOrder=10;group.add(points);}
      for(const edge of options.edges){const a=new T.Vector3(...toWorld(edge.a)),b=new T.Vector3(...toWorld(edge.b)),colour=edge.weight>=0?0xbd4943:0x3971b7,delta=b.clone().sub(a),length=delta.length();if(length<1e-6)continue;if(options.directed){const arrow=new T.ArrowHelper(delta.normalize(),a,length,colour,Math.min(.35,length*.2),.16);arrow.line.material.transparent=true;arrow.line.material.opacity=.75;arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;group.add(arrow);}else group.add(new T.Line(new T.BufferGeometry().setFromPoints([a,b]),new T.LineBasicMaterial({color:colour,transparent:true,opacity:.75,depthTest:false})));}
      for(const track of options.tracks)if(track.points.length>1)group.add(new T.Line(new T.BufferGeometry().setFromPoints(track.points.map(p=>new T.Vector3(...toWorld(p)))),new T.LineBasicMaterial({color:0xb24c94,depthTest:false})));
      this.connectomePlan=options.connectome||null;this.connectomeGeometry=null;this.networkPickables=[];if(options.connectome?.enabled)this.drawConnectome(group,options.connectome);
      this.implantPlan=options.implants||null;this.implantBillboards=[];this.implantLabels=[];let implants=null;if(options.implants?.enabled){const rendered=scope.AtlasImplants.draw(group,options.implants,T,toWorld);this.implantBillboards=rendered.billboards;this.implantLabels=rendered.labels||[];implants=rendered.summary;}
      this.merfishPlan=options.merfish||null;this.merfishGeometry=null;if(options.merfish?.enabled)this.drawMerfish(group,options.merfish);
      if(this.merfishGeometry&&options.merfish?.data?.symmetry)this.merfishGeometry.symmetry=options.merfish.data.symmetry;
      this.aavPlan=options.aav||null;this.aavGeometry=null;if(options.aav?.enabled)this.drawAav(group,options.aav);
      const clip=options.hemisphere==='B'?[]:[new T.Plane(new T.Vector3(options.hemisphere==='L'?-1:1,0,0),0)];group.traverse(object=>{if(object.material)object.material.clippingPlanes=clip;});
      this.researchCounts={points:options.points.length,edges:options.edges.length,tracks:options.tracks.length,connectome:this.connectomeGeometry||null,implants,merfish:this.merfishGeometry,aav:this.aavGeometry};if(this.options)this.update(this.options);else this.render();
    }
    drawMerfish(group,plan){const T=scope.THREE,m=scope.AtlasMerfishCore.clean(plan),cells=m.data.cells,lookup=new Map(m.data.taxonomy.map(r=>[r.cluster_alias,r])),positions=new Float32Array(cells.length*3),colours=new Float32Array(cells.length*3),samples=[];for(let i=0;i<cells.length;i++){const c=cells[i],world=toWorld({ap:c[0],ml:c[1],dv:c[2]}),hex=scope.AtlasMerfishCore.colour(c,m,lookup),colour=new T.Color(hex);positions.set(world,i*3);colours.set([colour.r,colour.g,colour.b],i*3);if(i<8)samples.push({ap:c[0],ml:c[1],dv:c[2],value:c[3],cluster:c[4],dataset:m.data.datasets[c[5]],obsIndex:c[6],world,colour:hex});}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colours,3));const cloud=new T.Points(geometry,new T.PointsMaterial({size:m.settings.point3d,vertexColors:true,transparent:true,opacity:m.settings.opacity,depthTest:false,depthWrite:false}));cloud.renderOrder=30;group.add(cloud);this.merfishGeometry={points:cells.length,matched:m.data.matched,sampling:m.data.sampling,geometry:geometry.type,primitive:'Points',pointSize:m.settings.point3d,opacity:m.settings.opacity,samples};}
    drawAav(group,plan){const T=scope.THREE,m=scope.AtlasAavCore.clean(plan),voxels=plan.visibleVoxels||[],positions=new Float32Array(voxels.length*3),colours=new Float32Array(voxels.length*3),samples=[];for(let i=0;i<voxels.length;i++){const v=voxels[i],world=toWorld({ap:v[0],ml:v[1],dv:v[2]}),hex=scope.AtlasAavCore.colour(v[3],m),c=new T.Color(hex);positions.set(world,i*3);colours.set([c.r,c.g,c.b],i*3);if(i<8)samples.push({ap:v[0],ml:v[1],dv:v[2],value:v[3],indices:v.slice(5),world,colour:hex});}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('color',new T.BufferAttribute(colours,3));const cloud=new T.Points(geometry,new T.PointsMaterial({size:m.settings.pointSize,vertexColors:true,transparent:true,opacity:m.settings.opacity,depthTest:false,depthWrite:false}));cloud.renderOrder=35;group.add(cloud);this.aavGeometry={points:voxels.length,volumeMask:plan.volumeMask,matched:m.data.matched,experiment:m.data.experiment.id,resolution:m.data.resolution_um,sampling:m.data.sampling,qc:m.data.qc,primitive:'voxel-centre Points, not streamlines',samples};}
    drawConnectome(group,plan){
      const T=scope.THREE,s=plan.settings,depthTest=s.occlusion==='depth',material=()=>new T.MeshStandardMaterial({color:0xffffff,roughness:.48,metalness:.04,transparent:s.opacity<1,opacity:s.opacity,depthTest,depthWrite:s.opacity>=.999&&depthTest}),matrix=new T.Matrix4(),rotation=new T.Quaternion(),scale=new T.Vector3();
      const balls=new T.InstancedMesh(new T.SphereGeometry(1,28,20),material(),plan.nodes.length);balls.userData.fcRecords=plan.nodes.map(n=>({...n,connectomeType:'node'}));balls.renderOrder=21;
      plan.nodes.forEach((n,i)=>{matrix.compose(new T.Vector3(...toWorld(n)),new T.Quaternion(),new T.Vector3(n.radius,n.radius,n.radius));balls.setMatrixAt(i,matrix);balls.setColorAt(i,new T.Color(n.colour));});balls.instanceMatrix.needsUpdate=true;if(balls.instanceColor)balls.instanceColor.needsUpdate=true;group.add(balls);this.networkPickables.push(balls);
      const drawable=plan.edges.filter(e=>new T.Vector3(...toWorld(e.a)).distanceTo(new T.Vector3(...toWorld(e.b)))>1e-6),sticks=new T.InstancedMesh(new T.CylinderGeometry(1,1,1,18),material(),drawable.length);sticks.renderOrder=20;sticks.userData.fcRecords=drawable.map(e=>({...e,connectomeType:'edge'}));
      const cones=s.directed?new T.InstancedMesh(new T.ConeGeometry(1,1,18),material(),drawable.length):null;
      drawable.forEach((e,i)=>{const a=new T.Vector3(...toWorld(e.a)),b=new T.Vector3(...toWorld(e.b)),delta=b.clone().sub(a),length=delta.length(),direction=delta.clone().normalize(),trimA=Math.min(e.a.radius,length*.35),trimB=Math.min(e.b.radius,length*.35),height=Math.max(.001,length-trimA-trimB),center=a.clone().addScaledVector(direction,trimA+height/2);rotation.setFromUnitVectors(new T.Vector3(0,1,0),direction);scale.set(e.radius,height,e.radius);matrix.compose(center,rotation,scale);sticks.setMatrixAt(i,matrix);sticks.setColorAt(i,new T.Color(e.colour));if(cones){const h=Math.min(.3,height*.35),p=b.clone().addScaledVector(direction,-trimB-h/2);matrix.compose(p,rotation,new T.Vector3(Math.max(e.radius*2,.055),h,Math.max(e.radius*2,.055)));cones.setMatrixAt(i,matrix);cones.setColorAt(i,new T.Color(e.colour));}});
      sticks.instanceMatrix.needsUpdate=true;if(sticks.instanceColor)sticks.instanceColor.needsUpdate=true;group.add(sticks);this.networkPickables.push(sticks);if(cones){cones.instanceMatrix.needsUpdate=true;if(cones.instanceColor)cones.instanceColor.needsUpdate=true;cones.renderOrder=22;group.add(cones);}
      for(const n of plan.labels){const canvas=document.createElement('canvas'),c=canvas.getContext('2d');c.font='28px Arial, Microsoft YaHei';canvas.width=Math.ceil(c.measureText(n.label).width+16);canvas.height=46;c.font='28px Arial, Microsoft YaHei';c.lineWidth=5;c.lineJoin='round';c.strokeStyle='#ffffff';c.fillStyle='#233d36';c.strokeText(n.label,8,32);c.fillText(n.label,8,32);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest,depthWrite:false}));const p=toWorld(n);sprite.position.set(p[0]+n.radius+.04,p[1]+n.radius+.09,p[2]);sprite.scale.set(s.labelSize*canvas.width/32,s.labelSize*canvas.height/32,1);sprite.center.set(0,.3);sprite.renderOrder=23;group.add(sprite);}
      this.connectomeGeometry={enabled:true,nodes:plan.nodes.length,cylinders:drawable.length,arrows:cones?drawable.length:0,labels:plan.labels.length,coincidentEdges:plan.edges.length-drawable.length,geometry:{nodes:balls.geometry.type,edges:sticks.geometry.type,instanced:true},nodeSamples:plan.nodes.slice(0,8).map((n,i)=>({id:n.id,radius:n.radius,degree:n.degree,strength:n.strength,matrix:Array.from(balls.instanceMatrix.array.slice(i*16,(i+1)*16))})),edgeSamples:drawable.slice(0,8).map((e,i)=>({source:e.source,target:e.target,weight:e.weight,radius:e.radius,matrix:Array.from(sticks.instanceMatrix.array.slice(i*16,(i+1)*16))}))};
    }
    update(options){
      this.options=options;const state=options.state;this.pose=structuredClone(state.camera3d||initialPose());
      let count=0;
      for(const mesh of this.objects){
        const record=mesh.userData,selected=options.selected(record.regionIndex);
        mesh.visible=(state.hemisphere==='B'||state.hemisphere===record.hemisphere)&&(!state.selectionOnly||selected);
        if(state.layer!=='anatomy'&&!options.assigned(record.regionIndex,record.hemisphere))mesh.visible=false;
        if(!mesh.visible)continue;count++;
        mesh.material.color.set(options.colour(record.regionIndex,record.hemisphere));
        let opacity=state.fillOpacity/100*(selected?1:.12);
        mesh.material.opacity=opacity;mesh.material.transparent=opacity<.999;mesh.material.depthWrite=opacity>=.999;
        mesh.material.emissive.set(selected&&state.selectedStructures.length?'#173b2d':'#000000');
      }
      this.shell.visible=state.shellOpacity>0;this.shell.material.opacity=state.shellOpacity/100;
      this.shell.material.transparent=true;this.shell.material.depthWrite=false;this.shell.material.color.set('#c7d4ce');
      const clip=state.hemisphere==='B'?[]:[new scope.THREE.Plane(new scope.THREE.Vector3(state.hemisphere==='L'?-1:1,0,0),0)];
      this.renderer.localClippingEnabled=true;this.shell.material.clippingPlanes=clip;
      for(const plane of this.planes){
        plane.visible=state.show3dPlanes&&state.planeVisibility[plane.userData.orientation];
        const point=toWorld(state.crosshair),orientation=plane.userData.orientation;
        plane.position.set(orientation==='sagittal'?point[0]:0,orientation==='horizontal'?point[1]:0,orientation==='coronal'?point[2]:0);
      }
      this.axesGroup.visible=['axes','both'].includes(state.coordinateMode);
      const fc=this.connectomePlan;if(fc?.enabled&&fc.settings.brain!=='surfaces'){for(const mesh of this.objects)mesh.visible=false;this.shell.visible=fc.settings.brain==='shell'&&fc.settings.shellOpacity>0;this.shell.material.opacity=fc.settings.shellOpacity;this.shell.material.depthWrite=false;}
      if(this.implantPlan?.enabled&&this.implantPlan.glass){for(const mesh of this.objects){const r=scope.MOUSE_ATLAS_DATA.regions[mesh.userData.regionIndex],style=scope.AtlasImplants.regionStyle(this.implantPlan.parcellation,r.id);mesh.visible=style.visible&&(state.hemisphere==='B'||mesh.userData.hemisphere===state.hemisphere);mesh.material.color.set(r.colour);mesh.material.opacity=style.opacity;mesh.material.transparent=style.opacity<.999;mesh.material.depthWrite=style.opacity>=.999;mesh.material.emissive.set('#000000');}this.shell.visible=this.implantPlan.shellOpacity>0;this.shell.material.opacity=this.implantPlan.shellOpacity;this.shell.material.depthWrite=false;}
      if(this.merfishPlan?.enabled&&this.merfishPlan.settings.display!=='regions'&&this.merfishPlan.settings.display!=='both'&&this.merfishPlan.settings.brain!=='current'){for(const mesh of this.objects)mesh.visible=false;this.shell.visible=this.merfishPlan.settings.brain==='shell'&&this.merfishPlan.settings.shellOpacity>0;this.shell.material.opacity=this.merfishPlan.settings.shellOpacity;this.shell.material.depthWrite=false;}
      if(scope.AtlasMerfishRegions?.active(this.merfishPlan)){const plan=this.merfishPlan;for(const mesh of this.objects){const r=scope.MOUSE_ATLAS_DATA.regions[mesh.userData.regionIndex];mesh.visible=(state.hemisphere==='B'||mesh.userData.hemisphere===state.hemisphere)&&(!state.selectionOnly||options.selected(mesh.userData.regionIndex));mesh.material.color.set(scope.AtlasMerfishRegions.colour(plan,r.id,mesh.userData.hemisphere));mesh.material.opacity=plan.settings.opacity;mesh.material.transparent=plan.settings.opacity<.999;mesh.material.depthWrite=plan.settings.opacity>=.999;mesh.material.emissive.set('#000000');}this.shell.visible=false;this.merfishGeometry.regional=scope.AtlasMerfishRegions.summary(plan);}
      if(this.aavPlan?.enabled&&this.aavPlan.settings.brain!=='current'&&!scope.AtlasMerfishRegions?.active(this.merfishPlan)){for(const mesh of this.objects)mesh.visible=false;this.shell.visible=this.aavPlan.settings.brain==='shell';this.shell.material.opacity=.08;this.shell.material.depthWrite=false;}
      this.setSmoothing(state.smoothing3d??100);this.render();return this.objects.filter(mesh=>mesh.visible).length;
    }
    implantLabelsSVG(width,height,paperWidth=this.options?.state.paperWidth||183){
      const P=scope.AtlasImplantPublication;if(!P||!this.implantLabels?.length||this.implantPlan?.appearance?.style!=='publication')return null;
      const layout=P.projectLabels(this.implantLabels,this.camera,scope.THREE,width,height,this.implantPlan.appearance,paperWidth);this.implantLabelSummary={count:layout.rows.length,overlaps:layout.overlaps,crowded:layout.crowded,vector:true,fontPt:this.implantPlan.appearance.labelPt};return P.labelSVG(layout);
    }
    render(){
      if(!this.active)return;
      orientCamera(this.camera,this.pose);
      for(const marker of this.implantBillboards||[])marker.quaternion.copy(this.camera.quaternion);
      this.renderer.render(this.scene,this.camera);const width=this.host.clientWidth,height=this.host.clientHeight;if(width&&height&&this.labelOverlay){this.labelOverlay.setAttribute('viewBox',`0 0 ${width} ${height}`);const labels=this.implantLabelsSVG(width,height);this.labelOverlay.replaceChildren(...(labels?[labels]:[]));}
    }
    preset(name){this.pose=presetPose(name);this.render();this.commit();}
    async captureScene(width){
      const oldSize=new scope.THREE.Vector2();this.renderer.getSize(oldSize);const ratio=this.renderer.getPixelRatio(),oldAspect=this.camera.aspect,height=Math.round(width*.65),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      try{this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.render();canvas.getContext('2d').drawImage(this.renderer.domElement,0,0,width,height);}
      finally{this.renderer.setPixelRatio(ratio);this.renderer.setSize(oldSize.x,oldSize.y,false);this.camera.aspect=oldAspect;this.render();}
      return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('3D 场景编码失败')),'image/png'));
    }
    async capture(width,details){
      this.setSmoothing(details.state.smoothing3d??100);
      const oldSize=new scope.THREE.Vector2();this.renderer.getSize(oldSize);const pixelRatio=this.renderer.getPixelRatio();
      const scale=width/1200,stageHeight=Math.round(width*.65),top=Math.round(80*scale),bottom=Math.round(150*scale);
      const output=document.createElement('canvas');output.width=width;output.height=top+stageHeight+bottom;const context=output.getContext('2d');
      if(!details.state.transparent){context.fillStyle=details.state.background;context.fillRect(0,0,output.width,output.height);}
      this.renderer.setPixelRatio(1);this.renderer.setSize(width,stageHeight,false);this.camera.aspect=width/stageHeight;this.render();
      context.drawImage(this.renderer.domElement,0,top,width,stageHeight);
      this.renderer.setPixelRatio(pixelRatio);this.renderer.setSize(oldSize.x,oldSize.y);this.camera.aspect=oldSize.x/oldSize.y;this.render();
      context.fillStyle='#254438';context.font=`bold ${22*scale}px Arial`;context.fillText('Allen CCF 3D region surfaces',35*scale,32*scale);
      context.fillStyle='#6c7f73';context.font=`${13*scale}px Arial`;context.fillText('100-um mesh | Smoothing '+(details.state.smoothing3d??100)+'/200 | L/R anatomical sides | '+details.title,35*scale,58*scale);
      const y=top+stageHeight+32*scale;
      if(details.stops){
        const start=650*scale,length=420*scale,gradient=context.createLinearGradient(start,0,start+length,0);
        details.stops.forEach((colour,index)=>gradient.addColorStop(index/(details.stops.length-1),colour));context.fillStyle=gradient;context.fillRect(start,y,length,13*scale);
        context.fillStyle='#617367';context.font=`${13*scale}px Arial`;context.textAlign='center';details.range.forEach((value,index)=>context.fillText(Number(value.toPrecision(5)).toString(),start+length*index,y+35*scale));context.textAlign='left';
      }
      context.fillStyle='#617367';context.font=`${13*scale}px Arial`;context.fillText(details.filter,35*scale,y+16*scale);
      context.fillText('Display surfaces only; not for volumetry. 356/357 structures; c absent at 100 um. Not bregma.',35*scale,output.height-40*scale);
      context.fillText('Allen-CCF-2020 / 20230630 | '+details.state.projectName,35*scale,output.height-17*scale);
      return new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('3D PNG 编码失败')),'image/png'));
    }
    summary(){
      const visible=this.objects.filter(mesh=>mesh.visible);
      const regionalSurfaces=scope.AtlasMerfishRegions?.active(this.merfishPlan)?visible.map(mesh=>{const region=scope.MOUSE_ATLAS_DATA.regions[mesh.userData.regionIndex].id,entry=scope.AtlasMerfishRegions.entry(this.merfishPlan,region,mesh.userData.hemisphere);return{region,hemisphere:mesh.userData.hemisphere,value:entry?.value??null,n:entry?.n??0,colour:'#'+mesh.material.color.getHexString()};}):null;
      const geometrySample=visible.slice(0,8).map(mesh=>{
        const positions=mesh.geometry.getAttribute('position').array;
        return{regionIndex:mesh.userData.regionIndex,hemisphere:mesh.userData.hemisphere,strength:mesh.geometry.userData.smoothing.strength,positions:Array.from({length:12},(_,i)=>positions[Math.floor(i*(positions.length-1)/11)])};
      });
      return{implantLabels:this.implantLabelSummary||null,visibleMeshes:visible.length,regionalHeatmap:regionalSurfaces?{valued:regionalSurfaces.filter(r=>Number.isFinite(r.value)).length,missing:regionalSurfaces.filter(r=>!Number.isFinite(r.value)).length,samples:regionalSurfaces.filter(r=>Number.isFinite(r.value)).slice(0,8)}:null,shell:{visible:this.shell.visible,opacity:this.shell.material.opacity},parcellation:this.implantPlan?.enabled&&this.implantPlan.glass?{settings:structuredClone(this.implantPlan.parcellation),visibleRegions:[...new Set(visible.map(mesh=>scope.MOUSE_ATLAS_DATA.regions[mesh.userData.regionIndex].id))]}:null,smoothing:{strength:this.smoothingStrength,method:'Taubin reference interpolation',geometrySample},research:this.researchCounts||{},axesVisible:this.axesGroup.visible,visiblePlanes:this.planes.filter(plane=>plane.visible).map(plane=>plane.userData.orientation),hemispheres:{L:visible.filter(mesh=>mesh.userData.hemisphere==='L').length,R:visible.filter(mesh=>mesh.userData.hemisphere==='R').length},sample:visible.slice(0,8).map(mesh=>({regionIndex:mesh.userData.regionIndex,region:scope.MOUSE_ATLAS_DATA.regions[mesh.userData.regionIndex].id,hemisphere:mesh.userData.hemisphere,opacity:mesh.material.opacity,colour:'#'+mesh.material.color.getHexString()})),triangles:this.bundle.triangles,pose:structuredClone(this.pose),webgl:this.renderer.capabilities.isWebGL2?'WebGL2':'WebGL1',canvasWidth:this.renderer.domElement.width};
    }
  }
  scope.AtlasMeshViewer=Object.freeze({create:MeshViewer.create,initialPose,presetPose,orientCamera,toWorld,fromWorld,interpolatePositions,smoothingLabel});
})(window);
