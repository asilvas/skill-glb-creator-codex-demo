/** Local results command: build once, read current retained data on each refresh. */
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {page} from './page';
import {loadResults,ROOT} from './registry';
import {validReviewRound} from './review-history';
import {localArtifactPath} from './local-paths';
export async function startResults(options:{port?:number;root?:string}={}){
  const root=options.root??ROOT;
  const build=await Bun.build({entrypoints:[resolve(import.meta.dir,'client.ts')],target:'browser',minify:true,write:false});
  if(!build.success)throw new AggregateError(build.logs,'Results UI build failed');
  const js=await build.outputs[0].text();
  const port=options.port??Number(process.env.RESULTS_PORT??process.env.PORT??4175);
  // Global history rehashes local masters; keep that bounded work from hitting
  // Bun's 10s idle deadline before the JSON response has its first byte.
  const server=Bun.serve({hostname:'127.0.0.1',port,idleTimeout:120,async fetch(req){
    const u=new URL(req.url);
    if(!['GET','HEAD'].includes(req.method))return new Response('Read-only results server',{status:405,headers:{Allow:'GET, HEAD'}});
    const host=req.headers.get('host');if(host!==`127.0.0.1:${server.port}`&&host!==`localhost:${server.port}`)return new Response('Invalid host',{status:403});
    const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(u.pathname==='/')return new Response(page,{headers:{...common,'Content-Type':'text/html; charset=utf-8'}});
    if(u.pathname==='/app.js')return new Response(js,{headers:{...common,'Content-Type':'text/javascript; charset=utf-8'}});
    if(u.pathname==='/api/results'){
      const round=u.searchParams.get('reviewRound');
      if(round!==null&&(!validReviewRound(round)||u.searchParams.getAll('reviewRound').length!==1))return Response.json({error:'Invalid reviewRound; choose one explicit round-N'},{status:400,headers:common});
      const includeHistory=u.searchParams.get('includeHistory');
      if(includeHistory!==null&&(includeHistory!=='1'||u.searchParams.getAll('includeHistory').length!==1||round!==null))return Response.json({error:'Use includeHistory=1 for all assets and reviews, without reviewRound'},{status:400,headers:common});
      try{return Response.json(await loadResults(root,{...(round?{reviewRound:round}:{}),...(includeHistory==='1'?{includeHistory:true}:{})}),{headers:common});}catch(error){return Response.json({error:String(error)},{status:500,headers:common});}
    }
    let path:string;
    try{const decoded=decodeURIComponent(u.pathname).replace(/^\/+/,'');if(decoded.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.')))return new Response('Not found',{status:404});path=resolve(root,decoded);}catch{return new Response('Bad path',{status:400});}
    const rel=relative(root,path);if(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel)||rel.split(/[\\/]/).some(s=>s.startsWith('.')))return new Response('Not found',{status:404});
    const archived=localArtifactPath(root,rel);if(!archived)return new Response('Not found',{status:404});path=archived;
    const file=Bun.file(path);if(!await file.exists())return new Response('Not found',{status:404});
    if(u.searchParams.has('reviewSHA256')){
      const expected=u.searchParams.get('reviewSHA256');
      if(!path.endsWith('.glb')||!expected||!/^[a-f0-9]{64}$/.test(expected)||u.searchParams.getAll('reviewSHA256').length!==1)return new Response('Invalid reviewed-binary hash',{status:400});
      // Hash and serve the same immutable buffer, so a later path overwrite cannot
      // swap an unreviewed same-length file into an already enabled viewer.
      const bytes=await file.bytes();
      if(createHash('sha256').update(bytes).digest('hex')!==expected)return new Response('Local GLB differs from the frozen reviewed binary',{status:409,headers:common});
      return new Response(bytes,{headers:{...common,'Content-Type':'model/gltf-binary'}});
    }
    return new Response(file,{headers:{...common,'Content-Type':path.endsWith('.glb')?'model/gltf-binary':file.type}});
  }});
  return server;
}
if(import.meta.main){
  if(process.argv.includes('--snapshot')){
    const path=resolve(ROOT,'results/dashboard-snapshot.json'),data=await loadResults();await Bun.write(path,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({ok:true,path,records:data.records.length,issues:data.issues.length}));
  }else{
    const portFlag=process.argv.find(a=>a.startsWith('--port=')),port=portFlag?Number(portFlag.split('=')[1]):undefined;
    const server=await startResults({port});console.log(`Asset Observatory: http://127.0.0.1:${server.port}/`);console.log('Refresh from disk discovers new experiment.json records; GLBs remain local. Ctrl+C stops this read-only server.');
  }
}
