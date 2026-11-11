import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {inflateSync} from 'node:zlib';
const scope = {window:{}};
runInNewContext(await readFile(new URL('../data/atlas-data.js',import.meta.url),'utf8'),scope);
const data = scope.window.MOUSE_ATLAS_DATA;
assert.equal(data.regions.length,357);
const expected = {coronal:132,sagittal:114,horizontal:80};
let regionsChecked = 0;
for (const [orientation,plane] of Object.entries(data.planes)) {
  assert.equal(plane.slices.length,expected[orientation]);
  for (const record of plane.slices) {
    const payload = JSON.parse(inflateSync(Buffer.from(record.packed,'base64')).toString('utf8'));
    assert.equal(payload.regions.length,record.count);
    for (const [regionIndex,path,anchor,area] of payload.regions) {
      assert(Number.isInteger(regionIndex) && regionIndex>=0 && regionIndex<data.regions.length);
      assert.match(path,/^M/); assert.match(path,/Z$/); assert.match(path,/^[MHVLZ0-9,\-]+$/);
      assert(Array.isArray(anchor) && anchor.length===2);
      assert(anchor[0]>=0 && anchor[0]<=plane.width && anchor[1]>=0 && anchor[1]<=plane.height);
      assert(area>0);
      regionsChecked++;
    }
  }
}
assert.notEqual(data.regions.find(region=>region.id==='CA1').name,'CA1');
assert.equal(data.planes.coronal.slices.find(record=>record.position===6.8).count,85);
for (const network of data.networks) {
  assert.equal(network.values.length,data.regions.length);
  assert(network.values.every(value=>value===null || (value>=0 && value<=1)));
}
const utilities = {Uint8Array,DataView};
runInNewContext(await readFile(new URL('../src/utils.js',import.meta.url),'utf8'),utilities);
const utils = utilities.AtlasUtils;
assert.equal(utils.crc32(Buffer.from('123456789')),0xcbf43926);
assert.equal(utils.networkColour(0),'#e4e7e8');
assert.equal(utils.networkColour(1),'#0e5964');
assert.equal(utils.networkColour(.5),'#72aaa8');
assert.equal(utils.networkColour(null),'#e0e3e4');
assert.equal(utils.grayColour('#ffffff'),'#ffffff');
const fixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
for(const dpi of [150,300,600]) {
  const output = utils.withPngDpi(fixture,dpi);
  let offset=8, densityCount=0;
  while(offset+12<=output.length) {
    const length=new DataView(output.buffer,offset,4).getUint32(0);
    const type=Buffer.from(output.subarray(offset+4,offset+8)).toString('ascii');
    if(type==='pHYs') {
      densityCount++;
      assert.equal(new DataView(output.buffer,offset+8,4).getUint32(0),Math.round(dpi/.0254));
      assert.equal(new DataView(output.buffer,offset+17,4).getUint32(0),utils.crc32(output.subarray(offset+4,offset+17)));
    }
    offset+=length+12;
  }
  assert.equal(densityCount,1);
}
runInNewContext(await readFile(new URL('../vendor/papaparse.min.js',import.meta.url),'utf8'),utilities);
runInNewContext(await readFile(new URL('../src/custom-values.js',import.meta.url),'utf8'),utilities);
const values = utilities.AtlasValues;
const parsed = values.parseCSV('region,value\nCA1,2.5\nDG,-1\nMOp,0\nUnknown,3\nca1,4\nSSp-bfd,wrong\nCA3,NA','region',data.regions,utilities.Papa);
assert.equal(parsed.patch.CA1,4);
assert.equal(parsed.patch.DG,-1);
assert.equal(parsed.patch.MOp,0);
assert.equal(parsed.patch.CA3,null);
assert.equal(parsed.unknown.length,1);
assert.equal(parsed.invalid.length,1);
assert.equal(parsed.duplicates,1);
const ca1 = data.regions.find(region=>region.id==='CA1');
assert.equal(values.resolvedValue(ca1,{CA1:2},{[ca1.family]:1}),2);
assert.equal(values.resolvedValue(ca1,{}, {[ca1.family]:1}),1);
assert.equal(values.resolvedValue(ca1,{},{}),null);
assert.equal(values.valueColour(null,-1,1,'viridis'),'#e0e3e4');
assert.equal(values.valueColour(-1,-1,1,'diverging'),'#2166ac');
assert.equal(values.valueColour(0,-1,1,'diverging'),'#f7f7f7');
assert.equal(values.valueColour(1,-1,1,'diverging'),'#b2182b');
assert.deepEqual([...values.valueRange(data.regions,{CA1:-2,DG:3,MOp:0},{},true,0,1)],[-2,3]);
assert.deepEqual([...values.valueRange(data.regions,{CA1:5},{},true,0,1)],[4.5,5.5]);
assert.deepEqual([...values.valueRange(data.regions,{CA1:-2},{},false,-3,3)],[-3,3]);
assert.throws(()=>values.parseCSV('region,family,value\nCA1,HPF,2','family',data.regions,utilities.Papa),/脑区赋值文件/);
const fullNamesCSV=utilities.Papa.unparse([{region:ca1.name,value:7}]);
assert.equal(values.parseCSV(fullNamesCSV,'region',data.regions,utilities.Papa).patch.CA1,7);
console.log(JSON.stringify({status:'ok',slices:326,regions:data.regions.length,regionsChecked,
  fullNames:data.regions.filter(region=>region.name!==region.id).length,
  labelAnchors:regionsChecked,customValues:'passed',csvImport:'passed',networkLayers:data.networks.length,pngDpi:[150,300,600]}));
