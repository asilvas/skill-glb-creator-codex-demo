/** Small CPU-only graph test data, never imported by the browser. */
import {normalize,type ResultRecord} from './model';
export function graphRow(id:string,q:number|null=7,bytes:number|null=1_000_000,cohort='Bucket A',review='reviews/round-1/quality.json',hash?:string):ResultRecord{
  const row=normalize({schemaVersion:1,id,name:id,cohort,parentId:'shared-parent',metrics:{quality:{value:q,unit:'points/10',scope:'rubric',source:review},bytes:{value:bytes,unit:'bytes'}},provenance:hash?{glbSHA256:hash}:{},artifacts:{glb:id+'.glb'}},id+'.json');
  row.license={label:'FREE',status:'verified',family:'fixture',reason:'Fixture',evidence:[],obligations:[]};return row;
}
export function disjointLeaders(){return [...Array.from({length:15},(_,i)=>graphRow('big-'+String(i).padStart(2,'0'),10-i*.1,1_000_000_000)),...Array.from({length:15},(_,i)=>graphRow('small-'+String(i).padStart(2,'0'),5-i*.1,1_000)),...Array.from({length:10},(_,i)=>graphRow('other-'+i,1,500_000_000))];}
