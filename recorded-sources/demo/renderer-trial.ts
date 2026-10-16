import { Preview } from '../scripts/preview';
import { TMP } from './meter';
import { resolve } from 'node:path';
const backend=process.argv.includes('--rgl')?'rgl':'native';
const t=performance.now();let bytes:Uint8Array,buildMs=0;
if(process.argv.includes('--build')){const {buildMonster}=await import('./create-monster');const start=performance.now();bytes=await buildMonster();buildMs=performance.now()-start;}
else bytes=new Uint8Array(await Bun.file(resolve(TMP,'bun.glb')).arrayBuffer());
const initStart=performance.now(),p=await Preview.create(backend);const initMs=performance.now()-initStart;
try{
  const loadStart=performance.now();const asset=await p.load(bytes);const loadMs=performance.now()-loadStart;
  const frames=[];
  const poses=[{time:0},{time:14/30},{time:19/30},{time:0,yaw:Math.PI/2},{time:0,yaw:-Math.PI+Math.atan2(6,10)}];
  for(const pose of poses){
    const r=await p.frame({...pose,size:512});
    frames.push({...r.timing,bytes:r.bytes.length});
  }
  console.log(JSON.stringify({backend,buildMs,initMs,loadMs,asset,frames,bodyMs:performance.now()-t,bun:process.versions.bun}));
}finally{await p.dispose();}
