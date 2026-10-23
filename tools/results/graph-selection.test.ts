import {test,expect} from 'bun:test';
import {graphRow,disjointLeaders} from './graph-fixtures';
import {allAssetsSelection,filterResultRows,sortResultRows} from './ui-state';
import {distinctGraphRecords,graphGroups,graphRecordIdentity,graphScopeRows,qualityGraphLeaders} from './graph-selection';
test('two overlapping top15 lists form one union with both ranks and no input mutation',()=>{
  const rows=Array.from({length:25},(_,i)=>graphRow('same-'+i,10-i*.1)),before=JSON.stringify(rows),r=qualityGraphLeaders(rows);
  expect(r.quality).toHaveLength(15);expect(r.perMB).toHaveLength(15);expect(r.rows).toHaveLength(15);expect(r.ranks.get('same-0')).toEqual({quality:1,perMB:1});expect(JSON.stringify(rows)).toBe(before);
});
test('disjoint lists retain all15 large high-quality assets and all15 efficient assets under every table ordering',()=>{
  const rows=disjointLeaders(),expected=qualityGraphLeaders(rows);expect(expected.rows).toHaveLength(30);expect(expected.quality.every(r=>r.id.startsWith('big-'))).toBe(true);expect(expected.perMB.every(r=>r.id.startsWith('small-'))).toBe(true);
  for(const sorted of [rows.toReversed(),sortResultRows(rows,'bytes',true),sortResultRows(rows,'quality',false)])expect(qualityGraphLeaders(sorted).rows.map(r=>r.id)).toEqual(expected.rows.map(r=>r.id));
});
test('ties use stable IDs rather than file size and never exceed15 per arm',()=>{
  const rows=Array.from({length:20},(_,i)=>graphRow('tie-'+String(i).padStart(2,'0'),7));expect(qualityGraphLeaders(rows.toReversed()).rows.map(r=>r.id)).toEqual(rows.slice(0,15).map(r=>r.id));
  const [big,small]=[graphRow('a-large',7,1e9),graphRow('b-small',7,1)];const r=qualityGraphLeaders([small,big],1);expect(r.quality[0].id).toBe('a-large');expect(r.perMB[0].id).toBe('b-small');expect(r.rows).toHaveLength(2);
});
test('missing/zero size does not remove the quality arm or invent a ratio; missing quality remains absent',()=>{
  const rows=[graphRow('no-size',10,null),graphRow('zero-size',9,0),graphRow('no-quality',null,1),graphRow('zero-quality',0,1),graphRow('valid',8,1_000_000)];const r=qualityGraphLeaders(rows);
  expect(r.quality.map(r=>r.id)).toEqual(['no-size','zero-size','valid','zero-quality']);expect(r.perMB.map(r=>r.id)).toEqual(['valid','zero-quality']);expect(r.rows.some(r=>r.id==='no-quality')).toBe(false);expect(r.ranks.get('no-size')).toEqual({quality:1});
  const noRatio=graphRow('missing-ratio',9,1);noRatio.metrics.qualityPerMB.value=null;expect(qualityGraphLeaders([noRatio]).perMB).toHaveLength(0);expect(qualityGraphLeaders([noRatio]).quality).toHaveLength(1);
  const mismatched=graphRow('other-ratio-context',8,1);mismatched.metrics.qualityPerMB.evaluationContext='another-review';expect(qualityGraphLeaders([mismatched]).perMB).toHaveLength(0);
});
test('exact GLB duplicates prefer current observation, never the highest historical score',()=>{
  const hash='a'.repeat(64),current=graphRow('current',6,100,'Bucket A','reviews/round-3/quality.json',hash),older=graphRow('history',9.9,100,'Bucket A','reviews/round-1/quality.json',hash);older.history={round:'round-1',expectedGLBSHA256:hash} as any;
  for(const rows of [[older,current],[current,older]]){const r=qualityGraphLeaders(rows);expect(r.rows.map(r=>r.id)).toEqual(['current']);expect(r.rows[0].metrics.quality.value).toBe(6);expect(r.duplicates).toBe(1);}
  current.metrics.quality.value=null;current.metrics.qualityPerMB.value=null;expect(qualityGraphLeaders([older,current]).rows).toHaveLength(0);
});
test('historical-only fallback is latest numbered round, with stable current alias fallback independent of score',()=>{
  const hash='b'.repeat(64),old=graphRow('round9',9,100,'Bucket','review9',hash),fresh=graphRow('round13',7,100,'Bucket','review13',hash);old.history={round:'round-9'} as any;fresh.history={round:'round-13'} as any;
  expect(distinctGraphRecords([old,fresh]).rows.map(r=>r.id)).toEqual(['round13']);const a=graphRow('a-current',5,1,'Bucket','review',hash),b=graphRow('b-current',9,1,'Bucket','review',hash);expect(distinctGraphRecords([b,a]).rows[0].id).toBe('a-current');
});
test('different binary variants and unknown hashes are retained despite shared parent, names, source geometry or path',()=>{
  const a=graphRow('variant-a',7,100,'Bucket','review','a'.repeat(64)),b=graphRow('variant-b',7,100,'Bucket','review','b'.repeat(64));a.name=b.name='Same model';a.provenance.sourceSHA256=b.provenance.sourceSHA256='f'.repeat(64);
  const c=graphRow('unknown-a'),d=graphRow('unknown-b');c.provenance.glbSHA256=d.provenance.glbSHA256='unknown';d.artifacts.glb!.path=c.artifacts.glb!.path;
  expect(distinctGraphRecords([a,b,c,d]).rows).toHaveLength(4);expect(graphRecordIdentity(a)).not.toBe(graphRecordIdentity(b));expect(graphRecordIdentity(c)).toBe('record:unknown-a');
});
test('global overview never auto-selects a large scope; explicit detail stays within its compatible panel',()=>{
  const many=Array.from({length:30},(_,i)=>graphRow('old-'+i,5,100)),top=graphRow('highest',10,1e9,'Bucket B','reviews/round-2/quality.json'),rows=[...many,top],groups=graphGroups(rows,'bytes','quality','scatter'),overview=graphScopeRows(rows,groups,'');
  expect(overview.group).toBe('');expect(overview.rows).toHaveLength(31);expect(qualityGraphLeaders(overview.rows).compatible).toBe(false);expect(qualityGraphLeaders(overview.rows).rows).toHaveLength(0);
  const first=[...groups.keys()][0],detail=graphScopeRows(rows,groups,first);expect(detail.rows.every(r=>r.cohort==='Bucket A')).toBe(true);expect(graphScopeRows(rows,groups,'stale-group').group).toBe('');
});
test('same-rubric different contexts and different rubrics cannot form a global numerical shortlist',()=>{
 const a=graphRow('A'),b=graphRow('B',10,1,'Bucket A','reviews/round-2/quality.json');
 for(const rows of[[a,b],[b,a]]){const r=qualityGraphLeaders(rows);expect(r.compatible).toBe(false);expect(r.ranks.size).toBe(0);expect(r.quality).toHaveLength(0);expect(r.perMB).toHaveLength(0);}
 b.metrics.quality.source=a.metrics.quality.source;b.metrics.quality.evaluationContext=a.metrics.quality.evaluationContext;b.metrics.quality.scope='different-rubric';expect(qualityGraphLeaders([a,b]).compatible).toBe(false);
});
test('ranking respects FREE/current filters and leaves historical/table observations intact',()=>{
  const free=graphRow('free',7),restricted=graphRow('restricted',10);restricted.license!.label='Restricted License';const records=[free,restricted],visible=filterResultRows(records,{...allAssetsSelection(),license:'FREE'});expect(qualityGraphLeaders(visible).rows.map(r=>r.id)).toEqual(['free']);expect(records).toHaveLength(2);expect(qualityGraphLeaders(filterResultRows(records,{...allAssetsSelection(),license:'all'})).quality[0].id).toBe('restricted');
});
test('changing chart type keeps an explicit scope when its compatible successor is unique',()=>{
  const a=graphRow('A'),b=graphRow('B'),rows=[a,b],scatter=graphGroups(rows,'bytes','quality','scatter'),bars=graphGroups(rows,'bytes','quality','bars'),old=[...scatter.keys()][0];
  const resolved=graphScopeRows(rows,bars,old,scatter.get(old));expect(resolved.group).toBe([...bars.keys()][0]);expect(resolved.rows).toHaveLength(2);expect(graphScopeRows(rows,bars,'',scatter.get(old)).group).toBe('');
});
