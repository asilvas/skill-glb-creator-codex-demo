import './env';
import {resolve,relative,isAbsolute} from 'node:path';
import {copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {ROOT,TMP} from './paths';
const {dir}=await Bun.file(resolve(TMP,'latest-benchmark.json')).json();
const target=resolve(ROOT,process.argv.find(a=>a.startsWith('--out-dir='))?.slice(10)??'.'),relativeTarget=relative(ROOT,target);if(relativeTarget.startsWith('..')||isAbsolute(relativeTarget))throw Error('Retention must stay inside this repository');mkdirSync(target,{recursive:true});
const pairs=[...['blender','bun'].map(n=>[resolve(dir,`${n}.glb`),`${n}-monster.glb`]),...['performance.json','benchmark-results.json','validation.json','renderer-failures.txt','comparison.png','blender-monster.png','bun-monster.png','blender-attack.webp','bun-attack.webp'].map(n=>[resolve(TMP,'report',n),n])];
const run=await Bun.file(resolve(dir,'results.json')).json();for(const key of Object.keys(run.sourceHashes))pairs.push([resolve(dir,'sources',key),`recorded-sources/${key}`]);
for(const [from,name] of pairs){const to=resolve(target,name),r=relative(target,to);if(!r||r.startsWith('..')||isAbsolute(r)||!existsSync(from))throw Error(`Missing or unsafe retained file: ${from}`);mkdirSync(resolve(to,'..'),{recursive:true});copyFileSync(from,to);}
console.log(`Retained this run in ${target}. Update README measurements if publishing the new results.`);
