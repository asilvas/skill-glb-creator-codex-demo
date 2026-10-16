import './env';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {TMP} from './paths';
export {ROOT,TMP,DEMO,referenceImage} from './paths';
// Optional counters supplied by the caller, never automatic access to private chat logs.
export function usage(){return process.env.GLB_DEMO_TOKEN_USAGE?JSON.parse(readFileSync(process.env.GLB_DEMO_TOKEN_USAGE,'utf8')):null;}
export async function mark(name:string){const data={time:new Date().toISOString(),usage:usage()};await Bun.write(resolve(TMP,`${name}.json`),JSON.stringify(data,null,2));console.log(JSON.stringify(data));}
if(import.meta.main)await mark(process.argv[2]??'mark');
