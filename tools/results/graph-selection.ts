/** Descriptive graph shortlist; never changes retained observations or scores. */
import {comparisonKey,finite,metricEvaluationContext,type ResultRecord} from './model';
export type GraphRanking='leaders'|'all';
export type GraphRanks={quality?:number;perMB?:number};
const textCompare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const stable=(a:ResultRecord,b:ResultRecord)=>textCompare(a.id,b.id)||textCompare(a.source,b.source)||textCompare(a.name,b.name);
const sha=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v)?v.toLowerCase():undefined;
/** Use the reviewed/exported GLB identity, never a shared geometry/source hash,
 * parent/name/path or inferred similarity. Missing hashes keep distinct IDs.
 */
export function graphRecordIdentity(row:ResultRecord){
  const glb=row.artifacts.glb;
  const hash=sha(row.history?.expectedGLBSHA256)??sha(glb?.expectedSHA256)??sha(row.provenance.glbSHA256)??(glb?.matchesRecordedHash===false?undefined:sha(glb?.actualSHA256));
  return hash?'glb:'+hash:'record:'+row.id;
}
function preferred(a:ResultRecord,b:ResultRecord){
  if(!!a.history!==!!b.history)return a.history?b:a;
  // With history alone, latest numbered review wins, regardless of its score.
  const round=(r:ResultRecord)=>Number(r.history?.round.match(/^round-(\d+)$/)?.[1]??-1);
  if(a.history&&b.history&&round(a)!==round(b))return round(a)>round(b)?a:b;
  return stable(a,b)<=0?a:b;
}
export function distinctGraphRecords(records:ResultRecord[]){
  const unique=new Map<string,ResultRecord>();
  for(const row of records){const key=graphRecordIdentity(row),old=unique.get(key);unique.set(key,old?preferred(old,row):row);}
  return {rows:[...unique.values()].sort(stable),duplicates:records.length-unique.size};
}
export function qualityValue(row:ResultRecord){const q=row.metrics.quality;return q?.unit==='points/10'&&finite(q.value)&&q.value>=0&&q.value<=10?q.value:undefined;}
export function perMBValue(row:ResultRecord){
  const q=row.metrics.quality,ratio=row.metrics.qualityPerMB,bytes=row.metrics.bytes;
  if(qualityValue(row)===undefined||!q?.scope||ratio?.unit!=='points/MB'||ratio.scope!==q.scope||!finite(ratio.value)||ratio.value<0||bytes?.unit!=='bytes'||!finite(bytes.value)||bytes.value<=0)return;
  if(metricEvaluationContext(row,'quality')!==metricEvaluationContext(row,'qualityPerMB'))return;
  return ratio.value;
}
export function qualityGraphLeaders(records:ResultRecord[],limit=15){
  if(!Number.isInteger(limit)||limit<1)throw Error('Positive graph rank limit required');
  const distinct=distinctGraphRecords(records),scored=distinct.rows.filter(r=>qualityValue(r)!==undefined),scopes=new Set(scored.map(r=>comparisonKey(r,'quality','quality'))),compatible=scopes.size===1&&!scopes.has(null);
  const ranked=(value:(r:ResultRecord)=>number|undefined)=>compatible?distinct.rows.filter(r=>value(r)!==undefined).sort((a,b)=>value(b)!-value(a)!||stable(a,b)).slice(0,limit):[];
  const quality=ranked(qualityValue),perMB=ranked(perMBValue),ranks=new Map<string,GraphRanks>();
  quality.forEach((r,i)=>ranks.set(r.id,{quality:i+1}));perMB.forEach((r,i)=>ranks.set(r.id,{...ranks.get(r.id),perMB:i+1}));
  const rows=[...quality,...perMB.filter(r=>!quality.some(q=>q.id===r.id))];
  return {rows,quality,perMB,ranks,limit,compatible,distinctCount:distinct.rows.length,duplicates:distinct.duplicates,inputCount:records.length};
}
export type GraphLeaders=ReturnType<typeof qualityGraphLeaders>;
export function graphGroups(records:ResultRecord[],x:string,y:string,chart:string){
  const groups=new Map<string,ResultRecord[]>();for(const row of records){const key=comparisonKey(row,chart==='scatter'?x:y,y);if(key){const rows=groups.get(key)??[];rows.push(row);groups.set(key,rows);}}return groups;
}
/** Empty is an intentional cross-review overview, never auto-pick a bucket. */
export function graphScopeRows(records:ResultRecord[],groups:Map<string,ResultRecord[]>,requested:string,previousScope:ResultRecord[]=[]){
  let group=groups.has(requested)?requested:'';
  if(requested&&!group&&previousScope.length){const ids=new Set(previousScope.map(r=>r.id)),matches=[...groups].filter(([,rows])=>rows.some(r=>ids.has(r.id)));if(matches.length===1)group=matches[0][0];}
  return {group,rows:group?groups.get(group)!:records};
}
export function graphRankLabel(rank:GraphRanks|undefined){return [rank?.quality?`Quality #${rank.quality}`:'',rank?.perMB?`Per MB #${rank.perMB}`:''].filter(Boolean).join(' · ');}
