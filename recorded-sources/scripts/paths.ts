import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
export const ROOT=resolve(import.meta.dir,'..');
export const TMP=resolve(ROOT,'tmp');
export const DEMO=resolve(ROOT,'demo');
export const referenceImage=()=>existsSync(resolve(DEMO,'reference.png'))?resolve(DEMO,'reference.png'):resolve(TMP,'reference.png');
