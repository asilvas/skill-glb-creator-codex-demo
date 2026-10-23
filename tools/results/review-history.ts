/** Read-only historical review observations. Never mutate or regrade asset records. */
import {createHash} from 'node:crypto';
import {existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {assetURL,finite,metric,normalize,safePath,type Dataset,type ResultRecord,type ReviewHistoryDescriptor,type View} from './model';
import {classifyLicense} from './license';

const base='experiments/powerhouse/reviews';
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const isSHA=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const validReviewRound=(value:string)=>/^round-[1-9]\d*$/.test(value);
export const historyCohort=(round:string)=>`Powerhouse review history · ${round}`;
type Document={source:string;sha256?:string;data?:any;error?:string};
export type ReviewPanel={descriptor:ReviewHistoryDescriptor;quality:Document;map:Document;manifest:Document;issues:string[]};
async function document(root:string,source:string):Promise<Document>{
  try{const file=Bun.file(resolve(root,source));if(!await file.exists())return {source,error:'Not retained'};const bytes=await file.bytes();return {source,sha256:sha(bytes),data:JSON.parse(new TextDecoder().decode(bytes))};}
  catch(error){return {source,error:`Invalid JSON: ${String(error)}`};}
}
export async function discoverReviewHistory(root:string):Promise<ReviewPanel[]>{
  if(!existsSync(resolve(root,base)))return [];
  const rounds:string[]=[];
  for await(const path of new Bun.Glob('round-*/quality.json').scan({cwd:resolve(root,base),onlyFiles:true})){
    const round=path.replaceAll('\\','/').split('/')[0];if(validReviewRound(round))rounds.push(round);
  }
  return await Promise.all(rounds.sort((a,b)=>Number(a.slice(6))-Number(b.slice(6))).map(async round=>{
    const [quality,map,manifest]=await Promise.all(['quality.json','map.json','manifest.json'].map(name=>document(root,`${base}/${round}/${name}`)));
    const q=quality.data,m=map.data,issues:string[]=[];
    if(quality.error)issues.push(`Quality document: ${quality.error}`);
    if(map.error)issues.push(`Identity map: ${map.error}`);
    if(q?.schemaVersion!==1||m?.schemaVersion!==1)issues.push('Unsupported or missing quality/map schema');
    if(q?.round!==round)issues.push('Quality round does not match its folder');
    if(typeof q?.rubric!=='string'||!q.rubric.trim()||q.rubric!==m?.rubric)issues.push('Quality/map rubric mismatch or missing rubric');
    if(!isSHA(q?.referenceSHA256)||q.referenceSHA256!==m?.referenceSHA256)issues.push('Quality/map reference identity mismatch');
    if(!Array.isArray(q?.candidates)||!Array.isArray(m?.candidates))issues.push('Missing candidate list');
    if(manifest.data&&(manifest.data.schemaVersion!==1||manifest.data.referenceSHA256!==q?.referenceSHA256||manifest.data.rubric!==q?.rubric))issues.push('Manifest context differs from the review');
    if(manifest.error&&manifest.error!=='Not retained')issues.push('Manifest: '+manifest.error);
    return {descriptor:{round,cohort:historyCohort(round),count:Array.isArray(q?.candidates)?q.candidates.length:0,status:issues.length?'invalid':'available',source:quality.source,mapSource:map.source,qualitySHA256:quality.sha256,mapSHA256:map.sha256},quality,map,manifest,issues};
  }));
}

/** Full per-request file hashing; same size or timestamps alone never enable a viewer. */
async function hashFile(path:string):Promise<string>{
  const hasher=createHash('sha256');for await(const chunk of Bun.file(path).stream())hasher.update(chunk);return hasher.digest('hex');
}
export async function historicalReviewRecords(root:string,panel:ReviewPanel,current:ResultRecord[],files=new Map<string,Promise<string>>()):Promise<{records:ResultRecord[];issues:Dataset['issues']}>{
  const q=panel.quality.data,m=panel.map.data,records:ResultRecord[]=[],issues:Dataset['issues']=panel.issues.map(message=>({source:panel.quality.source,message}));
  if(!Array.isArray(q?.candidates))return {records,issues};
  const hashed=(path:string)=>{const absolute=resolve(root,path);let found=files.get(absolute);if(!found){found=hashFile(absolute);files.set(absolute,found);}return found;};
  const evidence=async(path:unknown,label:string,expected?:unknown):Promise<View|undefined>=>{
    const safe=safePath(path);if(!safe||!safe.toLowerCase().endsWith('.png'))return undefined;
    let available=existsSync(resolve(root,safe));
    if(expected!==undefined&&!isSHA(expected))available=false;
    if(available&&isSHA(expected)){try{available=await hashed(safe)===expected;}catch{available=false;}}
    return {label,path:safe,url:assetURL(safe),available};
  };
  const allQuality=q.candidates as any[],mapCandidates=Array.isArray(m?.candidates)?m.candidates:[];
  for(const [index,candidate] of allQuality.entries()){
    const problems=[...panel.issues],originalId=typeof candidate?.id==='string'&&candidate.id?candidate.id:`unknown-${index+1}`;
    const repeated=allQuality.filter(item=>item?.id===candidate?.id||item?.code===candidate?.code).length!==1;
    if(repeated)problems.push('Duplicate quality candidate id or code');
    const mappings=mapCandidates.filter((item:any)=>item?.id===candidate?.id&&item?.code===candidate?.code);
    const entry=mappings.length===1?mappings[0]:undefined;
    if(!entry||mapCandidates.filter((item:any)=>item?.id===candidate?.id||item?.code===candidate?.code).length!==1)problems.push('Candidate needs one unambiguous map join by both id and code');
    if(typeof candidate?.id!=='string'||!candidate.id||typeof candidate?.code!=='string'||!candidate.code)problems.push('Missing candidate identity');
    // Aggregators can retain e.g. mean6.599999999999999 with range6.6–6.6.
    // Allow only arithmetic roundoff in the order check; never round/recompute scores.
    const epsilon=Number.EPSILON*16*Math.max(1,Math.abs(candidate?.mean??0),Math.abs(candidate?.min??0),Math.abs(candidate?.max??0));
    if(!finite(candidate?.mean)||candidate.mean<0||candidate.mean>10||!finite(candidate?.min)||!finite(candidate?.max)||candidate.min<0||candidate.max>10||candidate.min>candidate.mean+epsilon||candidate.max<candidate.mean-epsilon)problems.push('Invalid retained quality/range; values are not recomputed');
    const manifestCandidates=panel.manifest.data?.candidates;
    const manifestEntry=Array.isArray(manifestCandidates)?manifestCandidates.filter((item:any)=>item?.id===originalId):[];
    if(panel.manifest.data&&(manifestEntry.length!==1||manifestEntry[0].glbSHA256!==entry?.glbSHA256))problems.push('Frozen manifest and identity map disagree about the asset');
    const context=[panel.quality.source,`quality-sha256=${panel.quality.sha256}`,`map-sha256=${panel.map.sha256}`,`rubric=${q.rubric}`,`reference=${q.referenceSHA256}`].join(' | ');
    const scoreOK=problems.length===0;
    const parents=current.filter(row=>row.id===originalId);
    const parent=parents.length===1?parents[0]:undefined;
    const ambiguousParent=current.some(row=>row.id.startsWith(originalId+'#duplicate-'));
    const expected=isSHA(entry?.glbSHA256)?entry.glbSHA256:undefined;
    const identity=scoreOK&&!!expected&&!!parent&&!['unsupported','duplicate'].includes(parent.status)&&!ambiguousParent&&parent.provenance.glbSHA256===expected;
    if(!identity)problems.push('Same-binary metadata binding unavailable; size, views, animation and local model are withheld');
    const metrics:Record<string,any>={
      quality:{...metric(scoreOK?candidate.mean:null,'points/10',typeof q.rubric==='string'?q.rubric:undefined,panel.quality.source,'higher'),evaluationContext:context,...(!scoreOK?{reason:'Historical observation quarantined; inspect import diagnostics'}:{})},
      qualityMin:{...metric(scoreOK?candidate.min:null,'points/10',q.rubric,panel.quality.source,'higher'),evaluationContext:context},
      qualityMax:{...metric(scoreOK?candidate.max:null,'points/10',q.rubric,panel.quality.source,'higher'),evaluationContext:context},
      reviewerCount:metric(scoreOK?candidate.reviewerCount:null,'count','retained-panel-reviewer-count',panel.quality.source),
      qualitySampleStandardDeviation:{...metric(scoreOK?candidate.sampleStandardDeviation:null,'points/10',q.rubric,panel.quality.source),evaluationContext:context},
    };
    if(scoreOK&&candidate.criteria&&typeof candidate.criteria==='object'&&!Array.isArray(candidate.criteria))for(const [key,value]of Object.entries(candidate.criteria)){
      if(!/^[a-z][a-zA-Z0-9]*$/.test(key))continue;
      metrics['quality'+key[0].toUpperCase()+key.slice(1)]={...metric(finite(value)&&value>=0&&value<=10?value:null,'points',`${q.rubric}:${key}`,panel.quality.source,'higher'),evaluationContext:context};
    }
    if(identity&&parent)for(const key of ['bytes','triangles','vertices']){
      const value=parent.metrics[key];if(value?.value!=null&&finite(value.value)&&value.value>=0&&value.unit===(key==='bytes'?'bytes':'count'))metrics[key]={...value,source:parent.source,scope:value.scope??'same-binary-archived-measurement'};
    }
    const rawViews=identity&&Array.isArray(entry?.views)?entry.views:[];
    const proof=manifestEntry[0]?.evidence;
    const fixed:View[]=[];
    for(const [viewIndex,path]of rawViews.entries()){
      const expectedView=Array.isArray(proof)?proof.find((item:any)=>item?.path===path)?.sha256:undefined;
      const view=await evidence(path,`Frozen ${panel.descriptor.round} / perspective ${viewIndex+1}`,expectedView);if(view)fixed.push(view);
    }
    const boards:View[]=[];
    if(scoreOK&&entry)for(const [key,digest,label]of [['board','boardSHA256','Frozen four-view review board'],['focalBoard','focalBoardSHA256','Frozen focal review board']]as const){
      const view=await evidence(entry[key],`${panel.descriptor.round} / ${label}`,entry[digest]);if(view)boards.push(view);
      if(view&&!view.available&&existsSync(resolve(root,view.path)))problems.push(label+' hash differs; image withheld');
    }
    const observation=normalize({schemaVersion:1,id:`review-history/${panel.descriptor.round}/${encodeURIComponent(originalId)}${repeated?`/duplicate-${index+1}`:''}`,
      name:`${parent?.name??originalId} · ${panel.descriptor.round}`,cohort:panel.descriptor.cohort,baseStrategy:identity?parent!.baseStrategy:'Unbound historical asset',subStrategy:identity?parent!.subStrategy:'Retained review observation',parentId:originalId,assetRole:'experiment',status:scoreOK?'historical-review':'historical-review-quarantined',metrics,
      views:fixed,animations:identity?parent!.animations:[],artifacts:{...(identity&&parent?.artifacts.glb?{glb:parent.artifacts.glb.path}:{}),review:`${base}/${panel.descriptor.round}/REVIEW.md`},
      notes:['Historical review observation, not another generated model. Mean, range and criteria are read without regrading from the named frozen panel.','Different panels are separate evaluation contexts; there is no pooled or cross-round quality ranking. Reviewer ranges are disagreement, not confidence intervals.','No authoring time, component time, tokens, cost or qualityPerSec is inherited. Same-binary archived bytes alone may support qualityPerMB.','Commercial eligibility follows the original asset’s current resolved audit policy, not a historical FREE label.',...(Array.isArray(q.limitations)?q.limitations:[])],
      provenance:{review:{round:panel.descriptor.round,source:panel.quality.source,rubric:q.rubric,referenceSHA256:q.referenceSHA256,code:candidate?.code},reviewHistory:{originalAssetId:originalId,qualitySHA256:panel.quality.sha256,mapSource:panel.map.source,mapSHA256:panel.map.sha256,manifestSource:panel.manifest.data?panel.manifest.source:null,expectedGLBSHA256:expected,identityMatched:identity},retainedReview:candidate},
    },panel.quality.source);
    observation.views=fixed;
    observation.history={round:panel.descriptor.round,originalAssetId:originalId,expectedGLBSHA256:expected,identityMatched:identity,boards,qualitySHA256:panel.quality.sha256!,mapSHA256:panel.map.sha256};
    observation.issues.push(...problems);
    const policy=identity&&parent?.license?parent.license:classifyLicense({});
    observation.license={...policy,evidence:policy.evidence.map(item=>({...item})),obligations:[...policy.obligations],inheritedFrom:originalId,reason:identity?`Same recorded binary as ${originalId}; current audit policy: ${policy.reason}`:'Historical asset identity/ancestry is unverified; commercial eligibility fails closed.'};
    if(observation.artifacts.review)observation.artifacts.review.available=existsSync(resolve(root,observation.artifacts.review.path));
    const glb=observation.artifacts.glb;
    if(glb){
      glb.url=assetURL(glb.path)+'?reviewSHA256='+expected;
      glb.expectedSHA256=expected;glb.recordedBytes=observation.metrics.bytes?.value??undefined;
      if(existsSync(resolve(root,glb.path))){try{
        glb.actualSHA256=await hashed(glb.path);glb.matchesRecordedHash=glb.actualSHA256===expected;glb.actualBytes=statSync(resolve(root,glb.path)).size;glb.matchesRecordedSize=glb.recordedBytes==null?undefined:glb.actualBytes===glb.recordedBytes;glb.available=glb.matchesRecordedHash;
        if(!glb.matchesRecordedHash)observation.issues.push('Local GLB SHA256 differs from the frozen reviewed binary; viewer disabled. Archived same-binary measurements remain retained.');
        if(glb.matchesRecordedHash&&glb.matchesRecordedSize===false){observation.issues.push('Archived byte count conflicts with the hash-matched local binary; size ratio withheld.');observation.metrics.bytes={...observation.metrics.bytes,value:null,reason:'Conflicting archived byte count'};observation.metrics.qualityPerMB={...observation.metrics.qualityPerMB,value:null,reason:'Conflicting archived byte count'};}
      }catch(error){glb.available=false;observation.issues.push('Local GLB hash could not be verified: '+String(error));}}
    }
    records.push(observation);
    for(const message of problems)issues.push({source:panel.quality.source,message:`${originalId}: ${message}`});
  }
  return {records,issues};
}
