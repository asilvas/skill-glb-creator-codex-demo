import {expect,test} from 'bun:test';
import {normalize} from './model';
import {allAssetsSelection,dataViewFromSearch,filterResultRows,inlineModelURL,licenseFilterFromSearch,matchesLicenseFilter,resultsAPIURL,sortResultRows,visibleLicenseSelection} from './ui-state';
const record=(id:string,label?:'FREE'|'Restricted License')=>({...normalize({schemaVersion:1,id},'fixture.json'),...(label?{license:{label,status:label==='FREE'?'verified':'restricted',family:'fixture',reason:'Fixture',evidence:[],obligations:[]}}:{})});

test('fresh visits and old bookmarked URLs show FREE routes by default',()=>{
  for(const query of ['','cohort=stage-2&asset=hunyuan-master','license=','license=unknown'])expect(licenseFilterFromSearch(new URLSearchParams(query))).toBe('FREE');
  expect(licenseFilterFromSearch(new URLSearchParams('license=all'))).toBe('all');
  expect(licenseFilterFromSearch(new URLSearchParams('license=Restricted+License'))).toBe('Restricted License');
});

test('license filtering fails closed and clears restricted model/compare selections from old links',()=>{
  const free=record('free','FREE'),restricted=record('restricted','Restricted License'),unknown=record('unknown');
  expect(matchesLicenseFilter(unknown,'FREE')).toBe(false);
  expect(matchesLicenseFilter(unknown,'Restricted License')).toBe(true);
  const selected=visibleLicenseSelection([free,restricted,unknown] as any,'FREE','restricted',new Set(['free','restricted','unknown','missing']));
  expect(selected.active).toBe('');expect([...selected.compare]).toEqual(['free']);
  const explicit=visibleLicenseSelection([free,restricted,unknown] as any,'all','restricted',new Set(['free','restricted']));
  expect(explicit.active).toBe('restricted');expect([...explicit.compare]).toEqual(['free','restricted']);
});

test('inline GLB eligibility permits an unknown local flag but blocks absence and reviewed mismatches',()=>{
  const model=normalize({schemaVersion:1,id:'model',artifacts:{glb:'fixture.glb'}},'fixture.json'),glb=model.artifacts.glb!;
  expect(inlineModelURL(undefined)).toBeUndefined();expect(inlineModelURL(model)).toBeUndefined();
  delete (glb as any).available;expect(inlineModelURL(model)).toBe('/fixture.glb');
  glb.available=true;glb.matchesRecordedHash=false;expect(inlineModelURL(model)).toBeUndefined();
  glb.matchesRecordedHash=true;glb.expectedSHA256='reviewed';glb.actualSHA256='different';expect(inlineModelURL(model)).toBeUndefined();
  glb.actualSHA256='reviewed';expect(inlineModelURL(model)).toBe('/fixture.glb');
  model.history={identityMatched:false} as any;expect(inlineModelURL(model)).toBeUndefined();delete model.history;
  glb.url='  ';expect(inlineModelURL(model)).toBeUndefined();
});

test('All assets starts across every bucket, keeps old links, and includes history only explicitly',()=>{
  expect(dataViewFromSearch(new URLSearchParams())).toEqual({reviewRound:'',includeHistory:false,cohort:''});
  expect(dataViewFromSearch(new URLSearchParams('cohort=Old+bucket')).cohort).toBe('Old bucket');
  expect(dataViewFromSearch(new URLSearchParams('includeHistory=1')).includeHistory).toBe(true);
  expect(dataViewFromSearch(new URLSearchParams('reviewRound=round-11&includeHistory=1'))).toEqual({reviewRound:'round-11',includeHistory:false,cohort:''});
  expect(resultsAPIURL()).toBe('/api/results');expect(resultsAPIURL('',true)).toBe('/api/results?includeHistory=1');expect(resultsAPIURL('round-11')).toBe('/api/results?reviewRound=round-11');expect(()=>resultsAPIURL('round-11',true)).toThrow();
  for(const license of ['FREE','all','Restricted License']){
    const narrowed={license,cohort:'Old bucket',reviewRound:'round-11',includeHistory:true,search:'narrow',compare:new Set(['hidden'])};Object.assign(narrowed,allAssetsSelection());
    expect(narrowed.license).toBe(license);expect(narrowed.cohort).toBe('');expect(narrowed.reviewRound).toBe('');expect(narrowed.includeHistory).toBe(false);expect(narrowed.compare.size).toBe(0);
  }
});

test('global table retains every bucket and keeps mixed quality scopes unranked independently of plot group',()=>{
  const first=record('first','FREE'),second=record('second','FREE'),restricted=record('restricted','Restricted License'),missing=record('unrated','FREE');
  first.cohort='Bucket A';second.cohort='Bucket B';restricted.cohort='Bucket C';missing.cohort='Bucket D';
  first.metrics.quality={value:6,unit:'points/10',scope:'rubric-A',evaluationContext:'round-A'};second.metrics.quality={value:9,unit:'points/10',scope:'rubric-B',evaluationContext:'round-B'};
  const rows=[first,second,restricted,missing] as any,state={...allAssetsSelection(),license:'FREE' as const,group:'Bucket A plot only'};
  const visible=filterResultRows(rows,state);expect(visible.map(row=>row.id)).toEqual(['first','second','unrated']);expect(sortResultRows(visible,'quality',true).map(row=>row.id)).toEqual(['first','second','unrated']);expect(sortResultRows(visible,'quality',false).map(row=>row.id)).toEqual(['first','second','unrated']);
  expect(second.metrics.quality).toEqual({value:9,unit:'points/10',scope:'rubric-B',evaluationContext:'round-B'});
  expect(filterResultRows(rows,{...state,license:'all'})).toHaveLength(4);expect(filterResultRows(rows,{...state,search:'Bucket B'}).map(row=>row.id)).toEqual(['second']);expect(filterResultRows(rows,{...state,cohort:'Bucket A'}).map(row=>row.id)).toEqual(['first']);
});
