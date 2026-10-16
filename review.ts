import './env';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {ROOT,TMP} from './paths';
import {validate} from '@asilvas/glb-creator/validate';
import {runBlender} from './blender-cli';
for(const name of ['blender','bun']){
  const path=existsSync(resolve(TMP,`${name}.glb`))?resolve(TMP,`${name}.glb`):resolve(ROOT,`${name}-monster.glb`),v=await validate(new Uint8Array(await Bun.file(path).arrayBuffer()));
  if(v.errors)throw Error(`${name} has Khronos errors`);
  const r=await runBlender({script:resolve(ROOT,'review.py'),log:resolve(TMP,'review',name,'blender.log'),result:resolve(TMP,'review',name,'result.json'),job:{glb:path}});
  await Bun.write(resolve(TMP,'review',name,'validation.json'),JSON.stringify({sha256:v.sha256,khronos:v,blender:r.result},null,2));console.log(JSON.stringify({name,errors:v.errors,warnings:v.warnings,...r.result}));
}
