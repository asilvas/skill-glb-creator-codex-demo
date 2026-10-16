import './env';
import {resolve} from 'node:path';
import {ROOT,TMP,referenceImage} from './paths';
import sharp from 'sharp';
import {Preview} from '@asilvas/glb-creator/preview';
const {dir}=await Bun.file(resolve(TMP,'latest-benchmark.json')).json(),run=await Bun.file(resolve(dir,'results.json')).json(),out=resolve(TMP,'report');
const median=(n:number[])=>{const a=[...n].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
const rows=(name:string)=>run.runs.filter((r:any)=>r.backend===name),blender=rows('blender'),bun=rows('native');
const wall={blender:median(blender.map((r:any)=>r.wallMs)),bun:median(bun.map((r:any)=>r.wallMs))},warm={blender:median(blender.flatMap((r:any)=>r.data.frames.slice(1).map((f:any)=>f.seconds*1000))),bun:median(bun.flatMap((r:any)=>r.data.frames.slice(1).map((f:any)=>f.totalMs)))};
const assets=Object.fromEntries(Object.entries(run.assets).map(([name,a]:[string,any])=>[name,{bytes:a.bytes,sha256:a.sha256,triangles:a.report.info.totalTriangleCount,vertices:a.report.info.totalVertexCount,textures:a.textures.length,errors:a.errors,warnings:a.warnings,clips:a.clips,joints:a.skins[0].joints.length}]));
const summary={date:run.finished,medianIterationMs:wall,medianWarmFrameMs:warm,speedup:wall.blender/wall.bun,assets,sourceTokens:run.sourceTokens,hardware:run.hardware,rgl:run.rgl,sourceHashes:run.sourceHashes,referenceSha256:run.referenceSha256,inputHashes:run.inputHashes,method:'Three alternating fresh-process build/export plus five 512px memory-frame trials. Blender skips optional .blend history and stops at Render Result; Bun includes readback and PNG encoding. Shared images and development excluded. Different renderers/exporters and unverified GPU selection.',costConclusion:'Runtime iteration only; lower total agent-token cost and matched-reference quality are not established.'};
await Bun.write(resolve(out,'performance.json'),JSON.stringify(summary,null,2));await Bun.write(resolve(out,'benchmark-results.json'),JSON.stringify(run,null,2));
await Bun.write(resolve(out,'renderer-failures.txt'),`rgl API\n${await Bun.file(resolve(dir,run.rgl.log)).text()}\nCLI\n${await Bun.file(resolve(dir,run.rgl.cliHelp.log)).text()}`);
const header=(label:string)=>Buffer.from(`<svg width="768" height="48"><rect width="100%" height="100%" fill="#252820"/><text x="20" y="32" font-family="sans-serif" font-size="22" fill="#f1ead7">${label}</text></svg>`),tiles:any[]=[];
for(const [i,label] of ['Original reference','Blender CLI','Bun + glTF Transform'].entries())tiles.push({input:header(label),left:i*768,top:0});
tiles.push({input:await sharp(referenceImage()).resize(768,768,{fit:'contain',background:'#d2c5ad'}).png().toBuffer(),left:0,top:48});
for(const [i,name] of ['blender','bun'].entries())tiles.push({input:await sharp(resolve(dir,`${name}-hero.png`)).resize(768,768).png().toBuffer(),left:(i+1)*768,top:48});
await sharp({create:{width:2304,height:816,channels:4,background:'#d2c5ad'}}).composite(tiles).png().toFile(resolve(out,'comparison.png'));
const p=await Preview.create();try{for(const name of ['blender','bun']){
  await p.load(new Uint8Array(await Bun.file(resolve(dir,`${name}.glb`)).arrayBuffer()));await p.frame({size:1024,time:0,yaw:-.38,framing:'pose',capture:resolve(out,`${name}-monster.png`)});
  const frames=[];for(let i=0;i<20;i++)frames.push(Buffer.from((await p.frame({size:384,time:i*1.2/20,format:'rgba'})).bytes));
  await sharp(Buffer.concat(frames),{raw:{width:384,height:384*20,channels:4,pageHeight:384}} as any).webp({loop:0,delay:60,quality:85}).toFile(resolve(out,`${name}-attack.webp`));
}}finally{await p.dispose();}
const reviews:any={};for(const name of ['blender','bun']){
  const file=Bun.file(resolve(TMP,'review',name,'validation.json'));if(!await file.exists())throw Error('Run bun run review before reporting');const v=await file.json();if(v.sha256!==run.assets[name].sha256)throw Error(`Review is stale for ${name}; rerun bun run review`);reviews[name]=v;
}await Bun.write(resolve(out,'validation.json'),JSON.stringify(reviews,null,2));
await Bun.write(resolve(out,'REPORT.md'),`# Reproduction run\n\n![Comparison](comparison.png)\n\nMedian Blender: ${(wall.blender/1000).toFixed(2)} s; Bun: ${(wall.bun/1000).toFixed(2)} s; speedup ${(wall.blender/wall.bun).toFixed(2)}×.\n\n${summary.method}\n\n${summary.costConclusion}\n`);
console.log(JSON.stringify({output:out,medianIterationMs:wall,speedup:summary.speedup}));
