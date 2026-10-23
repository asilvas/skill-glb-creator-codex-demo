import {expect,test} from 'bun:test';
import {AnimationClip,AnimationMixer,Bone,Box3,BoxGeometry,Float32BufferAttribute,Group,MeshBasicMaterial,PerspectiveCamera,Skeleton,SkinnedMesh,Uint16BufferAttribute,Vector3,VectorKeyframeTrack} from 'three';
import {perspectiveBoxFit,REVIEW_CAMERA_DIRECTION} from './viewer-fit';
import {ResultsReviewViewer} from './results-review-viewer';

function projectFit(box:Box3,aspect:number,fov=36){
  const fit=perspectiveBoxFit(box,{aspect,fov})!;
  const camera=new PerspectiveCamera(fov,aspect,fit.near,fit.far);camera.position.copy(fit.position);camera.lookAt(fit.center);camera.updateMatrixWorld(true);
  for(const corner of fit.corners){
    const ndc=corner.clone().project(camera);
    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1/fit.padding+1e-12);expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1/fit.padding+1e-12);expect(ndc.z).toBeGreaterThan(-1);expect(ndc.z).toBeLessThan(1);
  }
  expect(fit.near).toBeGreaterThan(0);expect(fit.near).toBeLessThan(fit.minDepth);expect(fit.far).toBeGreaterThan(fit.maxDepth);expect(fit.far/fit.near).toBeLessThan(1e8);
  return {fit,camera};
}

test('all eight corners of tall, wide and deep bounds fit portrait and landscape viewports with margin',()=>{
  for(const size of [[.2,10,.2],[12,.3,.5],[.3,.4,18]])for(const aspect of [.4,1,2.4])for(const fov of [24,36,65]){
    const center=new Vector3(14,-8,22),half=new Vector3(...size).multiplyScalar(.5),box=new Box3(center.clone().sub(half),center.clone().add(half));projectFit(box,aspect,fov);
  }
});

test('the tall-tube regression clips with diagonal*1.22 and fits under the projected-corner rule',()=>{
  const box=new Box3(new Vector3(-.1,0,-.1),new Vector3(.1,10,.1)),{fit}=projectFit(box,1.6);
  const old=new PerspectiveCamera(36,1.6,.01,200);old.position.copy(fit.center).addScaledVector(REVIEW_CAMERA_DIRECTION,box.getSize(new Vector3()).length()*1.22);old.lookAt(fit.center);old.updateMatrixWorld(true);
  expect(Math.max(...fit.corners.map(corner=>Math.abs(corner.clone().project(old).y)))).toBeGreaterThan(1);
});

test('empty bounds are skipped, point bounds stay finite, and invalid camera inputs fail',()=>{
  expect(perspectiveBoxFit(new Box3(),{fov:36,aspect:1})).toBeNull();projectFit(new Box3(new Vector3(2,3,4),new Vector3(2,3,4)),.5);
  expect(()=>perspectiveBoxFit(new Box3(new Vector3(),new Vector3(1,1,1)),{fov:36,aspect:0})).toThrow();
});

test('the local adapter recomputes posed skin bounds without changing clip, timeline or playback state',()=>{
  const geometry=new BoxGeometry(.4,4,.4);geometry.translate(0,2,0);const count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));
  const bone=new Bone();bone.name='joint';const mesh=new SkinnedMesh(geometry,new MeshBasicMaterial());mesh.add(bone);mesh.bind(new Skeleton([bone]));const asset=new Group();asset.add(mesh);asset.updateMatrixWorld(true);mesh.computeBoundingBox();
  const mixer=new AnimationMixer(asset),clip=new AnimationClip('bend',2,[new VectorKeyframeTrack('joint.position',[0,2],[0,0,0,0,4,0])]),action=mixer.clipAction(clip);action.play();mixer.setTime(.75);action.paused=true;
  const camera=new PerspectiveCamera(36,1,.01,100),target=new Vector3();let resized:number[]=[];
  const adapter=Object.create(ResultsReviewViewer.prototype) as ResultsReviewViewer;
  Object.assign(adapter,{asset,mixer,action,disposed:false,playing:true,camera,clipSelect:{value:'0'},scrub:{value:'.375'},stage:{getBoundingClientRect:()=>({width:300,height:600})},renderer:{setSize:(w:number,h:number)=>resized=[w,h]},controls:{target,update:()=>{camera.lookAt(target);camera.updateMatrixWorld(true);}}});
  adapter.fit();expect(resized).toEqual([300,600]);expect(camera.aspect).toBe(.5);expect(target.y).toBeCloseTo(3.5,5);expect(action.time).toBe(.75);expect(action.paused).toBe(true);expect(adapter.playing).toBe(true);expect(adapter.clipSelect.value).toBe('0');expect(adapter.scrub.value).toBe('.375');
  const position=camera.position.clone();action.paused=false;mixer.setTime(1.5);expect(camera.position.equals(position)).toBe(true);adapter.fit();expect(target.y).toBeCloseTo(5,5);
  geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();mesh.skeleton.dispose();
});

test('post-reveal fitting schedules once and ignores disposed callbacks',()=>{
  const originalRequest=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame,frames:FrameRequestCallback[]=[],cancelled:number[]=[];let fits=0;
  globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};globalThis.cancelAnimationFrame=id=>{cancelled.push(id);};
  try{
    const adapter=Object.create(ResultsReviewViewer.prototype) as ResultsReviewViewer;
    Object.assign(adapter,{disposed:false,revealFrame:null,initialRevealFitted:false,fit:()=>fits++});
    adapter.onReveal();adapter.onReveal();expect(frames).toHaveLength(1);frames[0](0);expect(fits).toBe(1);adapter.onReveal();expect(frames).toHaveLength(1);
    const disposed=Object.create(ResultsReviewViewer.prototype) as ResultsReviewViewer;
    Object.assign(disposed,{disposed:false,revealFrame:null,initialRevealFitted:false,serial:0,asset:null,renderer:{setAnimationLoop:()=>{},dispose:()=>{}},observer:{disconnect:()=>{}},controls:{dispose:()=>{}},envTarget:{dispose:()=>{}},host:{replaceChildren:()=>{}},fit:()=>fits++});
    disposed.onReveal();disposed.dispose();expect(cancelled).toEqual([2]);frames[1](0);expect(fits).toBe(1);
  }finally{globalThis.requestAnimationFrame=originalRequest;globalThis.cancelAnimationFrame=originalCancel;}
});
