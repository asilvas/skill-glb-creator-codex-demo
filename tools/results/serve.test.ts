import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {startResults} from './serve';
test('read-only server bundles locally, discovers new metrics, isolates malformed records and refuses hidden/traversal paths',async()=>{
  const root=mkdtempSync(resolve(tmpdir(),'glb-results-server-'));let server:Awaited<ReturnType<typeof startResults>>|undefined;
  try{
    mkdirSync(resolve(root,'experiments/good'),{recursive:true});mkdirSync(resolve(root,'experiments/bad'),{recursive:true});
    writeFileSync(resolve(root,'experiments/good/master.glb'),'test');
    writeFileSync(resolve(root,'experiments/good/experiment.json'),JSON.stringify({schemaVersion:1,id:'new',name:'API fixture',cohort:'API test',metrics:{quality:{value:10,unit:'points/10',scope:'test'},seconds:{value:20,unit:'s',scope:'whole-test'},bytes:{value:4,unit:'bytes'},newMetric:{value:123,unit:'widgets',scope:'widget-v1'}},views:[0,1,2,3].map(i=>({label:String(i),path:`experiments/good/view${i}.png`})),artifacts:{glb:'experiments/good/master.glb'}}));
    writeFileSync(resolve(root,'experiments/bad/experiment.json'),'notJSON');
    server=await startResults({root,port:0});const base=`http://127.0.0.1:${server.port}`;
    const page=await fetch(base);expect(page.status).toBe(200);expect(await page.text()).toContain('Asset Observatory');
    const js=await fetch(base+'/app.js');expect(js.status).toBe(200);expect(js.headers.get('Content-Type')).toContain('javascript');
    const data=await (await fetch(base+'/api/results')).json();expect(data.records.length).toBe(1);expect(data.issues.length).toBe(1);expect(data.records[0].metrics.qualityPerSec.value).toBe(.5);expect(data.metricCatalog.find(m=>m.key==='newMetric').valid).toBe(1);expect(data.records[0].artifacts.glb.available).toBe(true);
    expect((await fetch(base+'/api/results',{method:'POST'})).status).toBe(405);
    expect((await fetch(base+'/.git/config')).status).toBe(404);expect((await fetch(base+'/%2e%2e%5cprivate.json')).status).toBe(404);
    expect((await fetch(base+'/api/results',{headers:{Host:'attacker.invalid'}})).status).toBe(403);
    expect((await fetch(base+'/experiments/good/master.glb',{method:'HEAD'})).headers.get('Content-Type')).toBe('model/gltf-binary');
  }finally{server?.stop(true);if(dirname(resolve(root))!==resolve(tmpdir())||!resolve(root).startsWith(resolve(tmpdir(),'glb-results-server-')))throw Error('Unexpected fixture deletion target');rmSync(root,{recursive:true,force:true});}
},30000);
