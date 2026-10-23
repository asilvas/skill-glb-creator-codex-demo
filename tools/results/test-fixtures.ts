/** Synthetic routing policy for tests; not an actual technology/license clearance. */
import type {LicenseAudit,LicenseAssessment} from './license';
export function syntheticLicenseAudit():LicenseAudit{
 const families:Record<string,LicenseAssessment>={};
 const add=(family:string,label:'FREE'|'Restricted License',status:'verified'|'restricted'|'unverified',reason='Synthetic test policy')=>families[family]={family,label,status,reason,evidence:[{title:'Synthetic policy fixture',url:'https://example.invalid/test-policy'}],obligations:['Synthetic fixture notice']};
 for(const family of['procedural-authoring','procedural-skinning','triposr-shape','triposr-reference','native-trellis-v1-audited','direct3d-s2-v11-audited','pixal-query512-original-coherent3d-v2-audited','pixal3d-paper-query-tiled-guided-audited-v1'])add(family,'FREE','verified');
 for(const family of['trellis-research','hunyuan-research','pixal3d-research','triposg-shape','triposg-reference'])add(family,'Restricted License','restricted');
 add('qwen-image-edit-2511-audited','Restricted License','unverified','Synthetic eager runtime closure remains unaudited');add('unverified','Restricted License','unverified');
 return{schemaVersion:1,reviewed:'synthetic-test-date',policy:{scope:'Synthetic test routing, no actual clearance'},families};
}
