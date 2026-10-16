import './env';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cpus,release} from 'node:os';
import {ROOT,TMP,usage,referenceImage} from './meter';
import {ensureDemoMaterials} from './materials';
import {validate} from '@asilvas/glb-creator/validate';
import {buildMonster} from './create-monster';
import {Preview} from '@asilvas/glb-creator/preview';
process.env.GLB_CREATOR_CLEANUP='off';
const dir=resolve(TMP,`bench-${new Date().toISOString().replace(/[:.]/g,'-')}`);mkdirSync(dir,{recursive:true});
const skill=resolve(dirname(fileURLToPath(import.meta.resolve('@asilvas/glb-creator/geometry'))),'..');
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const paths=Object.fromEntries([
  ...['package.json','bun.lock','scripts/geometry.ts','scripts/preview.ts','scripts/cleanup.ts','scripts/clean.ts','scripts/paths.ts','scripts/validate.ts'].map(f=>[`skill/${f}`,resolve(skill,f)]),
  ...['package.json','bun.lock','create-monster.ts','materials.ts','baseline.py','blender-preview.py','blender.ts','blender-cli.ts','stage.py','renderer-trial.ts','rgl-preview.ts','benchmark.ts','env.ts','paths.ts','meter.ts'].map(f=>[`demo/${f}`,resolve(ROOT,f)])
]);
const textureFolder=await ensureDemoMaterials(),hashes=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,sha(readFileSync(path))]));
const report:any={format:'glbCreatorStandaloneBenchmarkV1',started:new Date().toISOString(),bun:process.versions.bun,platform:process.platform,arch:process.arch,hardware:{cpu:cpus()[0]?.model,os:release(),chosenGpu:'not independently verified'},cleanup:'disabled during measured trials; detached cleanup tested separately',sourceHashes:hashes,referenceSha256:sha(readFileSync(referenceImage())),runs:[],tokenStart:usage()};
report.materialInputs=await Bun.file(resolve(textureFolder,'materials.json')).json();
const inputs=[resolve(textureFolder,'materials.json'),...Object.values(report.materialInputs.materials).flatMap((m:any)=>['source','baseColor','normal','roughness'].map(k=>resolve(textureFolder,m[k])))];
report.inputHashes=Object.fromEntries(inputs.map(path=>[relative(ROOT,path).replaceAll('\\','/'),sha(readFileSync(path))]));
for(const [key,path] of Object.entries(paths))await Bun.write(resolve(dir,'sources',key),readFileSync(path));
async function command(name:string,args:string[]){
  // Blender's own timeout must fire first so it can reap its exact child PID.
  const start=performance.now(),p=Bun.spawn([process.execPath,...args],{cwd:ROOT,stdout:'pipe',stderr:'pipe',stdin:'ignore',windowsHide:true}),timer=setTimeout(()=>p.kill(),300000);
  const [stdout,stderr,exitCode]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);clearTimeout(timer);
  await Bun.write(resolve(dir,`${name}.log`),stdout+'\n'+stderr);return {name,wallMs:performance.now()-start,exitCode,pid:p.pid,stdout,stderr,log:`${name}.log`};
}
for(let i=0;i<3;i++)for(const backend of i%2===0?['blender','native']:['native','blender']){
  const r=backend==='blender'?await command(`${backend}-${i}`,['blender.ts','--iteration','--memory']):await command(`${backend}-${i}`,['renderer-trial.ts','--build']);
  if(r.exitCode!==0)throw Error(`${backend} failed; see ${resolve(dir,r.log)}\n${r.stderr.slice(-1000)}`);
  report.runs.push({backend,index:i,wallMs:r.wallMs,exitCode:r.exitCode,log:r.log,data:JSON.parse(r.stdout.trim().split('\n').at(-1)!)});console.log(`${backend} trial ${i+1}: ${r.wallMs.toFixed(1)} ms`);
}
await Bun.write(resolve(TMP,'bun.glb'),await buildMonster());
const rgl=await command('rgl-api',['renderer-trial.ts','--rgl']),cli=await command('rgl-cli-help',['node_modules/@rendergl/headless-three-webgpu-cli/dist/index.js','--help']);
report.rgl={exitCode:rgl.exitCode,wallMs:rgl.wallMs,log:rgl.log,summary:rgl.exitCode===0?JSON.parse(rgl.stdout.trim().split('\n').at(-1)!):'Backend exited before first frame; inspect its log',cliHelp:{exitCode:cli.exitCode,log:cli.log}};
report.assets={};
for(const name of ['blender','bun']){const b=new Uint8Array(await Bun.file(resolve(TMP,`${name}.glb`)).arrayBuffer());report.assets[name]=await validate(b);if(report.assets[name].errors)throw Error(`${name} has Khronos errors`);await Bun.write(resolve(dir,`${name}-validation.json`),JSON.stringify(report.assets[name],null,2));copyFileSync(resolve(TMP,`${name}.glb`),resolve(dir,`${name}.glb`));}
const p=await Preview.create();try{
  for(const name of ['blender','bun']){
    await p.load(new Uint8Array(await Bun.file(resolve(TMP,`${name}.glb`)).arrayBuffer()));
    for(const [label,pose] of Object.entries({hero:{time:0,yaw:-.38,framing:'pose'},windup:{time:14/30},impact:{time:19/30},side:{yaw:Math.PI/2,framing:'pose'},back:{yaw:Math.PI+.54,framing:'pose'}}))await p.frame({...pose,capture:resolve(dir,`${name}-${label}.png`)} as any);
  }
  report.memoryVsDisk=[];for(let i=0;i<10;i++)for(const capture of [undefined,resolve(dir,'optional-capture.png')]){const r=await p.frame({time:.3,analyze:true,capture});report.memoryVsDisk.push({capture:!!capture,...r.timing});}
}finally{await p.dispose();}
const {getEncoding}=await import('js-tiktoken'),encoding=getEncoding('o200k_base'),tokens=(names:string[])=>names.reduce((n,f)=>n+encoding.encode(readFileSync(paths[f],'utf8')).length,0);
report.sourceTokens={encoding:'o200k_base (source proxy, not billed usage)',blender:tokens(['demo/baseline.py','demo/blender-preview.py']),bun:tokens(['skill/scripts/geometry.ts','demo/create-monster.ts']),sharedPreview:tokens(['skill/scripts/preview.ts']),sharedMaterials:tokens(['demo/materials.ts'])};
report.tokenEnd=usage();report.finished=new Date().toISOString();
for(const [key,path] of Object.entries(paths))if(sha(readFileSync(path))!==hashes[key])throw Error(`Measured source changed ${key}`);
for(const path of inputs)if(sha(readFileSync(path))!==report.inputHashes[relative(ROOT,path).replaceAll('\\','/')])throw Error(`Input changed ${path}`);
await Bun.write(resolve(dir,'results.json'),JSON.stringify(report,null,2));await Bun.write(resolve(TMP,'latest-benchmark.json'),JSON.stringify({dir},null,2));console.log(`Results: ${resolve(dir,'results.json')}`);
