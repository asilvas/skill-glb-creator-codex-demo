import {test,expect} from 'bun:test';
import {normalize} from './model';
import {filters,licenseBadge,licenseDetails,metricCard,reviewContextLabel,resultsCSV,resultsTable,selectedModel,tradeoffs,type DisplayState} from './presentation';
import {metricCatalog,comparisonKey} from './model';

test('quality cards, detail and CSV expose review identity without changing the score or rubric',()=>{
  const source='experiments/fixture/reviews/round-8/quality.json';
  const record=normalize({schemaVersion:1,id:'fixture',cohort:'Fixture',metrics:{quality:{value:6.13,unit:'points/10',scope:'unchanged-rubric',source},bytes:{value:1_000_000,unit:'bytes'},seconds:{value:20,unit:'s',scope:'measured-stage'}}},'experiments/fixture/experiment.json');
  expect(reviewContextLabel(record)).toBe('Review round 8');expect(metricCard(record,'quality')).toContain('Review round 8');
  const detail=selectedModel(record,[record]);expect(detail).toContain('<strong>Quality rubric:</strong> unchanged-rubric');expect(detail).toContain('<strong>Quality review:</strong> '+source);
  const [header,row]=resultsCSV([record]).trimEnd().split('\n').map(line=>[...line.matchAll(/"((?:""|[^"])*)"(?:,|$)/g)].map(match=>match[1].replaceAll('""','"')));
  const fields=Object.fromEntries(header.map((key,i)=>[key,row[i]]));
  expect(fields.quality).toBe('6.13');expect(fields.quality_scope).toBe('unchanged-rubric');expect(fields.quality_source).toBe(source);expect(fields.quality_evaluation_context).toBe(source);
  expect(fields.qualityPerMB_evaluation_context).toBe(source);expect(fields.qualityPerSec_evaluation_context).toBe(source);expect(fields.seconds_evaluation_context).toBe('');expect(fields.bytes_evaluation_context).toBe('');
});

test('review labels retain arbitrary context as escaped text and do not invent legacy rounds',()=>{
  const record=normalize({schemaVersion:1,id:'fixture',metrics:{quality:{value:6,unit:'points/10',scope:'rubric',evaluationContext:'<script>panel</script>'}}},'fixture.json');
  expect(metricCard(record,'quality')).not.toContain('<script>');expect(metricCard(record,'quality')).toContain('&lt;script&gt;panel&lt;/script&gt;');
  const legacy=normalize({schemaVersion:1,id:'legacy',metrics:{quality:{value:6,unit:'points/10',scope:'rubric'}}},'unrelated/round-8/experiment.json');
  expect(reviewContextLabel(legacy)).toBe('');expect(selectedModel(legacy,[legacy])).toContain('<strong>Quality review:</strong> Not recorded');
});

test('preview choices expose automatic GLB preference and consistent clip eligibility with a PNG placeholder',()=>{
  const record=normalize({schemaVersion:1,id:'fixture',artifacts:{glb:'fixture.glb'},animations:[{name:'Idle',duration:4}]},'fixture.json');
  const button=(html:string,id:string)=>html.match(new RegExp(`<button id="${id}"[^>]*>`))![0];
  for(const eligible of [true,false]){
    record.artifacts.glb!.available=eligible;const html=selectedModel(record,[record]);
    expect(button(html,'load-model')).toContain(`aria-pressed="${eligible}"`);expect(button(html,'load-model').includes('disabled')).toBe(!eligible);
    expect(button(html,'unload-model')).toContain(`aria-pressed="${!eligible}"`);expect(button(html,'unload-model')).not.toContain('hidden');
    expect(html.match(/<button class="clip-button"[^>]*>/)![0].includes('disabled')).toBe(!eligible);
    expect(html).toContain('No retained PNG preview');expect(html).toContain('aria-label="Preview format"');expect(html).not.toContain('Load interactive model');
  }
  record.artifacts.glb!.available=true;record.artifacts.glb!.matchesRecordedHash=false;
  expect(button(selectedModel(record,[record]),'load-model')).toContain('disabled');
  delete (record.artifacts.glb as any).available;delete record.artifacts.glb!.matchesRecordedHash;
  const unknown=selectedModel(record,[record]);expect(button(unknown,'load-model')).not.toContain('disabled');expect(unknown).toContain('GLB availability unverified');
});

test('verified geometry is visible beside a restricted composite without changing its overall license',()=>{
  const record=normalize({schemaVersion:1,id:'split'},'fixture.json');
  const geometry={stage:'Geometry' as const,label:'FREE' as const,status:'verified' as const,family:'audited-geometry',reason:'Audited <geometry>',evidence:[],obligations:[]};
  record.license={label:'Restricted License',status:'restricted',family:'historical-composite',reason:'Historical materials',evidence:[],obligations:[],components:[geometry,{...geometry,stage:'Materials',label:'Restricted License',status:'restricted',family:'historical-materials',reason:'Historical Qwen materials'}]};
  const badge=licenseBadge(record);expect(badge).toContain('>Restricted License</span>');expect(badge).toContain('>Geometry: FREE</span>');expect(badge).toContain('Audited &lt;geometry&gt;');
  expect(selectedModel(record,[record])).toContain('Geometry: FREE');expect(licenseDetails(record)).toContain('Materials · Restricted License');
  record.license.components![0].status='unverified';expect(licenseBadge(record)).not.toContain('Geometry: FREE');
  record.license.components![0].status='verified';record.license.label='FREE';expect(licenseBadge(record)).not.toContain('Geometry: FREE');
});

test('component evidence escapes labels and allows only safe HTTP and workspace links',()=>{
  const record=normalize({schemaVersion:1,id:'evidence'},'fixture.json');
  record.license={label:'Restricted License',status:'restricted',family:'fixture',reason:'Composite',obligations:[],evidence:[],components:[{stage:'Geometry',label:'FREE',status:'verified',family:'audited-geometry',reason:'<script>unsafe</script>',obligations:['<notice>'],evidence:[
    {title:'Original <audit>',url:'/results/LICENSE-AUDIT.md'},
    {title:'Upstream',url:'https://example.org/license?q="quoted"'},
    ...['javascript:alert(1)','//example.org/elsewhere','/../private','/%2e%2e/private','/unsafe\\path','/%5c%5cexample.org','/bad%ZZ'].map(url=>({title:'Forbidden link',url}))
  ]}]};
  const html=licenseDetails(record);expect(html).toContain('Geometry · FREE');expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');expect(html).toContain('&lt;notice&gt;');
  expect(html).toContain('href="/results/LICENSE-AUDIT.md"');expect(html).toContain('Original &lt;audit&gt;');expect(html).toContain('href="https://example.org/license?q=&quot;quoted&quot;"');expect(html).toContain('rel="noopener noreferrer"');expect(html).not.toContain('Forbidden link');expect(html).not.toContain('<script>');
});

test('global controls are obvious and the plot-only scope never removes cross-bucket table rows',()=>{
  const a=normalize({schemaVersion:1,id:'a',name:'Current A',cohort:'Bucket A',metrics:{quality:{value:7,unit:'points/10',scope:'rubric-A',source:'panels/round-1/quality.json'},bytes:{value:100,unit:'bytes'}},artifacts:{glb:'a.glb'}},'a.json');
  const b=normalize({schemaVersion:1,id:'b',name:'Historical B',cohort:'Bucket B',metrics:{quality:{value:9,unit:'points/10',scope:'rubric-B',source:'panels/round-2/quality.json'},bytes:{value:100,unit:'bytes'}}},'b.json');
  delete (a.artifacts.glb as any).available;b.history={round:'round-2'} as any;
  const records=[a,b],data={schemaVersion:1 as const,generated:'now',records,issues:[],sources:[],metricCatalog:metricCatalog(records),reviewHistory:{rounds:[]}},state:DisplayState={cohort:'',strategy:'',status:'',license:'FREE',includeHistory:true,mode:'all',search:'',floor:0,unscored:true,x:'bytes',y:'quality',group:comparisonKey(a,'bytes','quality')!,chart:'scatter',logX:false,extra:[],compare:new Set()};
  const controls=filters(data,state);expect(controls).toContain('>All assets</option>');expect(controls).toContain('All assets · every bucket');expect(controls).toContain('>All buckets</option>');expect(controls).toContain('id="include-history" type="checkbox" checked');expect(controls).toContain('All licenses · include restricted');
  const table=resultsTable(records,{...state,sort:'quality',desc:true,active:'a'});expect(table).toContain('Current A');expect(table).toContain('Historical B');expect(table).toContain('<th>Quality context</th>');expect(table).toContain('rubric-A');expect(table).toContain('rubric-B');expect(table).toContain('Review round 2');expect(table).toContain('Historical observation');expect(table).toContain('Availability unverified');
  const plot=tradeoffs(data,state,new Map([[state.group,[a]],[comparisonKey(b,'bytes','quality')!,[b]]]));expect(plot).toContain('Plot comparison scope');expect(plot).toContain('This scope controls only the plot');expect(plot.indexOf('id="group"')).toBeLessThan(plot.indexOf('id="chart-settings"'));expect(plot.match(/id="group"/g)).toHaveLength(1);
  expect(comparisonKey(a,'quality','quality')).not.toBe(comparisonKey(b,'quality','quality'));
});
