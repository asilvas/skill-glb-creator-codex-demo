import {describe,expect,test} from 'bun:test';
import {classifyLicense as classify,type LicenseRecord} from './license';
import {syntheticLicenseAudit} from './test-fixtures';
const classifyLicense=(record:LicenseRecord,lookup?:Map<string,LicenseRecord>)=>classify(record,lookup,syntheticLicenseAudit());

test('without local audit data even known route names fail closed; malformed FREE grants cannot certify a route',()=>{
  const r={id:'fixture',provenance:{licenseAuditFamily:'procedural-authoring'}};
  expect(classify(r).label).toBe('Restricted License');expect(classify(r).status).toBe('unverified');
  const audit=syntheticLicenseAudit();audit.families['procedural-authoring'].status='unverified';expect(classify(r,undefined,audit).label).toBe('Restricted License');
});

describe('commercial technology eligibility',()=>{
  test('audited local authoring qualifies while file-level restrictions override a model badge',()=>{
    expect(classifyLicense({id:'authoring-20261017/blender-1',source:'results/experiment/metrics.json'}).label).toBe('FREE');
    expect(classifyLicense({id:'material-all15/projection-uv-2px',source:'results/material-pilot/quality.json'}).label).toBe('Restricted License');
    expect(classifyLicense({id:'neural-exploration/triposg-depth9',source:'results/exploration/findings.json'}).label).toBe('Restricted License');
    expect(classifyLicense({id:'neural-exploration/triposr-256',source:'results/exploration/findings.json'}).label).toBe('FREE');
  });
  test('technique names and raw FREE claims cannot self-certify a new recipe',()=>{
    for(const value of [{id:'new',baseStrategy:'Blender CLI',license:'FREE'},{id:'new',baseStrategy:'TripoSR'},{id:'new',provenance:{licenseAuditFamily:'not-reviewed'}}]){
      expect(classifyLicense(value).status).toBe('unverified');
      expect(classifyLicense(value).label).toBe('Restricted License');
    }
    expect(classifyLicense({id:'new',baseStrategy:'TripoSG',provenance:{licenseAuditFamily:'triposr-reference'}}).status).toBe('restricted');
  });
  test('repacking and an explicit free family cannot clear a restricted parent',()=>{
    const source:LicenseRecord={id:'source',baseStrategy:'TRELLIS'};
    const child:LicenseRecord={id:'packed',parentId:'source',provenance:{licenseAuditFamily:'triposr-reference'}};
    const assessment=classifyLicense(child,new Map([['source',source]]));
    expect(assessment.label).toBe('Restricted License');
    expect(assessment.inheritedFrom).toBe('source');
    expect(assessment.family).toBe('trellis-research');
  });
  test('all known historical research descendants remain restricted with missing local GLBs or parents',()=>{
    expect(classifyLicense({id:'auto-round-4--trellis-compact-master-default-selected-01'}).family).toBe('trellis-research');
    expect(classifyLicense({id:'variant',parentId:'hunyuan-dielectric-master'}).family).toBe('hunyuan-research');
  });
  test('selective v1 profile does not clear generic TRELLIS or restricted ancestry',()=>{
    const row:LicenseRecord={id:'powerhouse-trellis-v1',source:'experiments/powerhouse/trellis/x/experiment.json',baseStrategy:'TRELLIS v1',provenance:{licenseAuditFamily:'native-trellis-v1-audited',auditProfile:'trellis-v1-allowlist-v2',checkpointCommit:'25e0d31ffbebe4b5a97464dd851910efc3002d96'}};
    expect(classifyLicense(row).label).toBe('FREE');
    expect(classifyLicense({...row,provenance:{licenseAuditFamily:'native-trellis-v1-audited'}}).label).toBe('Restricted License');
    expect(classifyLicense({...row,source:'results/material-pilot/quality.json'}).label).toBe('Restricted License');
    const parent:LicenseRecord={id:'trellis-old',baseStrategy:'TRELLIS.2'};
    expect(classifyLicense({...row,parentId:parent.id},new Map([[parent.id!,parent]])).label).toBe('Restricted License');
  });
  test('broken or cyclic ancestry fails closed and is distinct from a known prohibition',()=>{
    const a:LicenseRecord={id:'a',parentId:'b'},b:LicenseRecord={id:'b',parentId:'a'};
    const result=classifyLicense(a,new Map([['a',a],['b',b]]));
    expect(result.label).toBe('Restricted License');
    expect(result.status).toBe('unverified');
    expect(result.reason).toContain('cycle');
  });
  test('audited new path requires an explicit registry family and never infers from a FREE parent',()=>{
    const parent:LicenseRecord={id:'neural-exploration/triposr-256',source:'results/exploration/findings.json'};
    const lookup=new Map([[parent.id!,parent]]);
    expect(classifyLicense({id:'new',parentId:parent.id},lookup).status).toBe('unverified');
    expect(classifyLicense({id:'new',parentId:parent.id,provenance:{licenseAuditFamily:'triposr-reference'}},lookup).label).toBe('FREE');
  });
  test('an extra image/model route must also be audited and cannot be hidden by an eligible mesh',()=>{
    const row:LicenseRecord={id:'derived',source:'experiments/powerhouse/x/experiment.json',baseStrategy:'TRELLIS v1',provenance:{licenseAuditFamily:'native-trellis-v1-audited',auditProfile:'trellis-v1-allowlist-v2',checkpointCommit:'25e0d31ffbebe4b5a97464dd851910efc3002d96',upstreamLicenseFamilies:['qwen-image-edit-2511-audited']}};
    const qwen=classifyLicense(row);
    expect(qwen.label).toBe('Restricted License');
    expect(qwen.status).toBe('unverified');
    expect(qwen.reason).toContain('eager');
    expect(classifyLicense({...row,provenance:{...row.provenance,upstreamLicenseFamilies:['trellis-research']}}).status).toBe('restricted');
    expect(classifyLicense({...row,provenance:{...row.provenance,upstreamLicenseFamilies:['unknown-editor']}}).status).toBe('unverified');
    expect(classifyLicense({...row,provenance:{...row.provenance,upstreamLicenseFamilies:'FREE'}}).label).toBe('Restricted License');
  });
  test('Direct3D-S2 geometry stays visibly FREE while historical materials keep the composite restricted',()=>{
    const row:LicenseRecord={id:'s2-material',source:'experiments/powerhouse/geometry-frontier/direct3d-s2/test/experiment.json',
      provenance:{licenseAuditFamily:'direct3d-s2-v11-audited',upstreamLicenseFamilies:['qwen-image-edit-2511-audited']}};
    const result=classifyLicense(row);
    expect(result.label).toBe('Restricted License');
    expect(result.status).toBe('unverified');
    expect(result.components?.map(c=>[c.stage,c.label,c.family])).toEqual([
      ['Geometry','FREE','direct3d-s2-v11-audited'],['Materials','Restricted License','qwen-image-edit-2511-audited']]);
    expect(result.components?.[1].reason).toContain('separate from Direct3D-S2');
    expect(classifyLicense({...row,provenance:{licenseAuditFamily:'direct3d-s2-v11-audited'}}).label).toBe('FREE');
  });
  test('component labels require an audited geometry route and do not certify a technique name',()=>{
    expect(classifyLicense({id:'new',baseStrategy:'Direct3D-S2',license:'FREE'}).components).toBeUndefined();
    const result=classifyLicense({id:'coherent',provenance:{licenseAuditFamily:'pixal-query512-original-coherent3d-v2-audited',upstreamLicenseFamilies:['pixal3d-paper-query-tiled-guided-audited-v1']}});
    expect(result.label).toBe('FREE');expect(result.components?.[0].stage).toBe('Geometry');
    expect(result.components?.[0].label).toBe('FREE');
  });
});
