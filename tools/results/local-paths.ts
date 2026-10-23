/** Optional local archive aliases preserve old report links after workspace cleanup. */
import{existsSync,readFileSync}from'node:fs';
import{resolve,relative,isAbsolute}from'node:path';
import{safePath}from'./model';

export function localArtifactPath(root:string,path:string):string|undefined{
  path=safePath(path)??'';if(!path)return;
  const local=(value:unknown)=>{const safe=safePath(value);if(!safe)return;const absolute=resolve(root,safe),rel=relative(root,absolute);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))return;return absolute;};
  const direct=local(path);if(!direct)return;if(existsSync(direct))return direct;
  let aliases:any;try{aliases=JSON.parse(readFileSync(resolve(root,'local/path-aliases.json'),'utf8'));}catch{return;}
  if(aliases?.schemaVersion!==1)return;
  const candidates:unknown[]=[aliases.exact?.[path]];
  if(aliases.prefixes&&typeof aliases.prefixes==='object')for(const [from,to]of Object.entries(aliases.prefixes).sort((a,b)=>b[0].length-a[0].length)){
    if(from.endsWith('/')&&safePath(from)&&path.startsWith(from)&&typeof to==='string'&&to.endsWith('/'))candidates.push(to+path.slice(from.length));
  }
  for(const value of candidates){const absolute=local(value);if(absolute&&existsSync(absolute))return absolute;}
}
