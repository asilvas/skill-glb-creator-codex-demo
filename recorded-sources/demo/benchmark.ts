import { resolve } from 'node:path';
import { readFileSync,mkdirSync,copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ROOT,TMP,usage,referenceImage } from './meter';
import { ensureDemoMaterials } from './materials';
import { validate } from '../scripts/validate';
import { buildMonster } from './create-monster';
import { Preview } from '../scripts/preview';
// Housekeeping is tested separately and excluded from measured GPU work.
process.env.GLB_CREATOR_CLEANUP='off';
const dir=resolve(TMP,`bench-${new Date().toISOString().replace(/[:.]/g,'-')}`);mkdirSync(dir,{recursive:true});
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const files=['package.json','bun.lock','scripts/geometry.ts','scripts/preview.ts','scripts/cleanup.ts','scripts/clean.ts','scripts/paths.ts','demo/create-monster.ts','demo/materials.ts','demo/baseline.py','demo/blender-preview.py','demo/blender.ts','demo/renderer-trial.ts','demo/benchmark.ts'];
const textureFolder=await ensureDemoMaterials();
const hashes=Object.fromEntries(files.map(f=>[f,sha(readFileSync(resolve(ROOT,f)))]));
const report:any={started:new Date().toISOString(),bun:process.versions.bun,platform:process.platform,arch:process.arch,cleanup:'disabled during measured trials; detached worker tested separately',sourceHashes:hashes,referenceSha256:sha(readFileSync(referenceImage())),runs:[],tokenStart:usage()};
report.materialInputs=await Bun.file(resolve(textureFolder,'materials.json')).json();
const inputFiles=[resolve(textureFolder,'materials.json'),...Object.values(report.materialInputs.materials).flatMap((m:any)=>['source','baseColor','normal','roughness'].map(k=>resolve(textureFolder,m[k])))];
report.inputHashes=Object.fromEntries(inputFiles.map(path=>[path,sha(readFileSync(path))]));
for(const f of files){await Bun.write(resolve(dir,'sources',f),readFileSync(resolve(ROOT,f)));}
async function command(name:string,args:string[]){
  const start=performance.now();const p=Bun.spawn([process.execPath,...args],{cwd:ROOT,stdout:'pipe',stderr:'pipe',windowsHide:true});
  const timer=setTimeout(()=>p.kill(),120000);
  const [stdout,stderr,exitCode]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);clearTimeout(timer);
  const wallMs=performance.now()-start;await Bun.write(resolve(dir,`${name}.log`),stdout+'\n'+stderr);
  return {name,wallMs,exitCode,pid:p.pid,log:resolve(dir,`${name}.log`),stdout,stderr};
}
// Serial, alternating order; each row starts a fresh process. All 5 frames render to memory.
for(let i=0;i<3;i++){
  const order=i%2===0?['blender','native']:['native','blender'];
  for(const backend of order){
    const r=backend==='blender'?await command(`${backend}-${i}`,['demo/blender.ts','--iteration','--memory']):await command(`${backend}-${i}`,['demo/renderer-trial.ts','--build']);
    if(r.exitCode!==0)throw Error(`${backend} failed: ${r.stderr.slice(-1000)}`);
    const data=JSON.parse(r.stdout.trim().split('\n').at(-1)!);
    report.runs.push({backend,index:i,wallMs:r.wallMs,exitCode:r.exitCode,log:r.log,data});
    console.log(`${backend} trial ${i+1}: ${r.wallMs.toFixed(1)} ms`);
  }
}
// Both candidates get actual executable tests. rgl runs isolated because native loading can crash Bun.
const rgl=await command('rgl-api',['demo/renderer-trial.ts','--rgl']);
const cli=await command('rgl-cli-help',['node_modules/@rendergl/headless-three-webgpu-cli/dist/index.js','--help']);
report.rgl={exitCode:rgl.exitCode,wallMs:rgl.wallMs,log:rgl.log,summary:rgl.exitCode===0?JSON.parse(rgl.stdout.trim().split('\n').at(-1)!):'Bun native Dawn binding crashed before first frame',cliHelp:{exitCode:cli.exitCode,log:cli.log}};
await Bun.write(resolve(TMP,'bun.glb'),await buildMonster());
report.assets={};
for(const name of ['blender','bun']){
  const b=new Uint8Array(await Bun.file(resolve(TMP,`${name}.glb`)).arrayBuffer());report.assets[name]=await validate(b);
  await Bun.write(resolve(dir,`${name}-validation.json`),JSON.stringify(report.assets[name],null,2));
  copyFileSync(resolve(TMP,`${name}.glb`),resolve(dir,`${name}.glb`));
}
const p=await Preview.create();
try{
  for(const name of ['blender','bun']){
    await p.load(new Uint8Array(await Bun.file(resolve(TMP,`${name}.glb`)).arrayBuffer()));
    for(const [label,pose] of Object.entries({hero:{time:0,yaw:-.38,framing:'pose'},windup:{time:14/30},impact:{time:19/30},side:{yaw:Math.PI/2,framing:'pose'},back:{yaw:Math.PI+Math.atan2(6,10),framing:'pose'}}))await p.frame({...pose,capture:resolve(dir,`${name}-${label}.png`)} as any);
  }
  // Separate memory-vs-file overhead on the same pose, including analysis cost explicitly.
  report.memoryVsDisk=[];
  for(let i=0;i<10;i++){for(const capture of [undefined,resolve(dir,'optional-capture.png')]){const r=await p.frame({time:.3,analyze:true,capture});report.memoryVsDisk.push({capture:!!capture,...r.timing});}}
}finally{await p.dispose();}
const {getEncoding}=await import('../node_modules/js-tiktoken/dist/index.js');const encoding=getEncoding('o200k_base');
const tokenCount=(names:string[])=>names.reduce((n,f)=>n+encoding.encode(readFileSync(resolve(ROOT,f),'utf8')).length,0);
report.sourceTokens={encoding:'o200k_base (source proxy, not billed tokens)',blender:tokenCount(['demo/baseline.py','demo/blender-preview.py']),bun:tokenCount(['scripts/geometry.ts','demo/create-monster.ts']),sharedPreview:tokenCount(['scripts/preview.ts']),sharedMaterials:tokenCount(['demo/materials.ts'])};
report.tokenEnd=usage();report.finished=new Date().toISOString();
for(const f of files)if(sha(readFileSync(resolve(ROOT,f)))!==hashes[f])throw Error(`Source changed during benchmark: ${f}`);
for(const path of inputFiles)if(sha(readFileSync(path))!==report.inputHashes[path])throw Error(`Texture input changed during benchmark: ${path}`);
await Bun.write(resolve(dir,'results.json'),JSON.stringify(report,null,2));await Bun.write(resolve(TMP,'latest-benchmark.json'),JSON.stringify({dir},null,2));
console.log(`Results: ${resolve(dir,'results.json')}`);
