import {comparisonKey,escapeHTML as esc,type Dataset,type ResultRecord} from './model';
import {graphGroups,graphScopeRows} from './graph-selection';
import {renderTradeoffPlot} from './chart';
import {InlineModelViewer} from './inline-viewer';
import {acceptResultsData,allAssetsSelection,dataViewFromSearch,filterResultRows,selectedResult,sortResultRows,licenseFilterFromSearch,matchesLicenseFilter,visibleLicenseSelection,resultsAPIURL} from './ui-state';
import {label,nf,fmt,resultsCSV,resultsTable,sourceURL,unique,views,metricCard,licenseOf,licenseBadge,licenseDetails,qualityNotice,selectedModel,filters,tradeoffs,sources} from './presentation';
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const inlineViewer=new InlineModelViewer();
const qs=new URLSearchParams(location.search);
const state={...dataViewFromSearch(qs),strategy:qs.get('strategy')??'',status:qs.get('status')??'',license:licenseFilterFromSearch(qs),mode:qs.get('mode')??'all',search:qs.get('q')??'',floor:Number(qs.get('floor')??0)||0,unscored:qs.get('unscored')!=='0',x:qs.get('x')??'bytes',y:qs.get('y')??'quality',group:qs.get('group')??'',chart:qs.get('chart')??'scatter',ranking:qs.get('ranking')==='all'?'all' as const:'leaders' as const,logX:qs.get('logX')==='1',active:qs.get('asset')??'',sort:qs.get('sort')??'quality',desc:qs.get('desc')!=='0',extra:qs.get('columns')?.split(',').filter(Boolean)??[],compare:new Set<string>(qs.get('compare')?.split(',').filter(Boolean)??[])};
let refreshSequence=0;
let data:Dataset,viewRows:ResultRecord[]=[],chartRows:ResultRecord[]=[],groups=new Map<string,ResultRecord[]>();
function persist(){const p=new URLSearchParams();for(const k of ['reviewRound','cohort','strategy','status','license','mode','x','y','group','chart','ranking','sort'] as const)if(state[k])p.set(k,state[k]);if(state.includeHistory)p.set('includeHistory','1');if(state.search)p.set('q',state.search);if(state.floor)p.set('floor',String(state.floor));if(!state.unscored)p.set('unscored','0');if(state.logX)p.set('logX','1');if(state.active)p.set('asset',state.active);if(!state.desc)p.set('desc','0');if(state.extra.length)p.set('columns',state.extra.join(','));if(state.compare.size)p.set('compare',[...state.compare].join(','));history.replaceState(null,'','/?'+p.toString());}
function filterRows(){return filterResultRows(data.records,state);}
function setGroups(){const previous=groups.get(state.group)??[];groups=graphGroups(viewRows,state.x,state.y,state.chart);const scope=graphScopeRows(viewRows,groups,state.group,previous);state.group=scope.group;chartRows=scope.rows;}
function drawPlot(){const host=$('#plot'),plot=renderTradeoffPlot(chartRows,state,host.clientWidth||920,viewRows.length);host.innerHTML=plot.html;$('#chart-note').innerHTML=plot.note;$('#graph-selections').innerHTML=plot.rankedHTML;document.querySelectorAll<HTMLElement>('#tradeoffs [data-select]').forEach(el=>{el.onclick=()=>selectModel(el.dataset.select!,true);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectModel(el.dataset.select!,true);}};});}
function sortedRows(){return sortResultRows(viewRows,state.sort,state.desc);}
function drawTable(){
  const rows=sortedRows();
  $('#result-table').innerHTML=resultsTable(rows,state);
  $('#result-table').querySelectorAll<HTMLElement>('[data-sort]').forEach(element=>element.onclick=()=>{
    const key=element.dataset.sort!;state.desc=state.sort===key?!state.desc:true;state.sort=key;render();
  });
  $('#result-table').querySelectorAll<HTMLElement>('[data-select]').forEach(element=>element.onclick=()=>selectModel(element.dataset.select!,true));
  $('#result-table').querySelectorAll<HTMLInputElement>('[data-compare]').forEach(element=>element.onchange=()=>{
    if(element.checked&&state.compare.size>=4){element.checked=false;alert('Choose up to four models.');return;}
    element.checked?state.compare.add(element.dataset.compare!):state.compare.delete(element.dataset.compare!);
    persist();$('#compare-btn').textContent=`Compare (${state.compare.size})`;
  });
}

function selectModel(id:string,scroll=false){
  state.active=id;render();
  if(scroll)document.getElementById('detail')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function render(){
  Object.assign(state,visibleLicenseSelection(data.records,state.license,state.active,state.compare));
  const focused=document.activeElement as HTMLInputElement;
  const focusId=focused?.id,selection=focused?.selectionStart;
  const opened=new Set([...document.querySelectorAll<HTMLDetailsElement>('details[id][open]')].map(element=>element.id));
  viewRows=filterRows();setGroups();
  const active=selectedResult(viewRows,state.active,state.sort,state.desc);state.active=active?.id??'';
  const all=data.records;
  $('#app').innerHTML=`
    <div class="overview"><span><strong>${viewRows.filter(row=>!row.history).length} / ${all.filter(row=>!row.history).length}</strong> current records visible</span>${state.includeHistory?`<span><strong>${viewRows.filter(row=>row.history).length} / ${all.filter(row=>row.history).length}</strong> historical review observations visible</span>`:''}<span><strong>${unique(all.map(row=>row.cohort)).length}</strong> buckets</span><span><strong>${all.filter(row=>licenseOf(row).label==='FREE').length}</strong> FREE records</span><span><strong>${viewRows.length}</strong> matching your filters</span></div>
    ${filters(data,state)}
    ${!viewRows.length&&state.license==='FREE'?`<div class="panel section"><p>No FREE models match this cohort and these filters. There are ${all.filter(row=>matchesLicenseFilter(row,'FREE')).length} FREE observations in this ${state.reviewRound?'panel':'data view'}.</p>${state.reviewRound?'<p class="subtle">Past grades remain retained when a route becomes restricted. Choose All licenses to inspect this panel’s evidence.</p><button id="panel-all-licenses">Show this panel · all licenses</button> ':''}<button id="all-free-models" class="primary">Show all FREE assets</button></div>`:''}
    <section id="observations" class="panel section"><div class="row between"><div><div class="eyebrow">${state.reviewRound?'Historical panel browser':'Browse every bucket'}</div><h2>${state.reviewRound?'Review observations':state.cohort?'Assets in this bucket':'All assets'} <small>· ${viewRows.length} matching</small></h2></div><div class="row"><button id="compare-btn">Compare (${state.compare.size})</button><button id="export-csv">Export CSV</button><button id="export-json">Export JSON</button></div></div>
      <p class="subtle">Select any row to inspect its GLB below. Every matching bucket stays in this table. Mixed review scopes remain unranked when a quality column is selected. Powerhouse scores are unvalidated model estimates; MATERIAL ONLY reviews do not rate complete assets. A human ceiling is an upper bound, not an exact score. A dash means missing or withheld evidence.</p>
      <details id="column-settings"><summary>Additional metric columns (${state.extra.length})</summary><div class="columns">${data.metricCatalog.filter(metric=>!['quality','bytes','seconds','qualityPerMB','qualityPerSec'].includes(metric.key)).map(metric=>`<label><input type="checkbox" data-column="${esc(metric.key)}" ${state.extra.includes(metric.key)?'checked':''}>${esc(label(metric.key))} <small>${metric.valid}/${all.length}</small></label>`).join('')}</div></details>
      <div id="result-table" class="tablewrap section"></div>
    </section>
    ${tradeoffs(data,state,groups)}
    <section id="detail" class="panel section selected-model" aria-labelledby="selected-title">${selectedModel(active,sortedRows())}</section>
    ${sources(data)}`;
  drawPlot();drawTable();inlineViewer.mount(active);
  bindControls();persist();
  opened.forEach(id=>{const element=document.getElementById(id) as HTMLDetailsElement|null;if(element)element.open=true;});
  if(focusId&&document.getElementById(focusId)){
    const element=$<HTMLInputElement>('#'+focusId);element.focus();
    if(selection!=null&&element.type==='search')element.setSelectionRange(selection,selection);
  }
}

function bindControls(){
  $<HTMLSelectElement>('#review-round').onchange=event=>void switchReviewRound((event.target as HTMLSelectElement).value);
  $('#all-assets').onclick=()=>showAllAssets();
  $<HTMLInputElement>('#include-history').onchange=event=>{
    state.includeHistory=(event.target as HTMLInputElement).checked;
    persist();$('#updated').textContent='Reading all assets and selected history…';void refresh({preserveViewer:true}).catch(showRefreshError);
  };
  for(const id of ['cohort','strategy','status','license','mode'] as const)$<HTMLSelectElement>('#'+id).onchange=event=>{
    const value=(event.target as HTMLSelectElement).value;
    if(id==='license')state.license=licenseFilterFromSearch(new URLSearchParams({license:value}));else state[id]=value;
    state.group='';render();
  };
  $<HTMLInputElement>('#search').oninput=event=>{state.search=(event.target as HTMLInputElement).value;render();};
  $<HTMLInputElement>('#floor').onchange=event=>{state.floor=Math.max(0,Math.min(10,Number((event.target as HTMLInputElement).value)||0));render();};
  $<HTMLInputElement>('#unscored').onchange=event=>{state.unscored=(event.target as HTMLInputElement).checked;render();};
  for(const [id,key] of [['x-metric','x'],['y-metric','y']] as const)$<HTMLSelectElement>('#'+id).onchange=event=>{
    state[key]=(event.target as HTMLSelectElement).value;state.group='';render();
  };
  $<HTMLSelectElement>('#group').onchange=event=>{state.group=(event.target as HTMLSelectElement).value;render();};
  $<HTMLSelectElement>('#graph-ranking').onchange=event=>{state.ranking=(event.target as HTMLSelectElement).value==='all'?'all':'leaders';render();};
  $<HTMLInputElement>('#logx').onchange=event=>{state.logX=(event.target as HTMLInputElement).checked;render();};
  document.querySelectorAll<HTMLElement>('[data-chart]').forEach(element=>element.onclick=()=>{state.chart=element.dataset.chart!;render();});
  document.querySelectorAll<HTMLElement>('[data-preset]').forEach(element=>element.onclick=()=>{
    const preset=element.dataset.preset;state.x=preset==='time'?'seconds':'bytes';state.y=preset==='density'?'qualityPerMB':'quality';state.chart='scatter';state.group='';render();
  });
  document.querySelectorAll<HTMLElement>('[data-quick-mode]').forEach(element=>element.onclick=()=>{state.mode=element.dataset.quickMode!;state.group='';render();});
  $('#all-animations').onclick=()=>showAllAssets(false,'animated');
  document.querySelectorAll<HTMLInputElement>('[data-column]').forEach(element=>element.onchange=()=>{
    state.extra=element.checked?[...state.extra,element.dataset.column!]:state.extra.filter(key=>key!==element.dataset.column);render();
  });
  $('#reset').onclick=()=>{state.x='bytes';state.y='quality';state.ranking='leaders';showAllAssets(true);};
  const allFree=document.getElementById('all-free-models');
  if(allFree)allFree.onclick=()=>showAllAssets(true);
  const panelAll=document.getElementById('panel-all-licenses');if(panelAll)panelAll.onclick=()=>{state.license='all';render();};
  $('#export-csv').onclick=exportCSV;
  $('#export-json').onclick=()=>download('filtered-results.json',JSON.stringify({schemaVersion:1,generated:data.generated,filters:{...state,compare:[...state.compare]},records:viewRows},null,2),'application/json');
  $('#compare-btn').onclick=showCompare;
  const picker=document.getElementById('asset-picker') as HTMLSelectElement|null;
  if(picker)picker.onchange=()=>selectModel(picker.value);
  const load=document.getElementById('load-model'),unload=document.getElementById('unload-model');
  if(load)load.onclick=()=>void inlineViewer.load();
  if(unload)unload.onclick=()=>inlineViewer.unload();
  document.querySelectorAll<HTMLElement>('[data-play-clip]').forEach(element=>element.onclick=()=>void inlineViewer.playClip(element.dataset.playClip!));
}
function download(name:string,text:string,mime:string){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function exportCSV(){download('filtered-results.csv',resultsCSV(viewRows),'text/csv');}
function showCompare(){const selected=[...state.compare].map(id=>data.records.find(r=>r.id===id)).filter(Boolean) as ResultRecord[];if(!selected.length){alert('Select up to four result checkboxes first.');return;}const baseline=selected[0];$('#compare-content').innerHTML=selected.map((r,i)=>`<article class="comparecard"><span class="badge">${i?'Compared result':'Baseline'}</span><h3>${esc(r.name)}</h3>${licenseBadge(r)}${qualityNotice(r)}<p class="subtle">${esc(r.cohort)}<br>${esc(r.baseStrategy)} / ${esc(r.subStrategy)}</p><div class="fourviews">${views(r)}</div>${r.motionViews.length?`<details><summary>Retained animation phase sheets (${r.motionViews.length})</summary><div class="fourviews">${views(r,r.motionViews)}</div></details>`:''}<div class="detailmetrics">${['quality',...(r.metrics.humanQualityCeiling?['humanQualityCeiling','modelQuality']:[]),'bytes','seconds','qualityPerMB','qualityPerSec','triangles'].map(k=>metricCard(r,k)).join('')}</div>${i?`<p class="deltas">${['quality','bytes','seconds','qualityPerMB','qualityPerSec'].map(k=>{const a=baseline.metrics[k],b=r.metrics[k],compatible=comparisonKey(baseline,k,k)===comparisonKey(r,k,k)&&comparisonKey(r,k,k)!=null;if(!compatible)return `${esc(label(k))}: incompatible / missing scope`;const d=b.value!-a.value!;return `${esc(label(k))}: ${d>=0?'+':''}${nf(d,4)}${a.value!==0?` (${d>=0?'+':''}${nf(100*d/Math.abs(a.value!),1)}%)`:''} vs baseline`;}).join('<br>')}</p>`:''}${licenseDetails(r)}<p class="scope">${esc(r.metrics.seconds?.scope??'No time scope')}</p><a href="${esc(sourceURL(r.source))}" target="_blank">Source</a></article>`).join('');$<HTMLDialogElement>('#compare-dialog').showModal();}
function showRefreshError(error:unknown){$('#updated').textContent=String(error);}
function showAllAssets(resetLicense=false,mode='all'){
  const reload=!!state.reviewRound||state.includeHistory;
  Object.assign(state,allAssetsSelection(),{mode,...(resetLicense?{license:'FREE' as const}:{})});
  if(reload){inlineViewer.reset();persist();void refresh().catch(showRefreshError);}else render();
}
async function switchReviewRound(round:string){
  Object.assign(state,allAssetsSelection(),{reviewRound:round,x:'bytes',y:'quality'});inlineViewer.reset();persist();$('#updated').textContent='Reading selected data view…';
  await refresh().catch(showRefreshError);
}
async function refresh(options:{preserveViewer?:boolean}={}){const sequence=++refreshSequence,requestedRound=state.reviewRound,requestedHistory=state.includeHistory;const response=await fetch(resultsAPIURL(requestedRound,requestedHistory),{cache:'no-store'});if(sequence!==refreshSequence)return;if(!response.ok)throw Error(`Data request failed (${response.status})`);const next=await response.json();if(sequence!==refreshSequence)return;data=acceptResultsData(next,{reviewRound:requestedRound,includeHistory:requestedHistory,preserveViewer:options.preserveViewer},()=>inlineViewer.reset());$('#updated').textContent=`Read ${new Date(data.generated).toLocaleString()} · ${requestedRound?'frozen '+requestedRound+' observations':requestedHistory?'all assets with historical reviews':'all current assets'}`;render();}
$('#refresh').onclick=()=>refresh().catch(showRefreshError);$('#close-compare').onclick=()=>$<HTMLDialogElement>('#compare-dialog').close();
refresh().catch(e=>{$('#app').innerHTML=`<div class="errorbox">${esc(String(e))}<br>The server is still available; refresh after repairing the data source.</div>`;});

let resizeFrame=0;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(data&&document.getElementById('plot'))drawPlot();});});
window.addEventListener('pagehide',()=>inlineViewer.reset());
