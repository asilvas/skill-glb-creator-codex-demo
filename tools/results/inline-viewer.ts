import type {AssetReviewViewer,ReviewViewerOptions} from './viewer-runtime';
import {ResultsReviewViewer} from './results-review-viewer';
import type {ResultRecord} from './model';
import {inlineModelURL} from './ui-state';

export type InlineViewerBackend=Pick<AssetReviewViewer,'load'|'dispose'|'clips'|'clipSelect'|'playButton'>&{onReveal?:()=>void};
type ViewerDocument=Pick<Document,'createElement'|'getElementById'>;
type ViewerFactory=(host:HTMLElement,options:ReviewViewerOptions)=>InlineViewerBackend;

/** One automatic attempt per selected binary. Chart rerenders preserve either
 * the loaded viewer or the user's PNG choice. Refresh explicitly starts anew.
 */
export class InlineModelViewer{
  private host:HTMLElement|null=null;
  private viewer:InlineViewerBackend|null=null;
  private dom:ViewerDocument;
  private createViewer:ViewerFactory;
  private record:ResultRecord|undefined;
  private identity='';
  private generation=0;
  private clipRequest=0;
  private pending:Promise<void>|null=null;
  private loading=false;
  private ready=false;
  private failed=false;
  private attempted=false;
  private mode:'glb'|'png'='glb';
  private message='';

  constructor(options:{document?:ViewerDocument;createViewer?:ViewerFactory}={}){
    this.dom=options.document??document;
    this.createViewer=options.createViewer??((host,options)=>new ResultsReviewViewer(host,options));
  }

  mount(record:ResultRecord|undefined){
    const glb=record?.artifacts.glb;
    const identity=record?JSON.stringify([record.id,glb?.url,glb?.available,glb?.actualBytes,glb?.matchesRecordedHash,glb?.expectedSHA256,glb?.actualSHA256,record.provenance.glbSHA256,record.history?.identityMatched]):'';
    if(identity!==this.identity){this.reset();this.identity=identity;}
    this.record=record;
    if(this.host)this.dom.getElementById('model-live-slot')?.append(this.host);
    if(!inlineModelURL(record)){this.mode='png';this.message=record?this.unavailableMessage():'';}
    this.sync();
    if(inlineModelURL(record)&&this.mode==='glb'&&!this.attempted)void this.load();
  }

  private release(){
    this.generation++;this.clipRequest++;
    const viewer=this.viewer,host=this.host;
    this.viewer=null;this.host=null;this.pending=null;this.ready=false;this.loading=false;
    try{viewer?.dispose();}finally{host?.replaceChildren();host?.remove();}
  }

  reset(){
    this.release();this.identity='';this.message='';this.record=undefined;
    this.attempted=false;this.failed=false;this.mode='glb';
  }

  /** Explicit PNG choice also cancels pending clip requests and load callbacks. */
  unload(){this.release();this.mode='png';this.message='Showing PNG preview.';this.sync();}

  private unavailableMessage(){
    const glb=this.record?.artifacts.glb;
    return glb?.matchesRecordedHash===false||(glb?.expectedSHA256&&glb?.actualSHA256&&glb.expectedSHA256!==glb.actualSHA256)
      ?'The local GLB differs from the reviewed binary. Showing PNG preview.'
      :'Local GLB unavailable. Showing PNG preview.';
  }

  /** An explicit GLB choice retries a failed attempt; rerendering never does. */
  async load(){
    const url=inlineModelURL(this.record);
    if(!url){this.mode='png';this.message=this.unavailableMessage();this.sync();return;}
    this.mode='glb';
    if(this.pending){this.sync();return this.pending;}
    if(this.viewer&&this.ready){this.sync();return;}
    this.attempted=true;this.loading=true;this.ready=false;this.failed=false;this.message='Loading local GLB…';
    const generation=++this.generation;
    // A separate host per attempt isolates late backend cleanup from a new GLB.
    const host=this.dom.createElement('div');host.id='viewer-host';host.className='viewerhost';this.host=host;
    const work=(async()=>{
      let viewer:InlineViewerBackend|undefined;
      try{
        viewer=this.createViewer(host,{
          onStatus:message=>{if(generation===this.generation&&this.mode==='glb'){this.message=message;this.sync();}},
          onClips:clips=>{if(generation===this.generation&&this.mode==='glb'&&clips.length){this.message=`${clips.length} actual animation clips loaded.`;this.sync();}}
        });
        this.viewer=viewer;this.dom.getElementById('model-live-slot')?.append(host);this.sync();
        await viewer.load(url);
        if(generation!==this.generation)return;
        this.ready=true;
        this.message=viewer.clips.length?`${viewer.clips.length} embedded animation clips. Choose a clip or scrub the timeline.`:'Model loaded. Drag to orbit and scroll to zoom.';
      }catch(error){
        if(generation!==this.generation)return;
        viewer?.dispose();this.viewer=null;this.host=null;host.replaceChildren();host.remove();
        this.ready=false;this.failed=true;this.mode='png';
        this.message=`Could not load GLB: ${String(error)}. Showing PNG preview.`;
      }
    })();
    // Cleanup runs after pending is assigned even if the constructor throws.
    const task=work.then(()=>{if(generation===this.generation){this.pending=null;this.loading=false;this.sync();if(this.ready)this.viewer?.onReveal?.();}});
    this.pending=task;this.sync();
    return task;
  }

  async playClip(name:string){
    const identity=this.identity,request=++this.clipRequest;
    await this.load();
    if(identity!==this.identity||request!==this.clipRequest||!this.viewer||!this.ready)return;
    const index=this.viewer.clips.findIndex((clip,index)=>(clip.name||`Clip ${index+1}`)===name);
    if(index<0){this.message=`The recorded clip “${name}” is absent from this local GLB.`;this.sync();return;}
    this.viewer.clipSelect.value=String(index);
    this.viewer.clipSelect.dispatchEvent(new Event('change'));
    this.viewer.playButton.click();
  }

  private sync(){
    const slot=this.dom.getElementById('model-live-slot'),preview=this.dom.getElementById('model-static-preview');
    const glb=this.dom.getElementById('load-model') as HTMLButtonElement|null,png=this.dom.getElementById('unload-model') as HTMLButtonElement|null,status=this.dom.getElementById('viewer-load-status');
    const live=!!this.viewer&&this.ready&&this.mode==='glb';
    if(slot)slot.hidden=!live;
    if(preview)preview.hidden=live;
    for(const [button,pressed]of [[glb,this.mode==='glb'],[png,this.mode==='png']] as const)if(button){button.hidden=false;button.setAttribute('aria-pressed',String(pressed));button.className=pressed?'primary':'';}
    if(glb){glb.disabled=this.loading||!inlineModelURL(this.record);glb.textContent=this.failed?'Retry GLB preview':'GLB preview';}
    if(status)status.textContent=this.loading?'Loading local GLB…':this.message;
  }
}
