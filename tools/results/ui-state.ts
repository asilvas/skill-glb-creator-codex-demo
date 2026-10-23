import {matchesAssetMode,comparisonKey,type Dataset,type ResultRecord} from './model';

export type LicenseFilter='FREE'|'Restricted License'|'all';
/** Explicit local absence or reviewed-binary mismatch wins over a URL. An older
 * payload without an availability flag can still try its URL and fall back.
 */
export function inlineModelURL(record:ResultRecord|undefined):string|undefined{
  const glb=record?.artifacts.glb;
  if(!glb||typeof glb.url!=='string'||!glb.url.trim()||glb.available===false||glb.matchesRecordedHash===false||record?.history?.identityMatched===false)return;
  if(glb.expectedSHA256&&glb.actualSHA256&&glb.expectedSHA256!==glb.actualSHA256)return;
  return glb.url;
}
/** Preserve existing current-asset URLs; historical data is an explicit request. */
export function resultsAPIURL(reviewRound='',includeHistory=false){
  if(reviewRound&&includeHistory)throw Error('Choose one review panel or include all history');
  return '/api/results'+(reviewRound?'?'+new URLSearchParams({reviewRound}).toString():includeHistory?'?includeHistory=1':'');
}
/** Data-view additions preserve the mounted binary; an explicit disk refresh
 * resets it. Mount still invalidates changed availability or binary identity.
 */
export function acceptResultsData(payload:unknown,request:{reviewRound:string;includeHistory:boolean;preserveViewer?:boolean},resetViewer:()=>void):Dataset{
  const next=payload as Dataset;
  if(next?.schemaVersion!==1||!Array.isArray(next.records))throw Error('Unsupported dashboard payload');
  if((next.reviewHistory?.selectedRound??'')!==request.reviewRound||!!next.reviewHistory?.includeHistory!==request.includeHistory)throw Error('Server returned a different review data view');
  if(!request.preserveViewer)resetViewer();
  return next;
}
/** Fresh visits show every current bucket; old explicit cohort/panel links work. */
export function dataViewFromSearch(search:URLSearchParams){
  const reviewRound=search.get('reviewRound')??'';
  return {reviewRound,includeHistory:!reviewRound&&search.get('includeHistory')==='1',cohort:search.get('cohort')??''};
}
/** The All assets action clears narrowing filters without changing license choice. */
export function allAssetsSelection(){return {reviewRound:'',includeHistory:false,cohort:'',strategy:'',status:'',mode:'all',search:'',floor:0,unscored:true,group:'',active:'',compare:new Set<string>()};}
export type ResultFilters={cohort:string;strategy:string;status:string;license:LicenseFilter;mode:string;search:string;floor:number;unscored:boolean};
export function filterResultRows(records:ResultRecord[],state:ResultFilters){
  const needle=state.search.toLocaleLowerCase();
  return records.filter(row=>(!state.cohort||row.cohort===state.cohort)&&(!state.strategy||row.baseStrategy===state.strategy)&&(!state.status||row.status===state.status)&&matchesLicenseFilter(row,state.license)&&(!needle||[row.name,row.id,row.cohort,row.baseStrategy,row.subStrategy,row.license?.label??'Restricted License',...row.notes].join(' ').toLocaleLowerCase().includes(needle))&&(row.metrics.quality?.value==null?state.unscored:row.metrics.quality.value>=state.floor)&&matchesAssetMode(row,state.mode));
}
/** Numeric ordering is browsing only; it never merges or changes score scopes. */
export function sortResultRows(records:ResultRecord[],key:string,desc:boolean){
  const qualityBased=records.some(r=>r.metrics[key]&&(/^quality|^modelQuality|^humanQuality/.test(key)||/^points(?:\/|$)/.test(r.metrics[key].unit)));
  const scopes=new Set(records.filter(r=>r.metrics[key]?.value!=null).map(r=>comparisonKey(r,key,key)));
  if(qualityBased&&(scopes.size>1||scopes.has(null)))return [...records].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const value=(row:ResultRecord)=>key==='name'||key==='cohort'||key==='baseStrategy'||key==='status'?row[key]:row.metrics[key]?.value;
  return [...records].sort((a,b)=>{
    const av=value(a),bv=value(b);
    const tie=()=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
    if(av==null&&bv==null)return tie();if(av==null)return 1;if(bv==null)return -1;
    return (typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv)))*(desc?-1:1)||tie();
  });
}
export function selectedResult(rows:ResultRecord[],active:string,sort:string,desc:boolean){return rows.find(row=>row.id===active)??sortResultRows(rows,sort,desc)[0];}
export function localGLBLabel(record:ResultRecord){
  const glb=record.artifacts.glb;
  if(!glb||!glb.url?.trim())return 'Unavailable';
  if(glb.matchesRecordedHash===false||glb.expectedSHA256&&glb.actualSHA256&&glb.expectedSHA256!==glb.actualSHA256)return 'Reviewed file mismatch';
  return glb.available===true?'Local':glb.available===false?'Not local':'Availability unverified';
}
/** Old bookmarks and malformed values retain the commercial-use default. */
export function licenseFilterFromSearch(search:URLSearchParams):LicenseFilter{
  const value=search.get('license');
  return value==='all'||value==='Restricted License'?value:'FREE';
}
export function matchesLicenseFilter(record:ResultRecord,filter:LicenseFilter){
  return filter==='all'||(record.license?.label??'Restricted License')===filter;
}
export function visibleLicenseSelection(records:ResultRecord[],filter:LicenseFilter,active:string,compare:Set<string>){
  const visible=new Set(records.filter(record=>matchesLicenseFilter(record,filter)).map(record=>record.id));
  return {active:visible.has(active)?active:'',compare:new Set([...compare].filter(id=>visible.has(id)))};
}
