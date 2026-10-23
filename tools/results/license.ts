/** Technology-route eligibility, not a copyright warranty for caller-supplied art. */
type LicenseGrant={label:'FREE'|'Restricted License';status:'verified'|'restricted'|'unverified';family:string;reason:string;evidence:{title:string;url:string}[];obligations:string[]};
export type LicenseComponent=LicenseGrant&{stage:'Geometry'|'Materials'};
export type LicenseAssessment=LicenseGrant&{inheritedFrom?:string;components?:LicenseComponent[]};
export type LicenseRecord={id?:string;name?:string;baseStrategy?:string;subStrategy?:string;parentId?:string;source?:string;provenance?:Record<string,unknown>;extra?:Record<string,unknown>;license?:unknown};
type Lookup=Map<string,LicenseRecord>|((id:string)=>LicenseRecord|undefined);
export type LicenseAudit={schemaVersion:1;reviewed?:string;policy:Record<string,string>;families:Record<string,LicenseAssessment>};
const unverified:LicenseAssessment={family:'unverified',label:'Restricted License',status:'unverified',reason:'No matching local technology audit is loaded; commercial eligibility is unverified.',evidence:[],obligations:[]};
/** Browser-safe and fail-closed. Audit data is optional runtime input, never bundled. */
export function licenseAudit(input:unknown):LicenseAudit{
  const file=input as any,families:Record<string,LicenseAssessment>=Object.create(null),policy:Record<string,string>={};
  if(file?.schemaVersion===1&&file.families&&typeof file.families==='object'&&!Array.isArray(file.families))for(const[key,row]of Object.entries(file.families) as [string,any][]){
    if(['__proto__','constructor','prototype'].includes(key)||!row||row.family!==key||!['FREE','Restricted License'].includes(row.label)||!['verified','restricted','unverified'].includes(row.status)||row.label==='FREE'&&row.status!=='verified'||typeof row.reason!=='string'||!Array.isArray(row.evidence)||!row.evidence.every((e:any)=>typeof e?.title==='string'&&typeof e?.url==='string')||!Array.isArray(row.obligations)||!row.obligations.every((o:any)=>typeof o==='string'))continue;
    families[key]={family:key,label:row.label,status:row.status,reason:row.reason,evidence:row.evidence.map((e:any)=>({title:e.title,url:e.url})),obligations:[...row.obligations]};
  }
  if(file?.policy&&typeof file.policy==='object')for(const[k,v]of Object.entries(file.policy))if(typeof v==='string'&&!['__proto__','constructor','prototype'].includes(k))policy[k]=v;
  return{schemaVersion:1,reviewed:typeof file?.reviewed==='string'?file.reviewed:undefined,policy,families};
}
const s2GeometryFamilies=new Set(['direct3d-s2-v11-audited','pixal3d-paper-dinov2-weightfree-audited-v1','pixal3d-paper-query-tiled-guided-audited-v1']);

function knownFamily(record:LicenseRecord,families:Record<string,LicenseAssessment>):string|undefined{
  const id=record.id??'',source=(record.source??'').replaceAll('\\','/');
  const explicit=record.provenance?.licenseAuditFamily;
  // The audited mesh-only v1 adapter is a separate route from historical v2.
  // A model-name or FREE tag alone cannot bypass the conservative legacy rule.
  if(source.startsWith('experiments/powerhouse/')&&explicit==='native-trellis-v1-audited'&&
    ['trellis-v1-allowlist-v1','trellis-v1-allowlist-v2'].includes(String(record.provenance?.auditProfile))&&
    record.provenance?.checkpointCommit==='25e0d31ffbebe4b5a97464dd851910efc3002d96')return explicit;
  // Restricted ancestry remains restricted even when no master is present locally.
  if(/trellis/i.test([id,record.baseStrategy,record.subStrategy].join(' ')))return 'trellis-research';
  if(/hunyuan|hybrid-dielectric|hybrid-intrinsic/i.test([id,record.baseStrategy].join(' ')))return 'hunyuan-research';
  if(/pixal3d/i.test([id,record.baseStrategy].join(' ')))return 'pixal3d-research';
  if(/triposg/i.test([id,record.baseStrategy].join(' ')))return 'triposg-shape';
  // FREE is allowlisted by retained recipe/source or by a reviewed audit family,
  // never by an arbitrary technique name or caller-provided FREE string.
  if(source==='results/experiment/metrics.json'&&/^(authoring-20261017\/(blender|candidate|inherited)-[1-4]|authoring-batch\/(blender|candidate|inherited))$/.test(id))return 'procedural-authoring';
  if(source==='results/experiment/replay/metrics.json'&&/^same-recipe-replay\/(candidate|inherited)-\d+$/.test(id))return 'procedural-authoring';
  if(source==='results/exploration/lossless.json'&&/^lossless\/(blender-1|inherited-2|candidate-3)$/.test(id))return 'procedural-authoring';
  if(source==='results/exploration/skinning.json'&&/^skinning-fixture\/(rigid|smooth)$/.test(id))return 'procedural-skinning';
  if(source==='results/exploration/findings.json'&&/^neural-exploration\/triposg(?:-depth9)?$/.test(id))return 'triposg-shape';
  if(source==='results/exploration/findings.json'&&/^neural-exploration\/triposr-(128|256)$/.test(id))return 'triposr-shape';
  if(/^results\/material-pilot\/quality(?:-primary-eight)?\.json$/.test(source)&&/^material-(all15|primary8)\/projection(?:-uv-(2|5)px)?$/.test(id))return 'triposg-reference';
  if(explicit==='native-trellis-v1-audited')return undefined;
  if(typeof explicit==='string'&&Object.hasOwn(families,explicit)&&explicit!=='unverified')return explicit;
  return undefined;
}

/** Missing reviews, broken ancestry, and cycles fail closed; restrictive parents
 * cannot be laundered by repacking, retopology, rigging, or a FREE child claim. */
export function classifyLicense(record:LicenseRecord,lookup?:Lookup,input?:unknown):LicenseAssessment{
  const {families}=licenseAudit(input),known=(row:LicenseRecord)=>knownFamily(row,families);
  const clone=(key:string):LicenseAssessment=>{const row=families[key]??families.unverified??unverified;return{...row,evidence:row.evidence.map(e=>({...e})),obligations:[...row.obligations]};};
  const visited=new Set<string>();
  const find=(id:string)=>typeof lookup==='function'?lookup(id):lookup?.get(id);
  const assess=(row:LicenseRecord):LicenseAssessment=>{
    const id=row.id??'';
    if(id&&visited.has(id))return {...clone('unverified'),reason:'License ancestry contains a cycle; commercial eligibility is unverified.'};
    if(id)visited.add(id);
    const family=known(row);
    let own=family?clone(family):clone('unverified');
    const upstream=row.provenance?.upstreamLicenseFamilies;
    if(upstream!==undefined){
      if(!Array.isArray(upstream)||upstream.some(k=>typeof k!=='string'))own={...clone('unverified'),reason:'Malformed upstream technology families; commercial eligibility is unverified.'};
      else for(const key of [...new Set(upstream as string[])]){
        const dependency=clone(key);
        if(dependency.label==='Restricted License'){
          own={...dependency,inheritedFrom:`family:${key}`,reason:`Additional upstream technology ${key}: ${dependency.reason}`};break;
        }
        if(own.label==='FREE'&&key!==own.family){own={...own,reason:own.reason+` Additional audited route: ${key}.`,evidence:[...own.evidence,...dependency.evidence.filter(d=>!own.evidence.some(e=>e.url===d.url))],obligations:[...new Set([...own.obligations,...dependency.obligations])]};}
      }
    }
    if(row.parentId){
      const parent=find(row.parentId);
      const parentAssessment=parent?assess(parent):known({id:row.parentId})?clone(known({id:row.parentId})!):undefined;
      if(parentAssessment?.label==='Restricted License'){
        if(own.label==='Restricted License'&&own.status==='restricted')return {...own,inheritedFrom:row.parentId};
        return {...parentAssessment,inheritedFrom:row.parentId,reason:`Inherits ${row.parentId}: ${parentAssessment.reason}`};
      }
      // A new recipe with an audited family explicitly records its own reviewed
      // upstream path; a free parent alone does not audit arbitrary new tooling.
      if(!parentAssessment&&own.label==='FREE'&&!row.provenance?.licenseAuditFamily)return {...clone('unverified'),reason:`Missing license ancestry ${row.parentId}; commercial eligibility is unverified.`};
    }
    return own;
  };
  const assessment=assess(record);
  // Explain eligible geometry separately from a composite's material ancestry.
  // This annotation never changes the complete asset's commercial-use filter.
  const family=known(record),upstream=record.provenance?.upstreamLicenseFamilies;
  const declared=Array.isArray(upstream)?upstream.filter((key):key is string=>typeof key==='string'):[];
  const geometryFamily=family&&s2GeometryFamilies.has(family)?family:
    family&&families[family]?.label==='FREE'?declared.find(key=>s2GeometryFamilies.has(key)):undefined;
  if(geometryFamily){
    assessment.components=[{stage:'Geometry',...clone(geometryFamily)}];
    if(declared.includes('qwen-image-edit-2511-audited')){
      const materials=clone('qwen-image-edit-2511-audited');
      assessment.components.push({stage:'Materials',...materials,
        reason:'Historical Qwen material route; this restriction is separate from Direct3D-S2 geometry. '+materials.reason});
    }
  }
  return assessment;
}
