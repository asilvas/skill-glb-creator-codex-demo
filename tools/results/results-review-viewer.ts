import {Box3} from 'three';
import {AssetReviewViewer} from './viewer-runtime';
import {perspectiveBoxFit} from './viewer-fit';

/** Results-only framing adapter; shared skill source remains unchanged. */
export class ResultsReviewViewer extends AssetReviewViewer{
  private revealFrame:number|null=null;
  private initialRevealFitted=false;

  override fit(){
    if(!this.asset||this.disposed)return;
    this.asset.updateMatrixWorld(true);
    this.asset.traverse((object:any)=>{if(object.isSkinnedMesh){object.skeleton.update();object.computeBoundingBox();}});
    const viewport=this.stage.getBoundingClientRect();
    if(viewport.width>0&&viewport.height>0){
      this.renderer.setSize(viewport.width,viewport.height,false);
      this.camera.aspect=viewport.width/viewport.height;
    }
    const fit=perspectiveBoxFit(new Box3().setFromObject(this.asset),{fov:this.camera.getEffectiveFOV(),aspect:this.camera.aspect,up:this.camera.up});
    if(!fit)return;
    this.controls.target.copy(fit.center);this.camera.position.copy(fit.position);
    this.camera.near=fit.near;this.camera.far=fit.far;this.camera.updateProjectionMatrix();this.controls.update();
  }

  /** The initial load happens inside a hidden slot. Fit once after reveal so
   * toolbar/timeline height and the actual canvas aspect are measurable.
   * Ordinary rerenders, clip changes and animation frames never call this.
   */
  onReveal(){
    if(this.disposed||this.initialRevealFitted||this.revealFrame!==null)return;
    this.revealFrame=requestAnimationFrame(()=>{
      this.revealFrame=null;if(this.disposed)return;
      this.initialRevealFitted=true;this.fit();
    });
  }

  override dispose(){
    if(this.revealFrame!==null){cancelAnimationFrame(this.revealFrame);this.revealFrame=null;}
    super.dispose();
  }
}
