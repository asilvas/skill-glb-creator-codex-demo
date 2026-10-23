import {Box3,Vector3} from 'three';

export const REVIEW_CAMERA_DIRECTION=new Vector3(-.65,.18,.8).normalize();

/** Fit all eight world-space box corners, including each corner's depth.
 * Padding=1.12 reserves 1-1/1.12 of each half viewport as screen margin.
 */
export function perspectiveBoxFit(box:Box3,options:{fov:number;aspect:number;direction?:Vector3;up?:Vector3;padding?:number}){
  const {fov,aspect}=options,padding=options.padding??1.12;
  if(box.isEmpty()||![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite))return null;
  if(!(fov>0&&fov<179&&aspect>0&&Number.isFinite(aspect)&&padding>=1&&Number.isFinite(padding)))throw Error('Invalid perspective fitting parameters');
  const center=box.getCenter(new Vector3()),scale=Math.max(.001,box.getSize(new Vector3()).length());
  const backward=(options.direction??REVIEW_CAMERA_DIRECTION).clone().normalize(),up=(options.up??new Vector3(0,1,0)).clone().normalize();
  if(!backward.lengthSq()||!up.lengthSq()||![...backward.toArray(),...up.toArray()].every(Number.isFinite))throw Error('Invalid camera direction');
  const right=new Vector3().crossVectors(up,backward);
  if(right.lengthSq()<1e-12)throw Error('Camera direction is parallel to its up vector');
  right.normalize();const vertical=new Vector3().crossVectors(backward,right).normalize();
  const tanY=Math.tan(fov*Math.PI/360),tanX=tanY*aspect;
  const corners:Vector3[]=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new Vector3(x,y,z));
  const projected=corners.map(corner=>{const delta=corner.clone().sub(center);return {x:delta.dot(right),y:delta.dot(vertical),z:delta.dot(backward)};});
  const distance=Math.max(...projected.map(corner=>corner.z+Math.max(padding*Math.abs(corner.x)/tanX,padding*Math.abs(corner.y)/tanY,scale*.01)));
  const depths=projected.map(corner=>distance-corner.z),minDepth=Math.min(...depths),maxDepth=Math.max(...depths);
  const near=Math.max(scale*1e-6,Math.min(scale/1000,minDepth/10)),far=Math.max(scale*20,maxDepth+scale);
  return {center,position:center.clone().addScaledVector(backward,distance),distance,near,far,minDepth,maxDepth,corners,padding};
}
