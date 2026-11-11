import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const path=new URL('./data/atlas-data.js',import.meta.url);
const context={window:{}};
vm.runInNewContext(await readFile(path,'utf8'),context);
const data=context.window.MOUSE_ATLAS_DATA;
const ontology=JSON.parse(await readFile(new URL('./data/allen_structure_tree.json',import.meta.url),'utf8'));
const nodes=[];
function visit(node,parentId=null,ancestors=[]){
  nodes.push({id:node.id,acronym:node.acronym,name:node.name,parentId,ancestors,colour:'#'+node.color_hex_triplet});
  for(const child of node.children||[])visit(child,node.id,[...ancestors,node.id]);
}
for(const node of ontology.msg)visit(node);
const byAcronym=new Map(nodes.map(node=>[node.acronym,node]));
for(const region of data.regions){
  const node=byAcronym.get(region.id.replace(/-unassigned$/,''));
  region.structureId=node?.id??null;
  region.ancestors=node?.ancestors??[];
}
data.version=2;data.ontology=nodes;
data.atlasId='allen-ccf-2020-20230630-structure357-100um';
data.fingerprint=createHash('sha256').update(JSON.stringify({source:data.source,regions:data.regions,planes:data.planes})).digest('hex');
data.coordinates={convention:'RAS',nativeOrientation:'PIR',midlinePixel:570,mlOffsetMm:-5.695,
  affine:[[0,0,.01,-5.695],[-.01,0,0,5.35],[0,-.01,0,5.22],[0,0,0,1]],
  note:'AP/DV: distance from CCF volume edge; ML: NIfTI RAS x. Not bregma.'};
await writeFile(path,'window.MOUSE_ATLAS_DATA='+JSON.stringify(data)+';\n');
console.log(JSON.stringify({regions:data.regions.length,ontology:nodes.length,matched:data.regions.filter(region=>region.structureId!==null).length,fingerprint:data.fingerprint}));
