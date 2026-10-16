import '../env';
import { test,expect } from 'bun:test';
import { readdirSync,mkdirSync,copyFileSync,rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMonster } from '../create-monster';
import { validate } from '@asilvas/glb-creator/validate';
import { Preview,capturePath } from '@asilvas/glb-creator/preview';
import { TMP,DEMO } from '../paths';
import { prepareMaterials } from '../materials';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { Asset } from '@asilvas/glb-creator/geometry';
// Image-I/O assertions exclude the separately tested asynchronous housekeeping.
process.env.GLB_CREATOR_CLEANUP='off';
test('a new material name and translated root export with consistent grounded binds',async()=>{
  const a=new Asset();a.joint('root',[2,-1,3]);a.add('custom-surface','root',[[2,-2,3],[3,-2,3],[2,-1,3]],[[0,1,2]],true,[[0,0],[1,0],[0,1]]);
  const bytes=await a.bytes();expect((await validate(bytes)).errors).toBe(0);const doc=await new NodeIO().readBinary(bytes);expect(doc.getRoot().listSkins()[0].listJoints()[0].getTranslation()).toEqual([2,1,3]);expect(doc.getRoot().listMaterials()[0].getName()).toBe('custom-surface');
});
test('exported GLB is valid, skinned, and has exactly one attack',async()=>{
  const v=await validate(await buildMonster());expect(v.errors).toBe(0);expect(v.clips.length).toBe(1);expect(v.clips[0].name).toBe('attack');expect(v.clips[0].duration).toBeCloseTo(1.2);expect(v.skins[0].joints.length).toBe(9);expect(v.textures.length).toBe(12);expect(v.materials.filter(m=>m.baseColor&&m.normal&&m.roughness).length).toBe(4);expect(v.materials.find(m=>m.name==='moss')!.alphaMode).toBe('MASK');
});
test('embedded albedo and normal maps change the rendered pixels without image-file I/O',async()=>{
  const bytes=await buildMonster(),io=new NodeIO(),p=await Preview.create();const before=readdirSync(TMP,{recursive:true}).sort();
  try{
    await p.load(bytes);const original=(await p.frame({size:160,framing:'pose'})).bytes;
    for(const channel of ['base','normal']){
      const doc=await io.readBinary(bytes),mat=doc.getRoot().listMaterials().find(m=>m.getName()==='basalt')!;
      const texture=channel==='base'?mat.getBaseColorTexture()!:mat.getNormalTexture()!;
      const image=await sharp({create:{width:16,height:16,channels:3,background:channel==='base'?'#00ffdd':'#ff8080'}}).png().toBuffer();texture.setImage(image).setMimeType('image/png');
      await p.load(await io.writeBinary(doc));const changed=(await p.frame({size:160,framing:'pose'})).bytes;expect(changed).not.toEqual(original);
    }
    const doc=await io.readBinary(bytes);for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
      if(prim.getMaterial()?.getBaseColorTexture()){expect(prim.getAttribute('TEXCOORD_0')).not.toBeNull();expect(prim.getAttribute('TANGENT')).not.toBeNull();}
    }
    expect(readdirSync(TMP,{recursive:true}).sort()).toEqual(before);
  }finally{await p.dispose();}
},30000);
test('same input rebuilds byte-identically',async()=>{expect(await buildMonster()).toEqual(await buildMonster());});
test('retained source images reproduce every embedded PBR map',async()=>{
  const folder=resolve(TMP,`demo-reproduction-${crypto.randomUUID()}`);if(!folder.startsWith(TMP+require('node:path').sep))throw Error('Unsafe reproduction folder');mkdirSync(folder);
  try{
    const original=await Bun.file(resolve(DEMO,'textures/materials.json')).json();
    for(const name of ['stone','bark','moss','ivory']){
      const source=resolve(DEMO,'textures',original.materials[name].source),b=new Uint8Array(await Bun.file(source).arrayBuffer());expect(createHash('sha256').update(b).digest('hex')).toBe(original.materials[name].sha256);copyFileSync(source,resolve(folder,`${name}.jpg`));
    }
    const regenerated=await prepareMaterials(folder),doc=await new NodeIO().readBinary(await buildMonster());
    for(const [source,name] of Object.entries({stone:'basalt',bark:'wood',moss:'moss',ivory:'ivory'})){
      const m=doc.getRoot().listMaterials().find(m=>m.getName()===name)!;
      for(const [key,image] of [['baseColor',m.getBaseColorTexture()!.getImage()],['normal',m.getNormalTexture()!.getImage()],['roughness',m.getMetallicRoughnessTexture()!.getImage()]] as const)expect(new Uint8Array(await Bun.file(resolve(folder,regenerated.materials[source][key])).arrayBuffer())).toEqual(image!);
    }
  }finally{rmSync(folder,{recursive:true});}
},30000);
test('preview deforms exported skin, repeats absolute poses, and performs no image I/O',async()=>{
  const bytes=await buildMonster(),p=await Preview.create();
  const before=readdirSync(TMP,{recursive:true}).sort();
  try{
    await p.load(bytes);
    const a=await p.frame({size:128,time:0,analyze:true});
    const windup=await p.frame({size:128,time:14/30});
    const end=await p.frame({size:128,time:1.2});
    const start=await p.frame({size:128,time:0});
    expect(a.bytes.slice(0,8)).toEqual(new Uint8Array([137,80,78,71,13,10,26,10]));
    expect(a.stats!.channels[0].stdev).toBeGreaterThan(10);expect(a.bytes).not.toEqual(windup.bytes);expect(start.bytes).toEqual(a.bytes);expect(end.bytes).toEqual(a.bytes);
    let chosen:any,index=0;
    p.asset.traverse((m:any)=>{if(chosen||!m.isSkinnedMesh)return;const j=m.geometry.getAttribute('skinIndex');for(let i=0;i<j.count;i++)if(m.skeleton.bones[j.getX(i)].name==='Arm-1'){chosen=m;index=i;break;}});
    expect(chosen).toBeDefined();p.mixer.setTime(0);p.asset.updateMatrixWorld(true);chosen.skeleton.update();
    const rest=chosen.applyBoneTransform(index,new T.Vector3().fromBufferAttribute(chosen.geometry.getAttribute('position'),index));
    p.mixer.setTime(14/30);p.asset.updateMatrixWorld(true);chosen.skeleton.update();
    const moving=chosen.applyBoneTransform(index,new T.Vector3().fromBufferAttribute(chosen.geometry.getAttribute('position'),index));
    expect(rest.distanceTo(moving)).toBeGreaterThan(.2);
    for(const yaw of [0,Math.PI/2,Math.PI]){
      await p.frame({size:64,time:14/30,yaw});
      for(const x of [p.bounds.min.x,p.bounds.max.x])for(const y of [p.bounds.min.y,p.bounds.max.y])for(const z of [p.bounds.min.z,p.bounds.max.z]){
        const projected=new T.Vector3(x,y,z).project(p.camera);expect(Math.abs(projected.x)).toBeLessThan(1);expect(Math.abs(projected.y)).toBeLessThan(1);
      }
    }
    expect(readdirSync(TMP,{recursive:true}).sort()).toEqual(before);
  }finally{await p.dispose();}
},30000);
test('custom shaders remain rejected instead of silently altered',async()=>{
  const p=await Preview.create();try{await p.load(await buildMonster());p.scene.traverse((o:any)=>{if(o.material)o.material.onBeforeCompile=()=>{console.log('real custom hook');};});await expect(p.frame({size:64})).rejects.toThrow();}finally{await p.dispose();}
});
test('capture path cannot escape scratch directory',()=>{
  expect(()=>capturePath('../SKILL.md')).toThrow();expect(()=>capturePath(resolve(TMP,'../package.json'))).toThrow();expect(capturePath('history/frame.png')).toBe(resolve(TMP,'history/frame.png'));
});
