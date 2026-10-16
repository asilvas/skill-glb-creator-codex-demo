import './env';
import {resolve} from 'node:path';
export const ROOT=import.meta.dir,DEMO=ROOT,TMP=resolve(ROOT,'tmp');
export const referenceImage=()=>resolve(ROOT,'reference.png');
