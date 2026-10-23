import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {loadResults} from './registry';
import {comparisonKey,pareto} from './model';
import {filters,selectedModel,resultsCSV} from './presentation';
import {startResults} from './serve';
import {resultsAPIURL} from './ui-state';
import {syntheticLicenseAudit} from './test-fixtures';

const sha=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
function fixture(){
  const root=mkdtempSync(resolve(tmpdir(),'glb-review-history-'));
  const write=(path:string,value:unknown)=>{mkdirSync(dirname(resolve(root,path)),{recursive:true});writeFileSync(resolve(root,path),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  write('results/license-audit.json',syntheticLicenseAudit());
  const views=[0,1,2,3].map(i=>`experiments/asset/view-${i}.png`),glb='experiments/asset/master.glb',bytes='GLB-A-00',hash=sha(bytes),reference='a'.repeat(64);
  for(const path of views)write(path,'retained-png');write(glb,bytes);
  const asset:any={schemaVersion:1,id:'asset',name:'Fixture asset',cohort:'Current fixture',assetRole:'master',status:'reviewed',metrics:{quality:{value:9,unit:'points/10',scope:'current-rubric',source:'current/quality.json'},bytes:{value:bytes.length,unit:'bytes'},seconds:{value:20,unit:'s',scope:'authoring'},tokens:{value:1234,unit:'tokens'},cost:{value:1,unit:'USD',scope:'authoring'},triangles:{value:10,unit:'count'},vertices:{value:12,unit:'count'}},views:views.map(path=>({path,label:path})),artifacts:{glb},animations:[{name:'Idle',duration:2}],provenance:{glbSHA256:hash,licenseAuditFamily:'procedural-authoring'}};
  write('experiments/asset/experiment.json',asset);
  const panel=(round:string,mean:number)=>{
    const path=`experiments/powerhouse/reviews/${round}`;
    const quality:any={schemaVersion:1,round,rubric:'historical-static-v1',referenceSHA256:reference,reviewerCount:3,candidates:[{id:'asset',code:'A01',mean,min:mean-.2,max:mean+.2,reviewerCount:3,sampleStandardDeviation:.2,scores:[mean-.2,mean,mean+.2],criteria:{silhouetteProportions:2,materialShapeIntegration:2,focalDetail:1,allViewCoherence:1}}],limitations:['Fixture review only']};
    const board=path+'/boards/A01.png',focal=path+'/focal-boards/A01.png';write(board,'board-png');write(focal,'focal-png');write(path+'/REVIEW.md','# Frozen fixture review');
    const map:any={schemaVersion:1,rubric:quality.rubric,referenceSHA256:reference,candidates:[{id:'asset',code:'A01',glbSHA256:hash,views,board,boardSHA256:sha('board-png'),focalBoard:focal,focalBoardSHA256:sha('focal-png')}]};
    write(path+'/quality.json',quality);write(path+'/map.json',map);
    return {path,quality,map};
  };
  const cleanup=()=>{const target=resolve(root),parent=resolve(tmpdir());if(dirname(target)!==parent||!target.startsWith(resolve(parent,'glb-review-history-')))throw Error('Unsafe fixture deletion');rmSync(target,{recursive:true,force:true});};
  return {root,write,panel,asset,views,glb,bytes,hash,cleanup};
}

test('history is explicit, keeps frozen panel grades distinct, and never copies current time/tokens/cost',async()=>{
  const f=fixture();try{
    f.panel('round-10',6.5);f.panel('round-11',7);f.write('experiments/powerhouse/reviews/round-5/PLAN.md','# No retained quality');
    const inputPaths=['experiments/asset/experiment.json',...['round-10','round-11'].flatMap(round=>['quality.json','map.json'].map(name=>`experiments/powerhouse/reviews/${round}/${name}`))];
    const before=inputPaths.map(path=>sha(readFileSync(resolve(f.root,path))));
    const current=await loadResults(f.root);expect(current.records).toHaveLength(1);expect(current.records[0].metrics.quality.value).toBe(9);expect(current.reviewHistory?.rounds.map(round=>round.round)).toEqual(['round-10','round-11']);
    const a=await loadResults(f.root,{reviewRound:'round-10'}),b=await loadResults(f.root,{reviewRound:'round-11'}),x=a.records[0],y=b.records[0];
    expect(a.records).toHaveLength(1);expect(x.id).toBe('review-history/round-10/asset');expect(x.parentId).toBe('asset');expect(x.history?.identityMatched).toBe(true);expect(x.metrics.quality.value).toBe(6.5);expect(y.metrics.quality.value).toBe(7);
    expect(comparisonKey(x,'bytes','quality')).not.toBe(comparisonKey(y,'bytes','quality'));expect(pareto([x,y],'bytes','quality').size).toBe(2);
    expect(x.metrics.qualityPerMB.value).toBe(6.5/(f.bytes.length/1e6));expect(x.metrics.qualityPerSec.value).toBeNull();
    for(const key of ['seconds','tokens','cost','cachedNativeAssemblySeconds'])expect(x.metrics[key]).toBeUndefined();
    expect(x.metrics.qualityFocalDetail.value).toBe(1);expect(x.history?.boards).toHaveLength(2);expect(x.history?.boards.every(board=>board.available)).toBe(true);expect(x.views).toHaveLength(4);expect(x.license?.label).toBe('FREE');
    const html=selectedModel(x,[x]);expect(html).toContain('Historical review observation');expect(html).toContain('Frozen review boards');expect(html).toContain('round-10/boards/A01.png');
    const picker=filters(a,{reviewRound:'round-10',cohort:x.cohort,strategy:'',status:'',license:'all',mode:'all',search:'',floor:0,unscored:true,x:'bytes',y:'quality',group:'',chart:'scatter',logX:false,extra:[],compare:new Set()});
    expect(picker).toContain('id="review-round"');expect(picker).toContain('value="round-11"');expect(picker).toContain('All assets');expect(picker).toContain('One frozen panel at a time');
    expect(resultsCSV([x])).toContain('quality-sha256=');expect(resultsCSV([x])).toContain('map-sha256=');
    expect(inputPaths.map(path=>sha(readFileSync(resolve(f.root,path))))).toEqual(before);
  }finally{f.cleanup();}
});

test('explicit all-history browsing retains current assets once and keeps every round and damaged panel separate',async()=>{
  const f=fixture();try{
    f.panel('round-1',6.5);const missing=f.panel('round-2',7),bad=f.panel('round-3',6.8);
    missing.quality.candidates.push({...missing.quality.candidates[0],id:'vanished',code:'A02',mean:7.1,min:7,max:7.2});missing.map.candidates.push({...missing.map.candidates[0],id:'vanished',code:'A02'});f.write(missing.path+'/quality.json',missing.quality);f.write(missing.path+'/map.json',missing.map);
    bad.map.referenceSHA256='f'.repeat(64);f.write(bad.path+'/map.json',bad.map);
    const before=['experiments/asset/experiment.json',missing.path+'/quality.json',bad.path+'/map.json'].map(path=>sha(readFileSync(resolve(f.root,path))));
    expect((await loadResults(f.root)).records.map(row=>row.id)).toEqual(['asset']);
    const all=await loadResults(f.root,{includeHistory:true});expect(all.reviewHistory?.includeHistory).toBe(true);expect(all.records).toHaveLength(5);expect(new Set(all.records.map(row=>row.id)).size).toBe(5);expect(all.records.filter(row=>row.id==='asset')).toHaveLength(1);
    const current=all.records.find(row=>row.id==='asset')!,first=all.records.find(row=>row.id==='review-history/round-1/asset')!,second=all.records.find(row=>row.id==='review-history/round-2/asset')!,vanished=all.records.find(row=>row.history?.originalAssetId==='vanished')!,broken=all.records.find(row=>row.history?.round==='round-3')!;
    expect([current.metrics.quality.value,first.metrics.quality.value,second.metrics.quality.value,vanished.metrics.quality.value,broken.metrics.quality.value]).toEqual([9,6.5,7,7.1,null]);expect(comparisonKey(first,'bytes','quality')).not.toBe(comparisonKey(second,'bytes','quality'));expect(pareto([first,second],'bytes','quality').size).toBe(2);
    expect(first.license?.label).toBe('FREE');expect(vanished.license?.label).toBe('Restricted License');expect(vanished.artifacts.glb).toBeUndefined();expect(vanished.history?.boards.every(board=>board.available)).toBe(true);expect(broken.status).toBe('historical-review-quarantined');
    for(const row of all.records.filter(row=>row.history)){expect(row.metrics.seconds).toBeUndefined();expect(row.metrics.tokens).toBeUndefined();expect(row.metrics.qualityPerSec.value).toBeNull();}
    expect(['experiments/asset/experiment.json',missing.path+'/quality.json',bad.path+'/map.json'].map(path=>sha(readFileSync(resolve(f.root,path))))).toEqual(before);await expect(loadResults(f.root,{reviewRound:'round-1',includeHistory:true})).rejects.toThrow('not both');
  }finally{f.cleanup();}
});

test('archived bytes survive absent local GLBs, but same-length wrong binaries cannot enter the viewer',async()=>{
  const f=fixture();try{
    f.panel('round-1',6.5);
    f.write(f.glb,'GLB-B-00');let data=await loadResults(f.root,{reviewRound:'round-1'}),row=data.records[0];
    expect(row.artifacts.glb?.actualBytes).toBe(f.bytes.length);expect(row.artifacts.glb?.matchesRecordedSize).toBe(true);expect(row.artifacts.glb?.matchesRecordedHash).toBe(false);expect(row.artifacts.glb?.available).toBe(false);expect(row.metrics.bytes.value).toBe(f.bytes.length);expect(row.metrics.qualityPerMB.value).not.toBeNull();
    const target=resolve(f.root,f.glb);if(!target.startsWith(resolve(f.root,'experiments/asset')+'/')&&!target.startsWith(resolve(f.root,'experiments/asset')+'\\'))throw Error('Unexpected single file target');rmSync(target);
    data=await loadResults(f.root,{reviewRound:'round-1'});row=data.records[0];expect(row.artifacts.glb?.available).toBe(false);expect(row.metrics.bytes.value).toBe(f.bytes.length);expect(row.history?.boards.every(board=>board.available)).toBe(true);
    f.asset.provenance.glbSHA256='b'.repeat(64);f.write('experiments/asset/experiment.json',f.asset);
    row=(await loadResults(f.root,{reviewRound:'round-1'})).records[0];expect(row.metrics.quality.value).toBe(6.5);expect(row.metrics.bytes).toBeUndefined();expect(row.metrics.qualityPerMB.value).toBeNull();expect(row.views).toEqual([]);expect(row.animations).toEqual([]);expect(row.artifacts.glb).toBeUndefined();expect(row.license?.label).toBe('Restricted License');expect(row.history?.boards.every(board=>board.available)).toBe(true);
  }finally{f.cleanup();}
});

test('historical license follows current audit restrictions and damaged boards are withheld',async()=>{
  const f=fixture();try{
    const panel=f.panel('round-1',6.5);panel.quality.license='FREE';f.write(panel.path+'/quality.json',panel.quality);
    f.asset.provenance.upstreamLicenseFamilies=['qwen-image-edit-2511-audited'];f.write('experiments/asset/experiment.json',f.asset);
    f.write(panel.map.candidates[0].board,'changed-same-path');
    const row=(await loadResults(f.root,{reviewRound:'round-1'})).records[0];
    expect(row.metrics.quality.value).toBe(6.5);expect(row.license?.label).toBe('Restricted License');expect(row.license?.inheritedFrom).toBe('asset');expect(row.history?.boards[0].available).toBe(false);expect(row.history?.boards[1].available).toBe(true);expect(row.issues.join(' ')).toContain('hash differs');
  }finally{f.cleanup();}
});

test('bad round context and ambiguous joins quarantine only their own retained observations',async()=>{
  const f=fixture();try{
    const a=f.panel('round-1',6.5),b=f.panel('round-2',6.8);a.map.referenceSHA256='c'.repeat(64);f.write(a.path+'/map.json',a.map);
    let bad=await loadResults(f.root,{reviewRound:'round-1'});expect(bad.records[0].metrics.quality.value).toBeNull();expect(bad.records[0].status).toBe('historical-review-quarantined');expect(bad.records[0].metrics.qualityPerMB.value).toBeNull();expect(bad.reviewHistory?.rounds.find(round=>round.round==='round-2')?.status).toBe('available');
    expect((await loadResults(f.root,{reviewRound:'round-2'})).records[0].metrics.quality.value).toBe(6.8);
    b.map.candidates.push({...b.map.candidates[0]});f.write(b.path+'/map.json',b.map);bad=await loadResults(f.root,{reviewRound:'round-2'});expect(bad.records[0].metrics.quality.value).toBeNull();expect(bad.issues.some(issue=>issue.message.includes('unambiguous'))).toBe(true);
    expect((await loadResults(f.root,{reviewRound:'round-5'})).records).toEqual([]);
    await expect(loadResults(f.root,{reviewRound:'../round-1'})).rejects.toThrow('Invalid reviewRound');
  }finally{f.cleanup();}
});

test('arithmetic roundoff is retained exactly, while schema/code/manifest failures stay quarantined',async()=>{
  const f=fixture();try{
    const panel=f.panel('round-8',6.599999999999999);panel.quality.candidates[0].min=6.6;panel.quality.candidates[0].max=6.6;f.write(panel.path+'/quality.json',panel.quality);
    expect((await loadResults(f.root,{reviewRound:'round-8'})).records[0].metrics.quality.value).toBe(6.599999999999999);
    for(const broken of [{...panel.quality,schemaVersion:2},{...panel.quality,candidates:[{...panel.quality.candidates[0],code:'wrong-code'}]},{...panel.quality,candidates:[{...panel.quality.candidates[0],min:7}]}]){
      f.write(panel.path+'/quality.json',broken);expect((await loadResults(f.root,{reviewRound:'round-8'})).records[0].metrics.quality.value).toBeNull();
    }
    f.write(panel.path+'/quality.json',panel.quality);f.write(panel.path+'/manifest.json',{schemaVersion:1,rubric:panel.quality.rubric,referenceSHA256:panel.quality.referenceSHA256,candidates:[{id:'asset',glbSHA256:'f'.repeat(64)}]});
    expect((await loadResults(f.root,{reviewRound:'round-8'})).records[0].metrics.quality.value).toBeNull();
    const good=f.panel('round-9',7);f.write(panel.path+'/quality.json','not JSON');const data=await loadResults(f.root,{reviewRound:'round-9'});expect(data.records[0].metrics.quality.value).toBe(7);expect(data.reviewHistory?.rounds.find(round=>round.round==='round-8')?.status).toBe('invalid');
  }finally{f.cleanup();}
});

test('API/UI round requests preserve current compatibility and guard the exact GLB again at delivery',async()=>{
  const f=fixture();let server:Awaited<ReturnType<typeof startResults>>|undefined;try{
    f.panel('round-10',6.5);server=await startResults({root:f.root,port:0});const base=`http://127.0.0.1:${server.port}`;
    expect(resultsAPIURL()).toBe('/api/results');expect(resultsAPIURL('round-10')).toBe('/api/results?reviewRound=round-10');
    const current=await (await fetch(base+'/api/results?quality=legacy')).json();expect(current.records[0].id).toBe('asset');expect(current.records[0].metrics.quality.value).toBe(9);
    const history=await (await fetch(base+resultsAPIURL('round-10'))).json();expect(history.records[0].metrics.quality.value).toBe(6.5);expect(history.reviewHistory.selectedRound).toBe('round-10');
    const all=await (await fetch(base+resultsAPIURL('',true))).json();expect(all.records.map((row:any)=>row.id)).toEqual(['asset','review-history/round-10/asset']);expect(all.reviewHistory.includeHistory).toBe(true);
    const url=history.records[0].artifacts.glb.url;expect(url).toContain('?reviewSHA256=');expect((await fetch(base+url)).status).toBe(200);
    f.write(f.glb,'GLB-B-00');expect((await fetch(base+url)).status).toBe(409);expect((await fetch(base+'/'+f.glb)).status).toBe(200);
    for(const query of ['reviewRound=../round-1','reviewRound=round-1&reviewRound=round-2','reviewRound=','reviewRound=round-01'])expect((await fetch(base+'/api/results?'+query)).status).toBe(400);
    for(const query of ['includeHistory=','includeHistory=true','includeHistory=0','includeHistory=1&includeHistory=1','includeHistory=1&reviewRound=round-10'])expect((await fetch(base+'/api/results?'+query)).status).toBe(400);
    expect((await fetch(base+'/'+f.glb+'?reviewSHA256=bad')).status).toBe(400);
    const js=await (await fetch(base+'/app.js')).text();expect(js).toContain('review-round');expect(js).toContain('reviewRound');expect(js).toContain('Historical review panels');
  }finally{server?.stop(true);f.cleanup();}
},30000);
