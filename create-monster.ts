import './env';
import { Asset,type V } from '@asilvas/glb-creator/geometry';
import { materialInputs } from './materials';
import * as T from 'three';
import { TMP,DEMO } from './paths';
import { resolve } from 'node:path';

/** Reference study: fractured armour over a connected, braided root anatomy. */
export async function buildMonster(options:{textures?:boolean}={}){
  const a=new Asset(),textures=await materialInputs();
  if(options.textures!==false)for(const [material,source] of Object.entries({basalt:'stone',edge:'stone',wood:'bark',grain:'bark',moss:'moss',ivory:'ivory'}))a.surfaces.set(material,textures.get(source)!);
  a.joint('Root',[0,0,0]);a.joint('Chest',[0,1.75,.05],'Root');a.joint('Head',[0,3.35,.4],'Chest');
  for(const s of [-1,1]){a.joint(`Arm${s}`,[s*.98,3.22,.02],'Chest');a.joint(`Fore${s}`,[s*1.57,2.12,.18],`Arm${s}`);a.joint(`Hand${s}`,[s*1.87,1.15,.36],`Fore${s}`);}
  let seed=100;const rand=(k:number)=>{const x=Math.sin(k*127.1+311.7)*43758.5453;return x-Math.floor(x);};
  const plate=(c:V,size:V,bone:string,rotation:V=[0,0,0],growth=true)=>{
    const k=seed++;a.plate('basalt',c,size,bone,k,rotation);
    if(growth&&k%3!==0){
      const q=new T.Quaternion().setFromEuler(new T.Euler(...rotation));
      for(let i=0;i<4;i++){
        const local=new T.Vector3((rand(k+i)-.5)*size[0],size[1]*(.22+rand(k+i+7)*.38),size[2]*.61).applyQuaternion(q).add(new T.Vector3(...c));
        a.plate('moss',local.toArray() as V,[size[0]*(.26+rand(k+i+4)*.25),size[1]*.22,.018],bone,k+i,rotation);
      }
    }
  };
  const root=(points:V[],radius:number,bone:string,phase=0,mat='wood')=>{
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',.5),length=curve.getLength(),steps=Math.max(8,Math.ceil(length*12));
    const p=Array.from({length:steps},(_,i)=>curve.getPoint(i/(steps-1)).toArray() as V);
    const r=p.map((_,i)=>radius*(.85+.14*Math.sin(i*.92+phase))*(1-.18*i/(steps-1)));
    a.tube(mat,p,r,bone,9);
  };
  const braid=(path:V[],radius:number,bone:string,count=12,phase=0)=>{
    const curve=new T.CatmullRomCurve3(path.map(p=>new T.Vector3(...p)),false,'catmullrom',.5);
    for(let strand=0;strand<count;strand++){
      const points:V[]=[];
      for(let i=0;i<14;i++){
        const t=i/13,p=curve.getPoint(t),d=curve.getTangent(t),u=d.clone().cross(new T.Vector3(0,0,1));if(u.length()<.01)u.copy(d).cross(new T.Vector3(1,0,0));u.normalize();const v=d.clone().cross(u);
        const angle=strand/count*Math.PI*2+t*4.8+phase+.22*Math.sin(t*11+strand),r=radius*(.64+.22*Math.sin(t*8+strand));
        points.push(p.addScaledVector(u,Math.cos(angle)*r).addScaledVector(v,Math.sin(angle)*r).toArray() as V);
      }
      root(points,radius*(.25+.11*rand(strand+phase)),bone,strand,strand%4===0?'grain':'wood');
    }
  };
  // Submerged cores hold the braided roots together; no exposed ball-and-cylinder anatomy.
  a.ell('wood',[0,2.65,.05],[.85,.87,.49],'Chest');a.ell('wood',[0,1.58,-.03],[.52,.35,.36],'Root');
  for(const s of [-1,1]){
    for(let i=0;i<9;i++){
      const f=i/8;
      root([[s*(.68-f*.12),3.12,.23],[s*(.65-f*.2),2.75,.48+f*.12],[s*(.35-f*.3),2.23,.47],[s*(-.18+f*.32),1.72,.29]],.065+(i%3)*.014,'Chest',i);
      root([[s*.57,3.16,-.24],[s*(.68-f*.18),2.6,-.46],[s*.33,1.81,-.22]],.066,'Chest',i+5);
    }
    // Bent, splayed legs retain knee, ankle and broad foot masses.
    braid([[s*.39,1.57,-.02],[s*.67,1.11,.10],[s*.8,.79,.28]],.30,'Root',14,s+2);
    braid([[s*.8,.86,.25],[s*.65,.48,.03],[s*.7,.21,.2]],.23,'Root',12,s+6);
    for(let j=0;j<5;j++)root([[s*.67,.27,.05],[s*(.62+j*.08),.13,.31],[s*(.57+j*.12),.08,.64]],.09,'Root',j);
    plate([s*.67,1.15,.31],[.32,.36,.15],'Root',[.1,s*.3,s*-.2]);
    plate([s*.77,.60,.32],[.29,.37,.18],'Root',[-.1,s*.1,s*.15]);
    for(let j=0;j<3;j++)plate([s*(.56+j*.14),.16,.52],[.21,.15,.21],'Root',[-.3,s*.12,s*.1],false);
    plate([s*.6,.87,-.23],[.27,.36,.15],'Root',[0,Math.PI,0]);
    const arm=`Arm${s}`,fore=`Fore${s}`,hand=`Hand${s}`;
    braid([[s*.84,3.29,.02],[s*1.26,2.82,.05],[s*1.57,2.1,.18]],.34,arm,16,s+7);
    braid([[s*1.57,2.17,.18],[s*1.77,1.7,.35],[s*1.87,1.12,.36]],.30,fore,15,s+8);
    braid([[s*1.86,1.25,.35],[s*1.91,1.04,.45],[s*1.91,.86,.51]],.25,hand,12,s+1);
    const big=s===-1;
    plate([s*1.08,3.52,.04],[big?.87:.57,big?.74:.52,big?.57:.41],arm,[.04,s*.13,s*-.18]);
    plate([s*1.30,3.39,.48],[big?.55:.43,big?.57:.43,.28],arm,[.08,s*.25,s*.17]);
    plate([s*1.36,3.86,.04],[big?.55:.35,.30,.36],arm,[-.5,s*.15,-s*.24]);
    plate([s*1.56,3.34,-.06],[.39,.48,.29],arm,[0,s*1.24,s*.23]);
    plate([s*1.09,3.32,-.44],[.56,.53,.25],arm,[0,Math.PI,0]);
    plate([s*1.80,1.73,.57],[big?.45:.38,.65,.25],fore,[.09,s*.25,s*-.1]);
    for(let j=0;j<3;j++){
      const y=2.10-j*.29;
      plate([s*(1.72+j*.055),y,.55],[.36-j*.02,.32,.17],fore,[.09,s*.25,s*-.1]);
      plate([s*(1.97+j*.035),y,.26],[.24,.29,.13],fore,[0,s*1.1,s*.1]);
      plate([s*(1.69+j*.04),y,-.06],[.28,.29,.13],fore,[0,Math.PI,0]);
    }
    plate([s*1.91,1.15,.56],[.29,.22,.13],hand,[.1,s*.2,0]);
    for(let j=0;j<3;j++){
      const x=s*(1.69+j*.2);
      root([[x,1.03,.50],[x+s*.04,.86,.65],[x+s*.06,.75,.67]],.11,hand,j);
      const points:V[]=[[x+s*.05,.79,.67],[x+s*.09,.60,.81],[x+s*.06,.36,.84],[x-s*.02,.16,.74],[x-s*.12,.08,.57]];
      const claw=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',.5),radii=[.103,.092,.066,.035,.0025];
      a.tube('ivory',Array.from({length:18},(_,i)=>claw.getPoint(i/17).toArray() as V),Array.from({length:18},(_,i)=>{const t=i/17*4,k=Math.min(3,Math.floor(t));return T.MathUtils.lerp(radii[k],radii[k+1],t-k);}),hand,11);
    }
    // Thin fungal shelves grow from shoulder edges and forearm seams.
    for(let j=0;j<6;j++){
      const y=j<3?(big?3.95-j*.34:3.35-j*.28):2.03-(j-3)*.24,x=s*(j<3?(big?1.62:1.49):2.02)+s*.03*Math.sin(j);
      a.ell('ivory',[x,y,.18],[.15+(j%2)*.035,.028,.16],j<3?arm:fore,j);
    }
  }
  // Broken plates follow opposing rib diagonals instead of a tiled rectangular bib.
  for(const s of [-1,1])for(let j=0;j<4;j++){
    plate([s*(.56-j*.1),3.04-j*.27,.47+j*.025],[.44-j*.035,.30,.18],'Chest',[.05,s*.15,s*(-.43+.04*j)]);
  }
  plate([0,1.64,.31],[.45,.29,.16],'Root',[.05,0,.18]);
  for(let j=0;j<9;j++)plate([(j%3-1)*.4,2.1+Math.floor(j/3)*.42,-.36],[.34,.36,.16],'Chest',[0,Math.PI,Math.sin(j)*.2]);
  // A forward, long stone face with a real dark socket behind each visible amber eye.
  a.ell('wood',[0,3.45,.49],[.40,.45,.33],'Head');
  a.plate('mouth',[0,3.39,.80],[.37,.39,.08],'Head',35);
  for(const s of [-1,1]){
    plate([s*.17,3.34,.91],[.20,.35,.105],'Head',[.03,s*.14,s*-.27],false);
    plate([s*.22,3.65,.88],[.27,.15,.14],'Head',[.04,s*.1,s*.21]);
    a.ell('eye',[s*.19,3.51,.986],[.055,.017,.012],'Head');
    a.plate('mouth',[s*.19,3.51,.96],[.11,.066,.035],'Head',42+s);
    plate([s*.33,3.42,.68],[.17,.29,.16],'Head',[0,s*.8,s*.2]);
    plate([s*.12,3.07,.86],[.13,.21,.1],'Head',[0,s*.12,s*-.32],false);
    const horn:V[]=[[s*.31,3.76,.34],[s*.57,3.97,.21],[s*.79,4.16,.10],[s*.85,4.40,-.02],[s*.74,4.65,-.03]];
    const curve=new T.CatmullRomCurve3(horn.map(p=>new T.Vector3(...p)),false,'catmullrom',.5),p=Array.from({length:26},(_,i)=>curve.getPoint(i/25).toArray() as V);
    a.tube('wood',p,p.map((_,i)=>.19*(1-i/26)**.9+.005),'Head',12);
    root([[s*.78,4.18,.08],[s*1.11,4.27,.10],[s*1.23,4.47,.07]],.07,'Head',s);
    root([[s*.55,3.96,.21],[s*.43,4.23,.17],[s*.28,4.34,.13]],.055,'Head',s+4);
    for(let j=0;j<7;j++)root([[s*(.33+j*.014),3.72,.45],[s*(.55+j*.017),4.02,.32],[s*(.8+j*.005),4.25,.15]],.017,'Head',j,'grain');
  }
  plate([0,3.83,.68],[.31,.27,.18],'Head',[.18,0,.09]);
  // A single heavy slash: weight shift, shoulder anticipation, claw impact, and return.
  const clip=a.doc.createAnimation('attack'),times=[0,.3,14/30,19/30,26/30,1.2],shoulder=[0,-.48,-1.18,.78,.24,0],elbow=[0,-.2,-.48,.32,.1,0],twist=[0,.09,.17,-.13,-.05,0];
  a.channel(clip,'Arm-1',times,shoulder.map(x=>[x,0,0]));a.channel(clip,'Fore-1',times,elbow.map(x=>[x,0,0]));
  a.channel(clip,'Arm1',times,shoulder.map(x=>[-x*.2,0,0]));a.channel(clip,'Chest',times,twist.map(x=>[x*.25,-x,0]));a.channel(clip,'Head',times,twist.map(x=>[0,x*.6,0]));
  return a.bytes();
}
if(import.meta.main){const start=performance.now(),bytes=await buildMonster(),path=process.argv.includes('--scratch')?resolve(TMP,'bun.glb'):resolve(DEMO,'bun-monster.glb');await Bun.write(path,bytes);console.log(JSON.stringify({seconds:(performance.now()-start)/1000,bytes:bytes.length,path}));}
