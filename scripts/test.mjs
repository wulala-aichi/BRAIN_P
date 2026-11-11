import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),files=(await fs.readdir(new URL('qa/',root))).filter(f=>f.endsWith('.test.mjs')).sort();
const built=spawnSync(process.execPath,[fileURLToPath(new URL('build.mjs',root))],{stdio:'inherit',windowsHide:true});
if(built.status!==0)process.exit(built.status||1);
let failed=0;for(const file of files){const r=spawnSync(process.execPath,[fileURLToPath(new URL('qa/'+file,root))],{encoding:'utf8',timeout:60000,windowsHide:true});if(r.status!==0){failed++;console.error('FAIL '+file+'\n'+r.stdout+'\n'+r.stderr);}else console.log('PASS '+file);}
console.log(`${files.length-failed}/${files.length} test files passed`);process.exitCode=failed?1:0;
