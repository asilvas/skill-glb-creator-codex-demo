import {test,expect} from 'bun:test';
import {AnimationClip} from 'three';
import {InlineModelViewer,type InlineViewerBackend} from './inline-viewer';
import {normalize} from './model';
import {acceptResultsData,selectedResult} from './ui-state';

/** Minimal document adapter: real renderer/GPU code is replaced only at its boundary. */
class Node{
  id='';className='';hidden=false;disabled=false;textContent='';parent:Node|null=null;children:Node[]=[];
  attributes=new Map<string,string>();
  setAttribute(name:string,value:string){this.attributes.set(name,value);}
  getAttribute(name:string){return this.attributes.get(name)??null;}
  append(node:Node){node.remove();node.parent=this;this.children.push(node);}
  replaceChildren(...nodes:Node[]){for(const child of this.children)child.parent=null;this.children=[];for(const node of nodes)this.append(node);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
}
class DocumentAdapter{
  nodes=new Map<string,Node>();
  createElement(){return new Node() as unknown as HTMLElement;}
  getElementById(id:string){return this.nodes.get(id) as unknown as HTMLElement??null;}
  render(){for(const id of ['model-live-slot','model-static-preview','load-model','unload-model','viewer-load-status']){const node=new Node();node.id=id;this.nodes.set(id,node);}}
}
function deferred(){let resolve!:()=>void,reject!:(reason:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function asset(id:string,url='/asset.glb',bytes=10,local=true){const record=normalize({schemaVersion:1,id,name:id,metrics:{bytes:{value:bytes,unit:'bytes'}},artifacts:{glb:url.slice(1)}},'fixture.json');record.artifacts.glb!.available=local;record.artifacts.glb!.actualBytes=bytes;return record;}
function rig(){
  const dom=new DocumentAdapter();dom.render();const instances:any[]=[];
  const controller=new InlineModelViewer({document:dom as any,createViewer:(host,callbacks)=>{
    const finished=deferred(),canvas=new Node();(host as unknown as Node).append(canvas);
    const backend={finished,callbacks,canvas,host:host as unknown as Node,disposed:0,loads:[] as string[],pose:0,plays:0,reveals:0,onReveal:()=>backend.reveals++,
      clips:[new AnimationClip('Idle',4,[]),new AnimationClip('Attack',2.4,[])],
      clipSelect:{value:'-1',dispatchEvent:()=>true},playButton:{click:()=>backend.plays++},
      load:(url:string)=>{backend.loads.push(url);return finished.promise;},dispose:()=>{backend.disposed++;(host as unknown as Node).replaceChildren();}};
    instances.push(backend);return backend as unknown as InlineViewerBackend;
  }});
  return {dom,instances,controller};
}

test('selection auto-loads GLB and ignores disposed model completions and callbacks',async()=>{
  const {dom,instances,controller}=rig();controller.mount(asset('A'));
  const first=controller.load();expect(instances[0].loads).toEqual(['/asset.glb']);
  dom.render();controller.mount(asset('B','/b.glb'));
  expect(instances[0].disposed).toBe(1);expect(dom.nodes.get('model-live-slot')!.hidden).toBe(true);
  instances[0].callbacks.onStatus('wrong old model');instances[0].finished.resolve();await first;
  instances[0].callbacks.onClips([{name:'wrong clip',duration:1,index:0}]);
  expect(dom.nodes.get('viewer-load-status')!.textContent).not.toContain('wrong old model');
  const second=controller.load();instances[1].finished.resolve();await second;
  expect(instances[1].loads).toEqual(['/b.glb']);expect(instances[1].disposed).toBe(0);
  expect(dom.nodes.get('model-live-slot')!.children[0].children).toContain(instances[1].canvas);
});

test('chart and sorting rerenders reattach the same canvas and retain viewer state',async()=>{
  const {dom,instances,controller}=rig(),model=asset('A');controller.mount(model);
  const load=controller.load();instances[0].finished.resolve();await load;instances[0].pose=1.7;instances[0].clipSelect.value='1';instances[0].plays=1;
  const host=dom.nodes.get('model-live-slot')!.children[0];
  dom.render();controller.mount({...model});await controller.load();
  expect(instances.length).toBe(1);expect(instances[0].disposed).toBe(0);expect(instances[0].pose).toBe(1.7);expect(instances[0].clipSelect.value).toBe('1');expect(instances[0].plays).toBe(1);expect(instances[0].reveals).toBe(1);
  expect(dom.nodes.get('model-live-slot')!.children[0]).toBe(host);expect(host.children).toContain(instances[0].canvas);
  expect(dom.nodes.get('model-static-preview')!.hidden).toBe(true);
});

test('history inclusion changes retain the selected small GLB and its ready, pending or PNG state despite bytes sorting',async()=>{
  for(const mode of ['ready','pending','png'] as const){
    const {dom,instances,controller}=rig(),small=asset('selected-small','/small.glb',48_996),large=asset('unrelated-large','/large.glb',662_000_000);
    controller.mount(small);const original=controller.load();
    if(mode!=='pending'){instances[0].finished.resolve();await original;instances[0].pose=1.7;instances[0].clipSelect.value='1';}
    if(mode==='png')controller.unload();
    for(const includeHistory of [true,false]){
      const payload={schemaVersion:1,generated:'now',records:includeHistory?[large,{...small}]:[{...small}],issues:[],sources:[],metricCatalog:[],reviewHistory:{includeHistory}};
      const next=acceptResultsData(payload,{reviewRound:'',includeHistory,preserveViewer:true},()=>controller.reset());
      const selected=selectedResult(next.records,small.id,'bytes',true);expect(selected?.id).toBe(small.id);dom.render();controller.mount(selected);
      expect(instances.length).toBe(1);expect(instances[0].disposed).toBe(mode==='png'?1:0);
      if(mode==='ready'){expect(instances[0].pose).toBe(1.7);expect(instances[0].clipSelect.value).toBe('1');}
      if(mode==='png')expect(dom.nodes.get('unload-model')!.getAttribute('aria-pressed')).toBe('true');
    }
    if(mode==='pending'){instances[0].finished.resolve();await original;expect(dom.nodes.get('model-live-slot')!.hidden).toBe(false);}
    // Explicit disk refresh still invalidates the old renderer and starts anew.
    const next=acceptResultsData({schemaVersion:1,records:[small]},{reviewRound:'',includeHistory:false},()=>controller.reset());controller.mount(selectedResult(next.records,small.id,'bytes',true));expect(instances.length).toBe(2);expect(instances[0].disposed).toBe(1);
  }
});

test('changed URL or local byte identity and explicit refresh reset invalidate the old viewer',async()=>{
  for(const changed of [asset('A','/new.glb'),asset('A','/asset.glb',12)]){
    const {dom,instances,controller}=rig();controller.mount(asset('A'));const load=controller.load();instances[0].finished.resolve();await load;
    dom.render();controller.mount(changed);expect(instances[0].disposed).toBe(1);expect(dom.nodes.get('model-live-slot')!.hidden).toBe(true);
  }
  const {dom,instances,controller}=rig();controller.mount(asset('A'));const load=controller.load();instances[0].finished.resolve();await load;
  controller.reset();dom.render();controller.mount(asset('A'));expect(instances[0].disposed).toBe(1);expect(dom.nodes.get('model-static-preview')!.hidden).toBe(false);
});

test('known missing files use PNG; HTTP404 and decode failures retry only on explicit GLB choice',async()=>{
  const {dom,instances,controller}=rig();controller.mount(asset('missing','/missing.glb',10,false));await controller.load();
  expect(instances.length).toBe(0);expect(dom.nodes.get('load-model')!.disabled).toBe(true);
  for(const reason of ['HTTP404 Not Found','Invalid GLB buffer / decode failed']){
    const model=asset(reason);controller.mount(model);const failed=controller.load(),instance=instances.at(-1);instance.finished.reject(Error(reason));await failed;
    expect(instance.disposed).toBe(1);expect(dom.nodes.get('model-static-preview')!.hidden).toBe(false);expect(dom.nodes.get('viewer-load-status')!.textContent).toContain(reason);expect(dom.nodes.get('unload-model')!.getAttribute('aria-pressed')).toBe('true');expect(dom.nodes.get('load-model')!.textContent).toBe('Retry GLB preview');
    instance.callbacks.onStatus('stale failed backend');instance.callbacks.onClips([{name:'stale',duration:1,index:0}]);expect(dom.nodes.get('viewer-load-status')!.textContent).toContain(reason);
    const count=instances.length;dom.render();controller.mount({...model});await Promise.resolve();expect(instances.length).toBe(count);
    const retry=controller.load();instances.at(-1).finished.resolve();await retry;expect(instances.length).toBe(count+1);expect(dom.nodes.get('model-live-slot')!.hidden).toBe(false);
  }
});

test('play shortcuts select only an actual embedded clip, without inventing reported clips',async()=>{
  const {dom,instances,controller}=rig();controller.mount(asset('A'));
  const play=controller.playClip('Attack');instances[0].finished.resolve();await play;
  expect(instances[0].clipSelect.value).toBe('1');expect(instances[0].plays).toBe(1);
  await controller.playClip('Imaginary');expect(instances[0].plays).toBe(1);expect(dom.nodes.get('viewer-load-status')!.textContent).toContain('absent');
});

test('the latest clip shortcut wins while a shared model load is pending',async()=>{
  const {instances,controller}=rig();controller.mount(asset('A'));
  const first=controller.playClip('Idle'),last=controller.playClip('Attack');
  instances[0].finished.resolve();await Promise.all([first,last]);
  expect(instances.length).toBe(1);expect(instances[0].clipSelect.value).toBe('1');expect(instances[0].plays).toBe(1);
});

test('unnamed embedded clips remain playable and a static GLB keeps the live viewer controls',async()=>{
  for(const animated of [true,false]){
    const {dom,instances,controller}=rig();controller.mount(asset('A'));instances[0].clips=animated?[new AnimationClip('',2,[])]:[];
    const load=animated?controller.playClip('Clip 1'):controller.load();instances[0].finished.resolve();await load;
    expect(dom.nodes.get('model-live-slot')!.hidden).toBe(false);expect(dom.nodes.get('load-model')!.getAttribute('aria-pressed')).toBe('true');expect(dom.nodes.get('unload-model')!.hidden).toBe(false);
    expect(instances[0].plays).toBe(animated?1:0);if(animated)expect(instances[0].clipSelect.value).toBe('0');else expect(dom.nodes.get('viewer-load-status')!.textContent).toContain('Drag to orbit');
  }
});

test('leaving a selection disposes it once and returning starts a new automatic attempt',async()=>{
  const {instances,controller}=rig(),first=asset('A');controller.mount(first);const loaded=controller.load();instances[0].finished.resolve();await loaded;
  controller.mount(asset('B','/b.glb'));expect(instances[0].disposed).toBe(1);controller.mount(undefined);expect(instances[1].disposed).toBe(1);
  controller.mount(first);expect(instances.length).toBe(3);expect(instances[2].loads).toEqual(['/asset.glb']);expect(instances[0].disposed).toBe(1);
});

test('PNG choice cancels pending loads/clips and persists through same-model rerenders',async()=>{
  for(const finish of ['resolve','reject'] as const){
    const {dom,instances,controller}=rig(),model=asset('A');controller.mount(model);const clip=controller.playClip('Attack');controller.unload();
    expect(instances[0].disposed).toBe(1);instances[0].callbacks.onStatus('stale');instances[0].callbacks.onClips([{name:'stale',duration:1,index:0}]);
    finish==='resolve'?instances[0].finished.resolve():instances[0].finished.reject(Error('late failure'));await clip;
    expect(instances[0].plays).toBe(0);expect(dom.nodes.get('model-static-preview')!.hidden).toBe(false);expect(dom.nodes.get('viewer-load-status')!.textContent).toBe('Showing PNG preview.');
    dom.render();controller.mount({...model});expect(instances.length).toBe(1);expect(dom.nodes.get('unload-model')!.getAttribute('aria-pressed')).toBe('true');
    const retry=controller.load();expect(instances[1].host).not.toBe(instances[0].host);instances[0].host.replaceChildren();instances[1].finished.resolve();await retry;
    expect(instances[1].host.children).toContain(instances[1].canvas);expect(dom.nodes.get('model-static-preview')!.hidden).toBe(true);
  }
});

test('availability and reviewed hash changes invalidate live or pending selection',async()=>{
  for(const pending of [true,false])for(const change of ['missing','mismatch','actual-hash','expected-hash'] as const){
    const {dom,instances,controller}=rig(),model=asset('A');controller.mount(model);const first=controller.load();if(!pending){instances[0].finished.resolve();await first;}
    const changed=asset('A');if(change==='missing')changed.artifacts.glb!.available=false;if(change==='mismatch')changed.artifacts.glb!.matchesRecordedHash=false;if(change==='actual-hash')changed.artifacts.glb!.actualSHA256='new';if(change==='expected-hash')changed.artifacts.glb!.expectedSHA256='new';
    dom.render();controller.mount(changed);expect(instances[0].disposed).toBe(1);instances[0].finished.resolve();await first;
    if(change==='missing'||change==='mismatch'){expect(instances.length).toBe(1);expect(dom.nodes.get('model-static-preview')!.hidden).toBe(false);}else{expect(instances.length).toBe(2);const next=controller.load();instances[1].finished.resolve();await next;}
  }
});

test('unknown availability attempts once; absent URL or artifact stays PNG without a backend',async()=>{
  const {dom,instances,controller}=rig(),unknown=asset('unknown');delete (unknown.artifacts.glb as any).available;controller.mount(unknown);expect(instances[0].loads).toEqual(['/asset.glb']);const pending=controller.load();instances[0].finished.resolve();await pending;
  const noURL=asset('noURL');noURL.artifacts.glb!.url='';controller.mount(noURL);expect(instances[0].disposed).toBe(1);expect(instances.length).toBe(1);expect(dom.nodes.get('model-static-preview')!.hidden).toBe(false);
  controller.mount(normalize({schemaVersion:1,id:'none'},'fixture.json'));expect(instances.length).toBe(1);controller.mount(undefined);expect(dom.nodes.get('model-live-slot')!.hidden).toBe(true);expect(dom.nodes.get('viewer-load-status')!.textContent).toBe('');
});

test('synchronous viewer construction failure falls back without an automatic retry loop',async()=>{
  const dom=new DocumentAdapter();dom.render();let creates=0;const controller=new InlineModelViewer({document:dom as any,createViewer:()=>{creates++;throw Error('WebGL unavailable');}}),model=asset('A');controller.mount(model);await controller.load();
  expect(creates).toBe(1);expect(dom.nodes.get('viewer-load-status')!.textContent).toContain('WebGL unavailable');expect(dom.nodes.get('model-static-preview')!.hidden).toBe(false);
  dom.render();controller.mount(model);await Promise.resolve();expect(creates).toBe(1);await controller.load();expect(creates).toBe(2);
});
