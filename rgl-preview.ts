import './env';
import {Preview} from '@asilvas/glb-creator/preview';
// The alternative stays in the experiment, outside the installable skill.
export async function createRglPreview(){
  const {createHeadlessWebGPURenderer}=await import('@rendergl/headless-three-webgpu');
  const p=new Preview(),r=await createHeadlessWebGPURenderer({width:512,height:512,antialias:true});
  p.renderer=r;p.renderRGBA=async(size:number)=>{if(p.size!==size)r.setSize(size,size);await r.render(p.scene,p.camera);return r.readPixels();};return p;
}
