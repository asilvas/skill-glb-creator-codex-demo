import './env';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from './paths';
const sha=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const p=await Bun.file(resolve(ROOT,'performance.json')).json(),manifest=await Bun.file(resolve(ROOT,'textures/materials.json')).json();
for(const name of ['blender','bun'])if(await sha(resolve(ROOT,`${name}-monster.glb`))!==p.assets[name].sha256)throw Error(`Recorded GLB changed: ${name}`);
if(await sha(resolve(ROOT,'reference.png'))!==p.referenceSha256)throw Error('Reference changed');
for(const m of Object.values(manifest.materials) as any[]){if(await sha(resolve(ROOT,'textures',m.source))!==m.sha256)throw Error('Source texture changed');for(const k of ['baseColor','normal','roughness'])if(!await Bun.file(resolve(ROOT,'textures',m[k])).exists())throw Error(`Missing texture ${m[k]}`);}
for(const [name,hash] of Object.entries(p.sourceHashes))if(await sha(resolve(ROOT,'recorded-sources',name))!==hash)throw Error(`Recorded source changed: ${name}`);
const markdown=await Bun.file(resolve(ROOT,'README.md')).text();for(const match of markdown.matchAll(/\]\(([^)]+)\)/g)){const href=match[1];if(!/^(https?:|#)/.test(href)&&!await Bun.file(resolve(ROOT,href)).exists())throw Error(`Broken README link ${href}`);}
console.log('Recorded assets, source snapshots, texture inputs and README links verified.');
