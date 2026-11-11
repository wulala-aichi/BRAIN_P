import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
const output=await fs.readFile(new URL('../dist/index.html',import.meta.url),'utf8');
for(const text of [source,output]){
  assert(!text.includes('direction-label'));
  assert(!text.includes('const directionLabels='));
  assert(text.includes('addRegionNames(group, payload'));
  assert(text.includes('const label = coordinate(records[index],true,orientation)'));
  assert(text.includes('"data-scale-mm": 1'));
}
console.log(JSON.stringify({status:'ok',twoDOrientationLetters:'removed from source and built HTML',regionNamesCoordinatesAndScale:'preserved'}));
