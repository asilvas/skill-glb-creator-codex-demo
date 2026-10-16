import './env';
import {resolve} from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {ROOT,TMP} from './paths';
const skill=resolve(ROOT,'../skill-glb-creator');
if(!existsSync(resolve(skill,'skills/glb-creator/SKILL.md')))throw Error('Clone https://github.com/asilvas/skill-glb-creator next to this repository, as ../skill-glb-creator.');
mkdirSync(TMP,{recursive:true});
for(const cwd of [skill,ROOT]){
  const p=Bun.spawn([process.execPath,'install','--cwd',cwd],{cwd,stdin:'ignore',stdout:'inherit',stderr:'inherit',windowsHide:true,env:{...process.env,BUN_INSTALL_CACHE_DIR:resolve(TMP,'cache')}});
  const code=await p.exited;if(code!==0)process.exit(code);
}
// Use a fresh resolver after installation; this process may have cached a missing package.
const smoke=Bun.spawn([process.execPath,'-e','import {Asset,Preview} from "@asilvas/glb-creator"; if(!Asset||!Preview)throw Error("Missing skill exports");'],{cwd:ROOT,stdout:'inherit',stderr:'inherit',windowsHide:true});
if(await smoke.exited!==0)process.exit(1);
console.log('Demo dependencies and local skill package are ready.');
