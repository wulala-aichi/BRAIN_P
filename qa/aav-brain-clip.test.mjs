import fs from 'node:fs/promises';
import vm from 'node:vm';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
class Element {constructor(tag){this.tagName=tag;this.attributes={};this.children=[];}get id(){return this.attributes.id;}setAttribute(k,v){this.attributes[k]=String(v);}append(n){this.children.push(n);}}
const context={window:{},document:{createElementNS:(_,tag)=>new Element(tag)}};
vm.runInNewContext(await fs.readFile(new URL('../src/aav-raster.js',import.meta.url),'utf8'),context);
const R=context.window.AtlasAavRaster;
assert.equal(R.settings().background,'allen');
const outer='M0,0H10V10H0Z',hole='M3,3H7V7H3Z';
assert.equal(R.brainContours(outer+hole).length,2);
const group=new Element('g'),image=new Element('image');R.clipAnatomy(group,image,outer+hole);
const clip=group.children[0].children[0];assert.equal(clip.children.length,2);assert.equal(clip.children[0].attributes.d,outer);assert.equal(clip.children[1].attributes.d,hole);assert.equal(clip.attributes.clipPathUnits,'userSpaceOnUse');assert.equal(image.attributes['clip-path'],'url(#'+clip.attributes.id+')');
const empty=new Element('g'),outside=new Element('image');R.clipAnatomy(empty,outside,'');assert.equal(empty.children[0].children[0].children.length,0);assert.notEqual(outside.attributes['clip-path'],image.attributes['clip-path']);
const signalGroup=new Element('g'),signal=new Element('image');const reference=R.clipAnatomy(signalGroup,signal,outer,'signal');assert.equal(signal.attributes['clip-path'],reference);assert.equal(signal.attributes['data-signal-mask'],'allen-anatomical-silhouette');assert(!('data-background-mask' in signal.attributes));
const atlas={window:{}};vm.runInNewContext(await fs.readFile(new URL('../data/atlas-data.js',import.meta.url),'utf8'),atlas);
let tested=0;for(const [orientation,plane] of Object.entries(atlas.window.MOUSE_ATLAS_DATA.planes))for(const slice of plane.slices){const payload=JSON.parse(zlib.inflateSync(Buffer.from(slice.packed,'base64'))),parts=R.brainContours(payload.outline);assert.equal(parts.join(''),payload.outline,`${orientation} ${slice.position}: all contours preserved`);tested++;}
const research=await fs.readFile(new URL('../src/research-ui.js',import.meta.url),'utf8');assert(research.includes('aav?.append2D(group,{orientation,position,plane,payload})'));
const ui=await fs.readFile(new URL('../src/aav-ui.js',import.meta.url),'utf8');assert(ui.includes("R.clipAnatomy(group,node,view.payload?.outline,'signal')"));
console.log(JSON.stringify({status:'ok',allAtlasSlices:tested,defaultWholeBrain:true,internalHolesFilled:true,uniqueClipIds:true,emptySliceClipped:true,signalMask:true,legacySignalMask:true}));
