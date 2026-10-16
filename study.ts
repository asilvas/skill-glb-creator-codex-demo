import './env';
import { Preview } from '@asilvas/glb-creator/preview';
import { buildMonster } from './create-monster';
import { resolve } from 'node:path';
import { TMP } from './meter';
const p=await Preview.create();try{
  const blender=process.argv.includes('--blender'),bytes=blender?new Uint8Array(await Bun.file(resolve(TMP,'blender.glb')).arrayBuffer()):await buildMonster();if(!blender)await Bun.write(resolve(TMP,'bun.glb'),bytes);console.log(await p.load(bytes));
  for(const [label,pose] of Object.entries({hero:{time:0,yaw:-.38,framing:'pose'},front:{time:0,yaw:0,framing:'pose'},side:{time:0,yaw:1.57,framing:'pose'},back:{time:0,yaw:3.52,framing:'pose'},windup:{time:14/30},impact:{time:19/30}})){
    const r=await p.frame({...pose,size:1024,capture:`textured-${blender?'blender-':''}v2-${label}.png`} as any);console.log(label,r.timing.totalMs.toFixed(1));
  }
}finally{await p.dispose();}
