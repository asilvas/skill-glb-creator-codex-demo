import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {normalize,comparisonKey} from './model';
import {loadResults} from './registry';
import {applyQualityAssessments} from './quality-assessments';
import {fmt,metricCard,qualityNotice,resultsCSV,resultsTable,selectedModel} from './presentation';
const H='a'.repeat(64),OTHER='b'.repeat(64),REF='c'.repeat(64),rubric='powerhouse-static-v1';
const assessment=(ceiling:any=7)=>({schemaVersion:1,assessments:[{id:'human-feedback',kind:'human-upper-bound',assetSHA256s:[H],ceiling,rubric,referenceSHA256:REF,source:'user-feedback-2026-10-22',feedback:'At best 7; the judge estimate is not credible.',outcome:'rejected-for-candidate-consideration'}]});
function row(hash=H){return normalize({schemaVersion:1,id:'asset',name:'Same name',status:'reviewed-candidate-minimum-met-static-only',metrics:{quality:{value:8.166666666666666,unit:'points/10',scope:rubric,source:'reviews/round-23/quality.json'},qualityMin:{value:8,unit:'points/10',scope:rubric},qualityMax:{value:8.4,unit:'points/10',scope:rubric},bytes:{value:1e6,unit:'bytes'},seconds:{value:10,unit:'s',scope:'fixture'}},provenance:{glbSHA256:hash,referenceSHA256:REF},artifacts:{glb:'fixture.glb'}},'fixture.json');}
test('exact binary rejection preserves raw model votes and withholds ordinary quality and ratios',()=>{
 const r=row(),before=JSON.stringify(r),other=row(OTHER);applyQualityAssessments([r,other],assessment());
 expect(r.status).toBe('human-rejected');expect(r.qualityAssessment).toMatchObject({status:'human-rejected',candidateEligible:false,originalStatus:'reviewed-candidate-minimum-met-static-only',recordedModelScore:8.166666666666666});
 expect(r.metrics.modelQuality.value).toBe(8.166666666666666);expect(r.metrics.modelQualityMin.value).toBe(8);expect(r.metrics.modelQualityMax.value).toBe(8.4);
 for(const key of ['quality','qualityMin','qualityMax','qualityPerMB','qualityPerSec']){expect(r.metrics[key].value).toBeNull();expect(r.metrics[key].reason).toContain('Human rejects');}
 expect(r.metrics.humanQualityCeiling).toMatchObject({value:7,bound:'upper'});expect(fmt(r.metrics.humanQualityCeiling,'humanQualityCeiling')).toBe('≤7');expect(comparisonKey(r,'bytes','humanQualityCeiling')).toBeNull();expect(r.metrics.qualityPerMB.value).not.toBe(7);expect(r.metrics.qualityPerSec.value).not.toBe(.7);
 expect(other.metrics.quality.value).toBe(8.166666666666666);expect(other.metrics.humanQualityCeiling).toBeUndefined();expect(other.qualityAssessment?.status).toBe('unvalidated-model-estimate');expect(JSON.parse(before).metrics.quality.value).toBe(8.166666666666666);
});
test('frozen historical binary identity wins over current ancestry, names and local replacement',()=>{
 const matched=row(OTHER),different=row(H);matched.history={expectedGLBSHA256:H,identityMatched:false} as any;different.history={expectedGLBSHA256:OTHER,identityMatched:true} as any;
 const future=row(OTHER);future.parentId='asset';future.provenance.sourceSHA256=H;future.artifacts.glb!.actualSHA256=H;
 applyQualityAssessments([matched,different,future],assessment());expect(matched.metrics.quality.value).toBeNull();for(const r of[different,future]){expect(r.metrics.quality.value).toBe(8.166666666666666);expect(r.metrics.humanQualityCeiling).toBeUndefined();}
 const noHash=row();noHash.history={identityMatched:false} as any;applyQualityAssessments([noHash],assessment());expect(noHash.metrics.quality.value).toBe(8.166666666666666);
});
test('assessment validates ceiling, rubric and reference and does not turn malformed feedback into a score',()=>{
 for(const ceiling of[-1,11,NaN,Infinity,'7',null]){const r=row(),issues:any[]=[];applyQualityAssessments([r],assessment(ceiling),issues);expect(issues).toHaveLength(1);expect(r.metrics.quality.value).toBe(8.166666666666666);expect(r.metrics.humanQualityCeiling).toBeUndefined();}
 const otherRef=row(),otherRubric=row();otherRef.provenance.referenceSHA256=OTHER;otherRubric.metrics.quality.scope='another-rubric';applyQualityAssessments([otherRef,otherRubric],assessment());expect(otherRef.metrics.quality.value).toBe(8.166666666666666);expect(otherRubric.metrics.quality.value).toBe(8.166666666666666);
});
test('cards, table, detail and CSV distinguish human ceiling from rejected model score and material-only review',()=>{
 const rejected=row();applyQualityAssessments([rejected],assessment());const html=selectedModel(rejected,[rejected]);expect(html).toContain('Human: at most 7/10');expect(html).toContain('Raw model estimate');expect(html).toContain('No exact human score');expect(html).toContain('≤7');expect(metricCard(rejected,'quality')).toContain('<b>—</b>');expect(qualityNotice(rejected)).toContain('8.17/10');
 const table=resultsTable([rejected],{extra:[],sort:'quality',desc:true,active:'',compare:new Set()});expect(table).toContain('excluded from quality ranking');expect(table).toContain('Human upper bound /10');
 const csv=resultsCSV([rejected]);expect(csv).toContain('qualityAssessmentStatus');expect(csv).toContain('human-rejected');expect(csv).toContain('humanQualityCeiling_bound');expect(csv).toContain('"upper"');expect(csv).toContain('modelQuality');
 const material=row();material.metrics.quality.scope='material-all15-rubric-20261020';applyQualityAssessments([material],null);expect(metricCard(material,'quality')).toContain('MATERIAL ONLY');expect(qualityNotice(material)).toContain('not a complete-asset quality rating');
});
test('registry applies assessment after current and historical observations, without writing raw files',async()=>{
 const root=mkdtempSync(resolve(tmpdir(),'quality-overlay-')),write=(p:string,v:any)=>{const dest=resolve(root,p);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,typeof v==='string'?v:JSON.stringify(v));};
 try{
  const binary='small synthetic GLB identity',hash=createHash('sha256').update(binary).digest('hex'),path='experiments/fixture/experiment.json',panel='experiments/powerhouse/reviews/round-1';
  const raw={schemaVersion:1,id:'asset',cohort:'Fixture',status:'reviewed',metrics:{quality:{value:8.2,unit:'points/10',scope:rubric,source:'current/quality.json'},bytes:{value:binary.length,unit:'bytes'}},provenance:{glbSHA256:hash,referenceSHA256:REF},artifacts:{glb:'experiments/fixture/master.glb'},views:[0,1,2,3].map(i=>({path:`experiments/fixture/view${i}.png`}))};
  write(path,raw);write('experiments/fixture/master.glb',binary);for(const i of[0,1,2,3])write(`experiments/fixture/view${i}.png`,'png');
  write(panel+'/quality.json',{schemaVersion:1,round:'round-1',rubric,referenceSHA256:REF,reviewerCount:3,noInheritedScores:true,noCrossRoundPooling:true,candidates:[{id:'asset',code:'A01',mean:8,min:7.9,max:8.1,master:{bytes:binary.length,sha256:hash},scores:[7.9,8,8.1]}]});
  write(panel+'/map.json',{schemaVersion:1,round:'round-1',rubric,referenceSHA256:REF,candidates:[{id:'asset',code:'A01',glbSHA256:hash,views:raw.views.map(v=>v.path)}]});
  const a=assessment();a.assessments[0].assetSHA256s=[hash];write('results/quality-assessments.json',a);const before=readFileSync(resolve(root,path),'utf8');
  const all=await loadResults(root,{includeHistory:true});expect(all.records).toHaveLength(2);expect(all.records.every(r=>r.status==='human-rejected')).toBe(true);expect(all.records.find(r=>r.history)?.metrics.modelQuality.value).toBe(8);expect(all.records.find(r=>!r.history)?.metrics.modelQuality.value).toBe(8.2);
  const historical=await loadResults(root,{reviewRound:'round-1'});expect(historical.records[0].metrics.quality.value).toBeNull();expect(historical.records[0].metrics.humanQualityCeiling.bound).toBe('upper');expect(readFileSync(resolve(root,path),'utf8')).toBe(before);
 }finally{if(dirname(root)!==resolve(tmpdir())||!root.startsWith(resolve(tmpdir(),'quality-overlay-')))throw Error('Unexpected fixture cleanup');rmSync(root,{recursive:true,force:true});}
});
