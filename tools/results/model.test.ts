import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {normalize,comparisonKey,metricCatalog,metricEvaluationContext,pareto,escapeHTML,csvCell,safePath,matchesAssetMode} from './model';
import {loadResults} from './registry';
const row=(metrics:any,extra:any={})=>normalize({schemaVersion:1,id:'test',name:'Fixture',cohort:'Controlled test',metrics,...extra},'experiments/test/experiment.json');
const quality={value:10,unit:'points/10',scope:'test-rubric-v1'},bytes={value:1_000_000,unit:'bytes'},seconds={value:20,unit:'s',scope:'adapter-v1'};
test('untrusted names/units remain inert text and CSV formulas cannot execute as text cells',()=>{
  const payload='<img src=x onerror="alert(1)"> & \'quoted\'';
  const escaped=escapeHTML(payload);expect(escaped).not.toContain('<img');expect(escaped).not.toContain('"');expect(escaped).not.toContain("'");expect(escaped).toContain('&lt;img');
  expect(csvCell('=HYPERLINK("https://example.invalid")')).toStartWith('"\'=');expect(csvCell(-20)).toBe('"-20"');
  for(const path of ['javascript:alert(1)','data:image/png;base64,x','../outside.png','.agents/secret.png','C:\\secret.png','/etc/passwd'])expect(safePath(path)).toBeNull();
});
test('qualityPerSec means10 points over20 seconds =0.5; decimal MB uses whole bytes',()=>{
  const r=row({quality,bytes,seconds});expect(r.metrics.qualityPerSec.value).toBe(.5);expect(r.metrics.qualityPerMB.value).toBe(10);expect(r.metrics.qualityPerSec.scope).toContain('adapter-v1');
});
test('motion evidence stays separate from four perspectives and rejects unsafe references',()=>{
  const r=row({}, {views:[{path:'experiments/a/rest.png'}],motionViews:[{label:'Attack',path:'experiments/a/attack.png'},{path:'../private.png'},{path:'https://example.invalid/a.png'}]});
  expect(r.views.length).toBe(1);expect(r.motionViews.length).toBe(1);expect(r.motionViews[0].label).toBe('Attack');expect(r.motionViews[0].available).toBe(false);expect(r.issues.length).toBe(2);
});
test('historical lineage does not turn an accepted master into a delivery variant',()=>{
  const master=row({}, {parentId:'prior-cohort',status:'master-preserved / reviewed'}),variant=row({}, {parentId:'master',variant:'10MB'}),idea=row({}, {parentId:'master',status:'baked'});
  expect(matchesAssetMode(master,'masters')).toBe(true);expect(matchesAssetMode(master,'variants')).toBe(false);expect(matchesAssetMode(variant,'variants')).toBe(true);expect(matchesAssetMode(idea,'variants')).toBe(false);expect(idea.assetRole).toBe('experiment');
});
test('unknown times, missing rubric, zeros, strings and unsupported units fail closed',()=>{
  for(const bad of [null,0,-1,Infinity,'20'])expect(row({quality,bytes,seconds:{...seconds,value:bad}}).metrics.qualityPerSec.value).toBeNull();
  expect(row({quality,bytes,seconds:{value:20,unit:'s'}}).metrics.qualityPerSec.value).toBeNull();
  expect(row({quality:{value:10,unit:'points/10'},bytes,seconds}).metrics.qualityPerMB.value).toBeNull();
  expect(row({quality,bytes:{value:10,unit:'MB'},seconds}).metrics.qualityPerMB.value).toBeNull();
  expect(row({quality:{...quality,value:11},bytes,seconds}).metrics.qualityPerMB.value).toBeNull();
  expect(row({quality,bytes,seconds,qualityPerSec:{value:999,unit:'points/s'}}).metrics.qualityPerSec.value).toBe(.5);
});
test('additive custom metrics survive and are graphable only with compatible units/scopes',()=>{
  const r=row({quality,bytes,newMetric:{value:.3,unit:'ratio',scope:'contrast-v1',direction:'higher'},unknownUnscoped:{value:2,unit:'ratio'}});
  const s=row({quality,bytes,newMetric:{value:.4,unit:'percent',scope:'contrast-v1',direction:'higher'}},{id:'other'});
  expect(r.metrics.newMetric.value).toBe(.3);expect(metricCatalog([r,s]).find(x=>x.key==='newMetric')?.units).toEqual(['ratio','percent']);
  expect(comparisonKey(r,'bytes','newMetric')).not.toBe(comparisonKey(s,'bytes','newMetric'));expect(comparisonKey(r,'bytes','unknownUnscoped')).toBeNull();
});
test('unsupported schema preserves raw metrics but quarantines values; safe paths refuse traversal',()=>{
  const r=row({quality,bytes,future:{value:4,unit:'test',scope:'v1'}},{schemaVersion:2,views:[{path:'../secret.png'},{path:'.git/config.png'},{path:'http://x/a.png'}],artifacts:{glb:'C:/secret.glb'}});
  expect(r.status).toBe('unsupported');expect(r.metrics.future.value).toBeNull();expect(r.metrics.future.raw).toEqual({value:4,unit:'test',scope:'v1'});expect(r.views).toEqual([]);expect(r.artifacts.glb).toBeUndefined();
});
test('Pareto retains quality/size tradeoff and exact ties while rejecting dominated points',()=>{
  const a=row({quality:{...quality,value:8},bytes:{...bytes,value:100}}),b=row({quality:{...quality,value:7},bytes:{...bytes,value:50}},{id:'b'}),c=row({quality:{...quality,value:6},bytes:{...bytes,value:110}},{id:'c'});
  expect([...pareto([a,b,c],'bytes','quality')]).toEqual(['test','b']);
});
test('the same rubric requires the same independent review context for quality and its ratios',()=>{
  const round7='experiments/fixture/reviews/round-7/quality.json',round8='experiments/fixture/reviews/round-8/quality.json';
  const reviewed=(source:string,id:string)=>row({quality:{...quality,value:6.93,source},bytes,seconds,qualityMin:{...quality,value:6.5},qualityPerMaterialSec:{value:.3,unit:'points/material-s',scope:'test-rubric-v1; material-stage',source:'quality / materialSeconds',direction:'higher'}},{id});
  const a=reviewed(round7,'a'),b=reviewed(round8,'b'),same=reviewed(round7,'same');
  for(const key of ['quality','qualityMin','qualityPerMB','qualityPerSec','qualityPerMaterialSec']){
    expect(metricEvaluationContext(a,key)).toBe(round7);
    expect(comparisonKey(a,'bytes',key)).not.toBe(comparisonKey(b,'bytes',key));
    expect(comparisonKey(a,'bytes',key)).toBe(comparisonKey(same,'bytes',key));
  }
  expect(a.metrics.quality.value).toBe(6.93);expect(a.metrics.quality.scope).toBe(quality.scope);
  expect(a.metrics.qualityPerSec.value).toBe(6.93/20);expect(a.metrics.qualityPerMB.value).toBe(6.93);
  expect(comparisonKey(a,'bytes','seconds')).toBe(comparisonKey(b,'bytes','seconds'));
});
test('review-source fallback is precise and legacy records do not get synthetic contexts',()=>{
  const review='reviews/shared/quality.json',fallback='reviews/fallback/quality.json';
  const a=row({quality,bytes,seconds},{provenance:{review:{source:review}}});
  const b=row({quality:{...quality,source:review},bytes,seconds},{provenance:{review:{source:fallback}}});
  expect(metricEvaluationContext(a,'quality')).toBe(review);expect(metricEvaluationContext(b,'quality')).toBe(review);
  expect(a.metrics.qualityPerSec.evaluationContext).toBe(review);expect(comparisonKey(a,'bytes','quality')).toBe(comparisonKey(b,'bytes','quality'));
  const legacy=row({quality,bytes,seconds},{id:'legacy-a',provenance:{source:'old/a.json'}});
  const other=normalize({schemaVersion:1,id:'legacy-b',cohort:legacy.cohort,metrics:{quality,bytes,seconds},provenance:{source:'old/b.json'}},'different/experiment.json');
  expect(metricEvaluationContext(legacy,'quality')).toBeUndefined();expect(metricEvaluationContext(other,'qualityPerMB')).toBeUndefined();
  expect(comparisonKey(legacy,'bytes','quality')).toBe(comparisonKey(other,'bytes','quality'));
  expect(comparisonKey(legacy,'bytes','quality')).not.toBe(comparisonKey(a,'bytes','quality'));
  expect(comparisonKey(legacy,'bytes','seconds')).toBe(comparisonKey(a,'bytes','seconds'));
});
test('optional evaluation context supports custom metrics without interpreting ordinary sources',()=>{
  const custom={value:1,unit:'ratio',scope:'custom-v1',direction:'higher'},a=row({quality:{...quality,evaluationContext:'matched-panel-A',source:'unrelated/file.json'},bytes,seconds,custom:{...custom,evaluationContext:'test-A'},ordinary:{...custom,source:'a.json'},qualityPerMB:{value:100,evaluationContext:'untrusted-ratio-context'}});
  const b=row({quality:{...quality,evaluationContext:'matched-panel-B'},bytes,seconds,custom:{...custom,evaluationContext:'test-B'},ordinary:{...custom,source:'b.json'}});
  expect(metricEvaluationContext(a,'quality')).toBe('matched-panel-A');expect(a.metrics.qualityPerMB.evaluationContext).toBe('matched-panel-A');
  expect(comparisonKey(a,'bytes','custom')).not.toBe(comparisonKey(b,'bytes','custom'));
  expect(comparisonKey(a,'bytes','ordinary')).toBe(comparisonKey(b,'bytes','ordinary'));
  const motion=row({quality:{...quality,source:'reviews/static.json'},motionQuality:{...quality,source:'reviews/motion.json'},bytes});
  expect(metricEvaluationContext(motion,'motionQuality')).toBe('reviews/motion.json');
});
test('direct Pareto calls cannot dominate across review contexts, scopes or cohorts',()=>{
  const reviewed=(id:string,value:number,size:number,source:string,extra:any={})=>row({quality:{...quality,value,source},bytes:{...bytes,value:size},seconds},{id,...extra});
  const a=reviewed('round7-best',8,100,'reviews/round-7/quality.json'),dominated=reviewed('round7-dominated',7,200,'reviews/round-7/quality.json');
  const b=reviewed('round8',6,300,'reviews/round-8/quality.json'),otherCohort=reviewed('other-cohort',5,400,'reviews/round-7/quality.json',{cohort:'Other cohort'});
  const otherScope=row({quality:{...quality,value:4,scope:'other-rubric',source:'reviews/round-7/quality.json'},bytes:{...bytes,value:500}},{id:'other-scope'});
  const unscoped=row({quality:{value:10,unit:'points/10'},bytes:{...bytes,value:1}},{id:'unscoped'});
  expect(pareto([unscoped,a,dominated,b,otherCohort,otherScope],'bytes','quality')).toEqual(new Set(['round7-best','round8','other-cohort','other-scope']));
  expect(pareto([a,dominated,b],'bytes','qualityPerMB')).toEqual(new Set(['round7-best','round8']));
  expect(pareto([a,dominated,b],'bytes','qualityPerSec')).toEqual(new Set(['round7-best','round8']));
});
test('one malformed JSON cannot hide valid experiments or turn missing GLBs into available ones',async()=>{
  const root=mkdtempSync(resolve(tmpdir(),'glb-results-fixture-'));
  try{mkdirSync(resolve(root,'experiments/good'),{recursive:true});mkdirSync(resolve(root,'experiments/bad'),{recursive:true});
    writeFileSync(resolve(root,'experiments/good/experiment.json'),JSON.stringify({schemaVersion:1,id:'good',cohort:'Fixture',metrics:{quality,bytes,seconds,brandNew:{value:2,unit:'widgets',scope:'widget-v1'}},artifacts:{glb:'experiments/good/missing.glb'},views:[0,1,2,3].map(i=>({path:`experiments/good/view${i}.png`,label:String(i)}))}));
    writeFileSync(resolve(root,'experiments/bad/experiment.json'),'{invalid');
    const data=await loadResults(root);expect(data.records.length).toBe(1);expect(data.records[0].artifacts.glb?.available).toBe(false);expect(data.records[0].metrics.qualityPerSec.value).toBe(.5);expect(data.issues.some(x=>x.source.includes('bad'))).toBe(true);expect(data.metricCatalog.find(x=>x.key==='brandNew')?.valid).toBe(1);
  }finally{if(dirname(resolve(root))!==resolve(tmpdir())||!resolve(root).startsWith(resolve(tmpdir(),'glb-results-fixture-')))throw Error('Unexpected fixture deletion target');rmSync(root,{recursive:true,force:true});}
});
test('synthetic legacy adapters preserve distinct material-only review rounds and withhold batch qualityPerSec',async()=>{
  const root=mkdtempSync(resolve(tmpdir(),'results-legacy-fixture-')),write=(p:string,v:any)=>{mkdirSync(dirname(resolve(root,p)),{recursive:true});writeFileSync(resolve(root,p),JSON.stringify(v));};
  try{
  write('results/experiment/metrics.json',{arms:[{arm:'candidate',meanQuality:8,meanBytes:100,batchSeconds:40}]});
  write('results/material-pilot/assessment.json',{routes:[{id:'hybrid-trellis-compact',label:'Compact fixture',folder:'hybrid-trellis-compact',seconds:34.86686860000191,timingScope:'adapter'},{id:'hybrid-trellis',label:'Earlier fixture',folder:'hybrid-trellis',seconds:20,timingScope:'adapter'}]});
  write('results/material-pilot/quality.json',{candidates:[{id:'hybrid-trellis-compact',mean:8.25,min:8,max:8.5}]});write('results/material-pilot/quality-primary-eight.json',{candidates:[{id:'hybrid-trellis',mean:7.9166667,min:7.8,max:8}]});
  for(const folder of['hybrid-trellis-compact','hybrid-trellis'])write(`results/material-pilot/${folder}/format-check.json`,{bytes:79_753_396,glb:'fixture.glb'});
  const data=await loadResults(root);
  const compact=data.records.find(r=>r.id==='material-all15/hybrid-trellis-compact')!,older=data.records.find(r=>r.id==='material-primary8/hybrid-trellis')!;
  expect(compact.metrics.quality.value).toBe(8.25);expect(older.metrics.quality.value).toBeCloseTo(7.9166667,6);expect(compact.metrics.qualityPerMB.value).toBeCloseTo(8.25/(79_753_396/1e6),10);expect(compact.metrics.qualityPerSec.value).toBeCloseTo(8.25/34.86686860000191,10);
  expect(comparisonKey(compact,'bytes','quality')).not.toBe(comparisonKey(older,'bytes','quality'));
  expect(data.records.filter(r=>r.id.startsWith('authoring-batch/')).every(r=>r.metrics.qualityPerSec.value===null)).toBe(true);
  expect(compact.qualityAssessment?.status).toBe('material-only');
  }finally{if(dirname(root)!==resolve(tmpdir())||!root.startsWith(resolve(tmpdir(),'results-legacy-fixture-')))throw Error('Unexpected fixture cleanup');rmSync(root,{recursive:true,force:true});}
});
