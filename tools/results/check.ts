/** Build both runtime surfaces without requiring local experiment data. */
import {resolve} from 'node:path';
const results=await Promise.all([
  Bun.build({entrypoints:[resolve(import.meta.dir,'serve.ts')],target:'bun',write:false}),
  Bun.build({entrypoints:[resolve(import.meta.dir,'client.ts')],target:'browser',write:false}),
]);
for(const result of results)if(!result.success)throw new AggregateError(result.logs,'Results viewer build failed');
console.log(JSON.stringify({ok:true,server:true,browser:true}));
