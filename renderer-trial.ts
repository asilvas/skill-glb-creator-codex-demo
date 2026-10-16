import './env';
import {Preview} from '@asilvas/glb-creator/preview';
import {TMP} from './paths';
import {resolve} from 'node:path';
const backend=process.argv.includes('--rgl')?'rgl':'native',t=performance.now();let bytes:Uint8Array,buildMs=0;
if(process.argv.includes('--build')){const {buildMonster}=await import('./create-monster');const start=performance.now();bytes=await buildMonster();buildMs=performance.now()-start;}
else bytes=new Uint8Array(await Bun.file(resolve(TMP,'bun.glb')).arrayBuffer());
const initStart=performance.now(),p=backend==='native'?await Preview.create():await(await import('./rgl-preview')).createRglPreview(),initMs=performance.now()-initStart;
try{
  const loadStart=performance.now(),asset=await p.load(bytes),loadMs=performance.now()-loadStart,frames=[];
  for(const pose of [{time:0},{time:14/30},{time:19/30},{time:0,yaw:Math.PI/2},{time:0,yaw:-Math.PI+Math.atan2(6,10)}]){const r=await p.frame({...pose,size:512});frames.push({...r.timing,bytes:r.bytes.length});}
  console.log(JSON.stringify({backend,buildMs,initMs,loadMs,asset,frames,bodyMs:performance.now()-t,bun:process.versions.bun}));
}finally{await p.dispose();}
