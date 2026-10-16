import sharp from '../node_modules/sharp/lib/index.js';
import { resolve,basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { Surface } from '../scripts/geometry';
import { DEMO } from '../scripts/paths';
export const TEXTURES=resolve(DEMO,'textures');
/** Consume artist-supplied albedo images. Image generation is intentionally outside this skill. */
export async function prepareMaterials(input=TEXTURES){
  const manifest:any={format:'glbCreatorMaterialsV1',normalSource:'Approximate luminance gradients from albedo; not scanned or AI-generated normal maps.',materials:{}};
  for(const name of ['stone','bark','moss','ivory']){
    const source=resolve(input,`${name}.${await Bun.file(resolve(input,`${name}.png`)).exists()?'png':'jpg'}`),bytes=new Uint8Array(await Bun.file(source).arrayBuffer());
    let albedo:Buffer;
    if(name==='moss'){
      const pixels=await sharp(bytes).resize(1024,1024).ensureAlpha().raw().toBuffer();
      for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
        const px=(x-511.5)/512,py=(y-511.5)/512,angle=Math.atan2(py,px),radius=Math.hypot(px,py);
        const noise=Math.sin(x*1.71+y*3.31)*Math.sin(x*.193-y*.27),edge=.72+.095*Math.sin(angle*11)+.065*Math.sin(angle*27)+noise*.07;
        pixels[(y*1024+x)*4+3]=Math.round(Math.max(0,Math.min(1,(edge-radius)/.09))*255);
      }
      albedo=await sharp(pixels,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer();
    }else if(name==='ivory'){
      const pixels=await sharp(bytes).resize(1024,1024).removeAlpha().raw().toBuffer(),tint=[.76,.68,.52];
      for(let i=0;i<pixels.length;i++){const s=pixels[i]/255,linear=(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*tint[i%3];pixels[i]=Math.round((linear<=.0031308?linear*12.92:1.055*linear**(1/2.4)-.055)*255);}
      albedo=await sharp(pixels,{raw:{width:1024,height:1024,channels:3}}).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer();
    }else albedo=await sharp(bytes).resize(1024,1024).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer();
    const size=512,grey=await sharp(bytes).resize(size,size).greyscale().blur(.6).raw().toBuffer();
    const normal=new Uint8Array(size*size*3),rough=new Uint8Array(size*size*3);
    const sample=(x:number,y:number)=>grey[((y+size)%size)*size+(x+size)%size]/255;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const k=(y*size+x)*3,gain=name==='stone'?2.8:name==='bark'?3.4:1.5;
      const nx=(sample(x-1,y)-sample(x+1,y))*gain,ny=(sample(x,y+1)-sample(x,y-1))*gain,length=Math.hypot(nx,ny,1);
      normal[k]=Math.round((nx/length*.5+.5)*255);normal[k+1]=Math.round((ny/length*.5+.5)*255);normal[k+2]=Math.round((1/length*.5+.5)*255);
      rough[k]=255;rough[k+1]=Math.round((.72+(1-sample(x,y))*.23)*255);rough[k+2]=0;
    }
    const files={baseColor:`${name}-albedo.${name==='moss'?'png':'jpg'}`,normal:`${name}-normal.png`,roughness:`${name}-roughness.png`};
    await Bun.write(resolve(input,files.baseColor),albedo);
    await Bun.write(resolve(input,files.normal),await sharp(normal,{raw:{width:size,height:size,channels:3}}).png().toBuffer());
    await Bun.write(resolve(input,files.roughness),await sharp(rough,{raw:{width:size,height:size,channels:3}}).png().toBuffer());
    manifest.materials[name]={source:basename(source),sha256:createHash('sha256').update(bytes).digest('hex'),...files};
  }
  await Bun.write(resolve(input,'materials.json'),JSON.stringify(manifest,null,2));return manifest;
}
let cache:Promise<Map<string,Surface>>|undefined;
export async function materialInputs(){
  return cache??=(async()=>{
    const folder=await ensureDemoMaterials(),m=await Bun.file(resolve(folder,'materials.json')).json(),out=new Map<string,Surface>();
    for(const [name,record] of Object.entries(m.materials) as [string,any][]){const read=async(k:string)=>new Uint8Array(await Bun.file(resolve(folder,record[k])).arrayBuffer());out.set(name,{baseColor:await read('baseColor'),normal:await read('normal'),roughness:await read('roughness'),normalScale:name==='bark'?.85:.6,...(name==='moss'?{alphaCutoff:.4}:{})});}
    return out;
  })();
}
export async function ensureDemoMaterials(){
  const file=Bun.file(resolve(TEXTURES,'materials.json'));
  if(await file.exists()){
    const m=await file.json(),paths=Object.values(m.materials).flatMap((r:any)=>['baseColor','normal','roughness'].map(k=>resolve(TEXTURES,r[k])));
    if((await Promise.all(paths.map(p=>Bun.file(p).exists()))).every(Boolean))return TEXTURES;
  }
  await prepareMaterials(TEXTURES);return TEXTURES;
}
if(import.meta.main)console.log(await prepareMaterials(process.argv[2]));
