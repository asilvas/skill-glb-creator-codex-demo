/** Additive presentation assessment, applied only after current/history construction. */
import {finite,type ResultRecord,type Dataset} from './model';
export const ASSESSMENT_SOURCE='results/quality-assessments.json';
type Assessment={id:string;kind:'human-upper-bound';assetSHA256s:string[];ceiling:number;rubric:string;referenceSHA256:string;source:string;feedback:string;outcome:'rejected-for-candidate-consideration'};
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v)?v.toLowerCase():undefined;
export function reviewedAssetSHA256(row:ResultRecord){
  // A historical observation belongs to its frozen binary, even if the current file changed.
  if(row.history)return hash(row.history.expectedGLBSHA256);
  return hash(row.provenance.glbSHA256)??hash(row.artifacts.glb?.expectedSHA256);
}
export function applyQualityAssessments(records:ResultRecord[],input:unknown,issues:Dataset['issues']=[]){
  const assessments:Assessment[]=[];
  if(input!=null){
    const file=input as any;
    if(file?.schemaVersion!==1||!Array.isArray(file.assessments))issues.push({source:ASSESSMENT_SOURCE,message:'Invalid quality assessment schema; no human assessment applied.'});
    else {const ids=new Set<string>();for(const a of file.assessments){
      if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||a.kind!=='human-upper-bound'||!Array.isArray(a.assetSHA256s)||!a.assetSHA256s.length||!a.assetSHA256s.every((s:any)=>!!hash(s))||!finite(a.ceiling)||a.ceiling<0||a.ceiling>10||typeof a.rubric!=='string'||!a.rubric||!hash(a.referenceSHA256)||typeof a.source!=='string'||!a.source||typeof a.feedback!=='string'||!a.feedback||a.outcome!=='rejected-for-candidate-consideration'){
        issues.push({source:ASSESSMENT_SOURCE,message:'Invalid human upper-bound assessment; expected exact binary/reference hashes and a ceiling in 0–10.'});continue;
      }
      ids.add(a.id);assessments.push(a);
    }}
  }
  for(const row of records){
    const q=row.metrics.quality,originalStatus=row.status,review=row.provenance.review as any;
    const rubric=q?.scope,reference=hash(row.provenance.referenceSHA256)??hash(review?.referenceSHA256),identity=reviewedAssetSHA256(row);
    const matches=assessments.filter(a=>identity&&a.assetSHA256s.some(s=>hash(s)===identity)&&a.rubric===rubric&&hash(a.referenceSHA256)===reference);
    const a=matches.sort((x,y)=>x.ceiling-y.ceiling||x.id.localeCompare(y.id))[0];
    if(a){
      const reason='Human rejects the model judge estimate; the human ceiling is an upper bound, not an exact score.';
      for(const key of ['quality','qualityMin','qualityMax']){
        const metric=row.metrics[key];if(metric)row.metrics['model'+key[0].toUpperCase()+key.slice(1)]={...metric};
        row.metrics[key]={...(metric??{unit:'points/10',scope:rubric}),value:null,reason};
      }
      for(const key of ['qualityPerMB','qualityPerSec'])row.metrics[key]={...row.metrics[key],value:null,reason,derived:true};
      row.metrics.humanQualityCeiling={value:a.ceiling,unit:'points/10',scope:a.rubric,source:a.source,evaluationContext:a.source,bound:'upper',reason:'Human upper bound only; no exact quality score or ratio can be derived.'};
      row.qualityAssessment={status:'human-rejected',label:`Human: at most ${a.ceiling}/10`,detail:a.feedback,source:a.source,recordedModelScore:q?.value??null,candidateEligible:false,originalStatus,assessmentId:a.id};
      row.status='human-rejected';
    }else if(rubric==='powerhouse-static-v1'){
      row.qualityAssessment={status:'unvalidated-model-estimate',label:'Unvalidated model estimate',detail:'Uncalibrated model-review estimate. An 8/10 model vote does not establish human candidate eligibility or accepted quality.',source:q?.source??String(review?.source??row.source),recordedModelScore:q?.value??null,candidateEligible:false,originalStatus};
      row.status='unvalidated-model-review';
    }else if(/^material-(?:all15|primary8)-/.test(rubric??'')){
      row.qualityAssessment={status:'material-only',label:'MATERIAL ONLY · model estimate',detail:'Material appearance review only; this is not a complete-asset quality rating.',source:q?.source??row.source,recordedModelScore:q?.value??null,candidateEligible:false,originalStatus};
    }
  }
  return records;
}
