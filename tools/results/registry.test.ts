import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {loadResults} from './registry';
import {syntheticLicenseAudit} from './test-fixtures';
test('a clean data directory loads empty; optional runtime policy certifies only its explicitly audited routes',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'results-optional-data-')),write=(p:string,v:any)=>{mkdirSync(dirname(resolve(root,p)),{recursive:true});writeFileSync(resolve(root,p),typeof v==='string'?v:JSON.stringify(v));};
 try{
  const empty=await loadResults(root,{includeHistory:true});expect(empty.records).toEqual([]);expect(empty.issues).toEqual([]);expect(empty.reviewHistory?.rounds).toEqual([]);
  write('experiments/fixture/experiment.json',{schemaVersion:1,id:'fixture',provenance:{licenseAuditFamily:'procedural-authoring'},views:[0,1,2,3].map(i=>({path:`experiments/fixture/view-${i}.png`}))});
  expect((await loadResults(root)).records[0].license?.label).toBe('Restricted License');
  write('results/license-audit.json',syntheticLicenseAudit());expect((await loadResults(root)).records[0].license?.label).toBe('FREE');
  write('results/license-audit.json','{malformed');const bad=await loadResults(root);expect(bad.records[0].license?.label).toBe('Restricted License');expect(bad.issues.some(i=>i.source==='results/license-audit.json')).toBe(true);
 }finally{if(dirname(root)!==resolve(tmpdir())||!root.startsWith(resolve(tmpdir(),'results-optional-data-')))throw Error('Unexpected fixture cleanup');rmSync(root,{recursive:true,force:true});}
});
