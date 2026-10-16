import './env';
import {resolve,relative,isAbsolute,basename} from 'node:path';
import {mkdirSync,existsSync,unlinkSync,readFileSync,appendFileSync} from 'node:fs';
import {setPriority,constants} from 'node:os';
import {createHash} from 'node:crypto';
import {ROOT,TMP} from './paths';
export function blenderExe(){
  const configured=process.env.BLENDER_BIN;
  const exe=configured??(process.platform==='win32'&&existsSync('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')?'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe':Bun.which('blender'));
  if(!exe)throw Error('Install Blender 5.2 and set BLENDER_BIN to its executable');
  if(/blender-launcher\.exe$/i.test(exe))throw Error('Use blender.exe, not the detached Blender launcher');return exe;
}
function scratch(path:string){const p=resolve(path),r=relative(TMP,p);if(!r||r.startsWith('..')||isAbsolute(r))throw Error(`Output must be under tmp/: ${p}`);mkdirSync(resolve(p,'..'),{recursive:true});return p;}
export async function runBlender(o:{script:string,log:string,result:string,env?:Record<string,string>,job?:unknown,timeoutS?:number}){
  const exe=blenderExe(),log=scratch(o.log),result=scratch(o.result),id=`${Date.now()}-${crypto.randomUUID()}`,folder=resolve(TMP,'blender-user');
  for(const name of ['config','scripts','datafiles'])mkdirSync(resolve(folder,name),{recursive:true});
  const probe=Bun.spawn([exe,'--version'],{stdout:'pipe',stderr:'pipe',windowsHide:true});
  const [banner,probeErr,probeCode]=await Promise.all([new Response(probe.stdout).text(),new Response(probe.stderr).text(),probe.exited]);
  const version=banner.match(/Blender\s+(\d+\.\d+[^\s]*)/)?.[1];if(probeCode!==0||!version)throw Error(`Blender version probe failed: ${probeErr}`);
  if(!version.startsWith('5.2')&&process.env.GLB_DEMO_ALLOW_BLENDER_VERSION!=='1')throw Error(`Blender ${version} differs from measured 5.2; set GLB_DEMO_ALLOW_BLENDER_VERSION=1 to record a different version`);
  if(existsSync(result))unlinkSync(result);
  const jobPath=scratch(resolve(TMP,'jobs',`${id}.json`));if(o.job)await Bun.write(jobPath,JSON.stringify(o.job));
  const env={...process.env,...o.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',BLENDER_USER_RESOURCES:folder,PB_BLENDER_RESULT:result,...(o.job?{PB_BLENDER_JOB:jobPath}:{})};
  const start=performance.now(),p=Bun.spawn([exe,'--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',resolve(o.script)],{cwd:ROOT,env,stdin:'ignore',stdout:'pipe',stderr:'pipe',windowsHide:true});
  const active=scratch(resolve(TMP,'active-blender',`${p.pid}.json`));await Bun.write(active,JSON.stringify({pid:p.pid,parentPid:process.pid,script:resolve(o.script),started:new Date().toISOString()}));
  let priority='default';try{setPriority(p.pid,constants.priority.PRIORITY_BELOW_NORMAL);priority='below-normal';}catch{}
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;p.kill();},(o.timeoutS??240)*1000);
  const [stdout,stderr,exitCode]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);clearTimeout(timer);unlinkSync(active);
  await Bun.write(log,stdout+'\n'+stderr);const seconds=(performance.now()-start)/1000;
  const receipt={time:new Date().toISOString(),pid:p.pid,exe,version,priority,script:basename(o.script),scriptSha256:createHash('sha256').update(readFileSync(o.script)).digest('hex'),exitCode,timedOut,seconds,log:relative(ROOT,log),result:relative(ROOT,result)};
  appendFileSync(scratch(resolve(TMP,'blender-runs.jsonl')),JSON.stringify(receipt)+'\n');
  if(exitCode!==0||timedOut||!existsSync(result))throw Error(`Blender job failed; inspect ${log} (exit ${exitCode}, timeout ${timedOut})`);
  return {ok:true,seconds,exitCode,result:await Bun.file(result).json(),receipt};
}
