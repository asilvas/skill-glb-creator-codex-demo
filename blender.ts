import './env';
import {resolve} from 'node:path';
import {runBlender} from './blender-cli';
import {ROOT,TMP} from './paths';
import {ensureDemoMaterials} from './materials';
const textureFolder=await ensureDemoMaterials(),preview=process.argv.includes('--preview'),start=performance.now();
const r=await runBlender({script:resolve(ROOT,preview?'blender-preview.py':'baseline.py'),log:resolve(TMP,`${preview?'baseline-preview':'baseline'}-${Date.now()}.log`),result:resolve(TMP,preview?'baseline-preview-result.json':'baseline-result.json'),env:{GLB_EXPERIMENT_TMP:TMP,GLB_TEXTURE_DIR:textureFolder,GLB_BENCH_ITERATION:process.argv.includes('--iteration')?'1':'0',GLB_CAPTURE:process.argv.includes('--memory')?'0':'1'}});
await Bun.write(resolve(TMP,preview?'baseline-preview-runtime.json':'baseline-runtime.json'),JSON.stringify({wallSeconds:(performance.now()-start)/1000,result:r},null,2));
console.log(JSON.stringify(r.result));
