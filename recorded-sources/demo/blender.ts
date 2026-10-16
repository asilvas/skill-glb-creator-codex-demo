import { resolve } from 'node:path';
import { runBlender } from '../../scripts/lib/blender';
import { ROOT,TMP } from './meter';
import { ensureDemoMaterials } from './materials';
const textureFolder=await ensureDemoMaterials();
process.env.PB_BLENDER_BUILDS=resolve(TMP,'blender-builds.json');
const start=performance.now();
const preview=process.argv.includes('--preview');
const r=await runBlender({script:resolve(import.meta.dir,preview?'blender-preview.py':'baseline.py'),cwd:ROOT,
  stagePath:false, rawArgs:undefined,
  args:[], env:{GLB_EXPERIMENT_TMP:TMP,GLB_TEXTURE_DIR:textureFolder,PYTHONDONTWRITEBYTECODE:'1',GLB_BENCH_ITERATION:process.argv.includes('--iteration')?'1':'0',GLB_CAPTURE:process.argv.includes('--memory')?'0':'1'},
  log:resolve(TMP,`${preview?'baseline-preview':'baseline'}-${Date.now()}.log`),result:resolve(TMP,preview?'baseline-preview-result.json':'baseline-result.json'),ledger:resolve(TMP,'blender-runs.jsonl'),
  userResources:resolve(TMP,'blender-user'),timeoutS:240,tail:12});
await Bun.write(resolve(TMP,preview?'baseline-preview-runtime.json':'baseline-runtime.json'),JSON.stringify({wallSeconds:(performance.now()-start)/1000,result:r},null,2));
console.log(JSON.stringify(r.result));
