/** Versioned result normalization. Missing or malformed observations never become zero. */
import type {LicenseAssessment} from './license';
export type Metric={value:number|null;unit:string;scope?:string;source?:string;evaluationContext?:string;direction?:'higher'|'lower';reason?:string;raw?:unknown;derived?:boolean;bound?:'upper'};
export type QualityAssessment={status:'human-rejected'|'unvalidated-model-estimate'|'material-only';label:string;detail:string;source:string;recordedModelScore:number|null;candidateEligible:false;originalStatus:string;assessmentId?:string};
export type Asset={path:string;url:string;available:boolean;recordedBytes?:number;actualBytes?:number;matchesRecordedSize?:boolean;expectedSHA256?:string;actualSHA256?:string;matchesRecordedHash?:boolean};
export type View={label:string;path:string;url:string;available:boolean};
export type HistoricalReview={round:string;originalAssetId:string;expectedGLBSHA256?:string;identityMatched:boolean;boards:View[];qualitySHA256:string;mapSHA256?:string};
export type ReviewHistoryDescriptor={round:string;cohort:string;count:number;status:'available'|'invalid';source:string;mapSource:string;qualitySHA256?:string;mapSHA256?:string};
export type ResultRecord={id:string;name:string;cohort:string;baseStrategy:string;subStrategy:string;parentId?:string;variant?:string;status:string;assetRole:'master'|'variant'|'experiment';license?:LicenseAssessment;history?:HistoricalReview;qualityAssessment?:QualityAssessment;metrics:Record<string,Metric>;views:View[];motionViews:View[];artifacts:{glb?:Asset;review?:Asset};animations:{name:string;duration?:number}[];notes:string[];provenance:Record<string,unknown>;source:string;issues:string[];extra:Record<string,unknown>};
export type Dataset={schemaVersion:1;generated:string;records:ResultRecord[];issues:{source:string;message:string}[];sources:{path:string;name:string;records:number;status:string}[];metricCatalog:{key:string;units:string[];scopes:string[];valid:number;missing:number;direction?:string}[];reviewHistory?:{selectedRound?:string;includeHistory?:boolean;rounds:ReviewHistoryDescriptor[]}};
const known:Record<string,{unit:string;direction:'higher'|'lower'}>={quality:{unit:'points/10',direction:'higher'},bytes:{unit:'bytes',direction:'lower'},seconds:{unit:'s',direction:'lower'},triangles:{unit:'count',direction:'lower'},vertices:{unit:'count',direction:'lower'},tokens:{unit:'tokens',direction:'lower'},inputTokens:{unit:'tokens',direction:'lower'},outputTokens:{unit:'tokens',direction:'lower'},cachedInputTokens:{unit:'tokens',direction:'lower'},qualityPerMB:{unit:'points/MB',direction:'higher'},qualityPerSec:{unit:'points/s',direction:'higher'}};
export const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export const escapeHTML=(x:unknown)=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function csvCell(value:unknown){let s=String(value??'');if(typeof value!=='number'&&/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function safePath(value:unknown):string|null{
  if(typeof value!=='string'||!value.trim()||value.includes('\0'))return null;
  const p=value.replaceAll('\\','/').replace(/^\.\//,'');
  if(p.startsWith('/')||/^[a-z]+:/i.test(p)||p.split('/').some(x=>x==='..'||x.startsWith('.')))return null;
  return p;
}
export const assetURL=(path:string)=>'/'+path.split('/').map(encodeURIComponent).join('/');
export function metric(value:unknown,unit:string,scope?:string,source?:string,direction?:'higher'|'lower'):Metric{return {value:finite(value)?value:null,unit,scope,source,direction,reason:finite(value)?undefined:'Not recorded'};}
const contextText=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;
const qualityMetric=(key:string,m:Metric)=>/^quality(?:$|[A-Z])/.test(key)||/^points(?:\/|$)/.test(m.unit);
/** Review identity is separate from the rubric. Ordinary measurement sources are not contexts. */
export function metricEvaluationContext(record:Pick<ResultRecord,'metrics'|'provenance'>,key:string):string|undefined{
  const m=record.metrics[key];if(!m)return undefined;
  const explicit=contextText(m.evaluationContext);if(explicit)return explicit;
  if(!qualityMetric(key,m))return undefined;
  // Reserved ratio sources describe arithmetic, not an independent evaluation.
  const ownSource=['qualityPerMB','qualityPerSec'].includes(key)?undefined:contextText(m.source);
  const q=record.metrics.quality,review=record.provenance.review as any;
  const qualityContext=contextText(q?.evaluationContext)??contextText(q?.source)??contextText(review?.source);
  return /^qualityPer[A-Z]/.test(key)?qualityContext??ownSource:ownSource??(/^quality(?:$|[A-Z])/.test(key)?qualityContext:undefined);
}
function normalizeMetric(key:string,input:unknown,issues:string[]):Metric{
  const o=input&&typeof input==='object'&&!Array.isArray(input)?input as any:{value:input};
  const def=known[key],unit=typeof o.unit==='string'&&o.unit?o.unit:def?.unit??'unspecified';
  const m:Metric={...o,value:finite(o.value)?o.value:null,unit,scope:typeof o.scope==='string'&&o.scope?o.scope:undefined,source:typeof o.source==='string'?o.source:undefined,evaluationContext:contextText(o.evaluationContext),direction:o.direction==='higher'||o.direction==='lower'?o.direction:def?.direction};
  if(o.value!=null&&!finite(o.value)){m.reason='Expected a finite number';m.raw=o.value;issues.push(`${key}: invalid numeric observation`);}
  if(m.value==null)m.reason??='Not recorded';
  if(key==='quality'&&(unit!=='points/10'||m.value!=null&&(m.value<0||m.value>10))){m.raw=o.value;m.value=null;m.reason='Quality requires points/10 in the range0–10';issues.push(`${key}: unsupported unit or range`);}
  if((key==='bytes'||key==='seconds')&&m.value!=null&&m.value<0){m.raw=o.value;m.value=null;m.reason='Negative denominator';issues.push(`${key}: negative value`);}
  return m;
}
export function deriveMetrics(metrics:Record<string,Metric>):Record<string,Metric>{
  const out={...metrics},q=out.quality,b=out.bytes,s=out.seconds;
  // Recompute reserved derived metrics; never trust caller-supplied ratios.
  const qOK=q?.value!=null&&q.unit==='points/10'&&!!q.scope;
  const evaluationContext=contextText(q?.evaluationContext)??contextText(q?.source);
  out.qualityPerMB=qOK&&b?.value!=null&&b.value>0&&b.unit==='bytes'?{value:q.value!/(b.value/1e6),unit:'points/MB',scope:q.scope,evaluationContext,direction:'higher',derived:true,source:'quality / (bytes / 1000000)'}:{value:null,unit:'points/MB',scope:q?.scope,evaluationContext,direction:'higher',derived:true,reason:!qOK?'A scored quality observation with a rubric scope is required':'Positive whole GLB bytes are required'};
  out.qualityPerSec=qOK&&s?.value!=null&&s.value>0&&s.unit==='s'&&!!s.scope?{value:q.value!/s.value,unit:'points/s',scope:`quality=${q.scope}; time=${s.scope}`,evaluationContext,direction:'higher',derived:true,source:'quality / seconds'}:{value:null,unit:'points/s',scope:undefined,evaluationContext,direction:'higher',derived:true,reason:!qOK?'A scored quality observation with a rubric scope is required':'Positive seconds with an explicit timing scope are required'};
  return out;
}
export function normalize(input:unknown,source:string):ResultRecord{
  const o=input&&typeof input==='object'&&!Array.isArray(input)?input as any:{};
  const issues:string[]=[],unsupported=o.schemaVersion!==1;
  if(unsupported)issues.push(`Unsupported schemaVersion ${String(o.schemaVersion)}; metrics quarantined`);
  if(typeof o.id!=='string'||!o.id)issues.push('Missing stable id');
  const rawMetrics=o.metrics&&typeof o.metrics==='object'&&!Array.isArray(o.metrics)?o.metrics:{};
  const metrics:Record<string,Metric>={};
  for(const [key,value] of Object.entries(rawMetrics)){
    // Reject prototype keys and control characters; preserve unusual names in extra data.
    if(['__proto__','constructor','prototype'].includes(key)||/[\x00-\x1f]/.test(key)){issues.push('Unsafe metric key ignored');continue;}
    metrics[key]=normalizeMetric(key,value,issues);
    if(unsupported){metrics[key].raw=value;metrics[key].value=null;metrics[key].reason='Unsupported schema version';}
  }
  const provenance=o.provenance&&typeof o.provenance==='object'?o.provenance:{};
  for(const [key,m] of Object.entries(metrics))m.evaluationContext=metricEvaluationContext({metrics,provenance},key);
  const views:View[]=[];
  for(const v of Array.isArray(o.views)?o.views:[]){const path=safePath(v?.path);if(!path||!path.toLowerCase().endsWith('.png')){issues.push('View requires a safe repo-relative PNG path');continue;}views.push({label:String(v.label??'Fixed perspective'),path,url:assetURL(path),available:false});}
  const motionViews:View[]=[];
  for(const v of Array.isArray(o.motionViews)?o.motionViews:[]){const path=safePath(v?.path);if(!path||!path.toLowerCase().endsWith('.png')){issues.push('Motion evidence requires a safe repo-relative PNG path');continue;}motionViews.push({label:String(v.label??'Motion phase sheet'),path,url:assetURL(path),available:false});}
  const artifacts:any={};
  for(const key of ['glb','review']){const value=o.artifacts?.[key],p=safePath(typeof value==='string'?value:value?.path);if(p)artifacts[key]={path:p,url:assetURL(p),available:false};else if(value)issues.push(`Unsafe ${key} path ignored`);}
  const recognized=new Set(['schemaVersion','id','name','cohort','baseStrategy','subStrategy','parentId','variant','status','assetRole','metrics','views','motionViews','artifacts','animations','notes','provenance']);
  return {id:String(o.id??source),name:String(o.name??o.id??source),cohort:String(o.cohort??'Unclassified'),baseStrategy:String(o.baseStrategy??'Unspecified'),subStrategy:String(o.subStrategy??'Unspecified'),parentId:typeof o.parentId==='string'?o.parentId:undefined,variant:typeof o.variant==='string'?o.variant:undefined,status:unsupported?'unsupported':String(o.status??'unrecorded'),assetRole:['master','variant','experiment'].includes(o.assetRole)?o.assetRole:o.variant?'variant':String(o.status??'').startsWith('master')||!o.parentId?'master':'experiment',metrics:deriveMetrics(metrics),views,motionViews,artifacts,animations:(Array.isArray(o.animations)?o.animations:[]).map((a:any)=>({name:String(a?.name??a),duration:finite(a?.duration)&&a.duration>=0?a.duration:undefined})),notes:(Array.isArray(o.notes)?o.notes:[]).map(String),provenance,source,issues,extra:Object.fromEntries(Object.entries(o).filter(([k])=>!recognized.has(k)))};
}
export function metricCatalog(records:ResultRecord[]):Dataset['metricCatalog']{
  const keys=[...new Set(records.flatMap(r=>Object.keys(r.metrics)))];
  return keys.map(key=>{const ms=records.map(r=>r.metrics[key]),valid=ms.filter(m=>m?.value!=null);const directions=[...new Set(valid.map(m=>m.direction).filter(Boolean))];return {key,units:[...new Set(valid.map(m=>m.unit))],scopes:[...new Set(valid.map(m=>m.scope??'unscoped'))],valid:valid.length,missing:records.length-valid.length,direction:directions.length===1?directions[0]:undefined};}).sort((a,b)=>a.key.localeCompare(b.key));
}
const dimensions=new Set(['bytes','triangles','vertices','textures','clips','joints','errors','warnings','tokens','inputTokens','cachedInputTokens','outputTokens','reasoningTokens']);
export function comparisonKey(record:ResultRecord,x:string,y:string):string|null{
  const a=record.metrics[x],b=record.metrics[y];if(a?.value==null||b?.value==null)return null;
  if(a.bound||b.bound)return null; // An upper bound is not an exact scored observation.
  if([x,y].some(k=>!dimensions.has(k)&&!record.metrics[k]?.scope))return null;
  const semanticScope=[x,y].filter(k=>!dimensions.has(k)).map(k=>`${k}:${record.metrics[k].scope}`).sort().join(' | ');
  const contexts=[...new Set([x,y])].map(k=>{const context=metricEvaluationContext(record,k);return context?`${k}: evaluation=${JSON.stringify(context)}`:'';}).filter(Boolean).sort().join(' | ');
  return `${record.cohort} | ${semanticScope||'recorded dimensions'} | ${x}:${a.unit} / ${y}:${b.unit}${contexts?' | '+contexts:''}`;
}
export function pareto(records:ResultRecord[],x:string,y:string):Set<string>{
  const groups=new Map<string,ResultRecord[]>();
  for(const r of records){const key=comparisonKey(r,x,y),a=r.metrics[x],b=r.metrics[y];if(key==null||!a?.direction||!b?.direction)continue;const group=JSON.stringify([key,a.direction,b.direction]),rows=groups.get(group)??[];rows.push(r);groups.set(group,rows);}
  const sign=(m:Metric)=>m.direction==='higher'?1:-1;
  return new Set([...groups.values()].flatMap(same=>same.filter(r=>!same.some(t=>{const a=r.metrics[x],b=r.metrics[y],rx=a.value!,ry=b.value!,tx=t.metrics[x].value!,ty=t.metrics[y].value!;return tx*sign(a)>=rx*sign(a)&&ty*sign(b)>=ry*sign(b)&&(tx!==rx||ty!==ry);})).map(r=>r.id)));
}

export function matchesAssetMode(r:ResultRecord,mode:string){return mode==='all'||mode==='masters'&&r.assetRole==='master'||mode==='variants'&&r.assetRole==='variant'||mode==='animated'&&r.animations.length>0||mode==='local'&&!!r.artifacts.glb?.available;}
