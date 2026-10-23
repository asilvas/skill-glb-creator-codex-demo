import {escapeHTML as esc,csvCell,metricEvaluationContext,type Dataset,type Metric,type ResultRecord} from './model';
import {classifyLicense} from './license';
import {inlineModelURL,localGLBLabel} from './ui-state';

const titles:Record<string,string>={
  quality:'Quality observation /10',bytes:'GLB size',seconds:'Measured time',qualityPerMB:'Score estimate per MB',
  qualityPerSec:'Score estimate per second',modelQuality:'Raw model estimate /10',modelQualityMin:'Raw model minimum',modelQualityMax:'Raw model maximum',humanQualityCeiling:'Human upper bound /10',triangles:'Triangles',tokens:'Agent tokens',
  qualityMin:'Reviewer minimum',qualityMax:'Reviewer maximum',renderRetention:'Render retention',pairedReviewRetention:'Paired review ratio'
};
export const label=(key:string)=>titles[key]??key.replace(/([a-z])([A-Z])/g,'$1 $2');
export const nf=(value:number,digits=2)=>value.toLocaleString('en-US',{maximumFractionDigits:digits});
export const sourceURL=(path:string)=>'/'+path.split('/').map(encodeURIComponent).join('/');
export const unique=(items:string[])=>[...new Set(items)].sort();
export function reviewContextLabel(record:ResultRecord,key='quality'){
  const context=metricEvaluationContext(record,key);if(!context)return '';
  const round=context.match(/(?:^|[\/\\])round[-_ ](\d+)(?:[\/\\]|$)/i);
  return round?`Review round ${round[1]}`:context;
}

export function fmt(metric?:Metric,key=''){
  if(metric?.value==null)return '—';
  const value=metric.value;
  if(metric.bound==='upper'||key==='humanQualityCeiling')return `≤${nf(value)}`;
  if(['renderRetention','pairedReviewRetention'].includes(key)&&metric.unit==='ratio')return `${nf(value*100,1)}%`;
  if(key==='bytes'||metric.unit==='bytes')return `${nf(value/1e6)} MB`;
  if(metric.unit==='points/MB')return value.toFixed(4);
  if(metric.unit==='points/s')return value!==0&&Math.abs(value)<.001?value.toExponential(2):value.toFixed(4);
  if(metric.unit==='points/10')return value.toFixed(2);
  if(metric.unit==='s')return `${nf(value)} s`;
  return nf(value,metric.unit==='count'||metric.unit==='tokens'?0:3);
}

export function qrange(record:ResultRecord){
  const quality:any=record.metrics.quality;
  const min=record.metrics.qualityMin?.value??quality?.min,max=record.metrics.qualityMax?.value??quality?.max;
  return typeof min==='number'&&typeof max==='number'?`${nf(min)}–${nf(max)}`:'';
}

export function views(record:ResultRecord,items=record.views){
  if(!items.length)return '<div class="placeholder">No retained PNG perspectives</div>';
  return items.map(view=>`<figure>${view.available
    ?`<a href="${esc(view.url)}" target="_blank"><img loading="lazy" src="${esc(view.url)}" alt="${esc(record.name+' / '+view.label)}"></a>`
    :'<div class="placeholder">PNG unavailable locally</div>'}<figcaption>${esc(view.label)}</figcaption></figure>`).join('');
}

export function metricCard(record:ResultRecord,key:string){
  const metric=record.metrics[key];
  const context=metricEvaluationContext(record,key),review=key==='quality'?reviewContextLabel(record):'';
  return `<div title="${esc([metric?.reason,metric?.scope??(metric?.value!=null?metric.unit:'Not recorded'),context].filter(Boolean).join(' · '))}"><b>${fmt(metric,key)}</b><span>${esc(key==='quality'?qualityLabel(record):label(key))}</span>${review?`<small>${esc(review)}</small>`:''}</div>`;
}

export function qualityLabel(record:ResultRecord){
  return record.qualityAssessment?.label??(record.metrics.quality?.scope==='powerhouse-static-v1'?'Unvalidated model estimate':/^material-(?:all15|primary8)-/.test(record.metrics.quality?.scope??'')?'MATERIAL ONLY · model estimate':'Quality observation');
}
export function qualityNotice(record:ResultRecord){
  const a=record.qualityAssessment;if(!a)return '';
  return `<p class="quality-assessment ${a.status==='human-rejected'?'danger':'subtle'}"><strong>${esc(a.label)}</strong> · ${esc(a.detail)}${a.status==='human-rejected'?` Raw model estimate: ${esc(fmt(record.metrics.modelQuality,'modelQuality'))}/10. No exact human score or quality ratio is available.`:''}</p>`;
}

export function resultsCSV(records:ResultRecord[]){
  const keys=unique(records.flatMap(r=>Object.keys(r.metrics))),header=['id','name','cohort','baseStrategy','subStrategy','parentId','status','qualityAssessmentStatus','qualityAssessmentLabel','qualityAssessmentDetail','qualityAssessmentSource','candidateEligible','originalRecordStatus','license','licenseStatus','licenseReason',...keys.flatMap(k=>[k,k+'_unit',k+'_scope',k+'_evaluation_context',k+'_source',k+'_missing_reason',k+'_bound']),'localGlb','source'];
  const rows=records.map(r=>[r.id,r.name,r.cohort,r.baseStrategy,r.subStrategy,r.parentId,r.status,r.qualityAssessment?.status??'',qualityLabel(r),r.qualityAssessment?.detail??'',r.qualityAssessment?.source??'',r.qualityAssessment?.candidateEligible??'',r.qualityAssessment?.originalStatus??r.status,licenseOf(r).label,licenseOf(r).status,licenseOf(r).reason,...keys.flatMap(k=>[r.metrics[k]?.value??'',r.metrics[k]?.unit??'',r.metrics[k]?.scope??'',metricEvaluationContext(r,k)??'',r.metrics[k]?.source??'',r.metrics[k]?.reason??'',r.metrics[k]?.bound??'']),r.artifacts.glb?.available??false,r.source]);
  return [header,...rows].map(r=>r.map(csvCell).join(',')).join('\n')+'\n';
}

export function clipBadge(record:ResultRecord){
  return record.animations.length?`<span class="badge animation-badge">▶ ${record.animations.length} ${record.animations.length===1?'animation':'animations'}</span>`:'';
}

export const licenseOf=(record:ResultRecord)=>record.license??classifyLicense(record);
export function licenseBadge(record:ResultRecord){
  const license=licenseOf(record);
  const geometry=license.label==='Restricted License'?license.components?.find(component=>component.stage==='Geometry'&&component.label==='FREE'&&component.status==='verified'):undefined;
  return `<span class="badge license-badge ${license.label==='FREE'?'license-free':'license-restricted'}" title="${esc(license.reason)}">${license.label}</span>${geometry?` <span class="badge license-free" title="${esc(geometry.reason)}">Geometry: FREE</span>`:''}`;
}
export function licenseDetails(record:ResultRecord){
  const license=licenseOf(record);
  const safeLink=(url:string)=>{
    if(/[\u0000-\u0020\\]/.test(url))return false;
    if(/^https?:\/\//i.test(url))return true;
    if(!/^\/(?!\/)/.test(url))return false;
    try{const path=decodeURIComponent(url.split(/[?#]/)[0]);return !path.includes('\\')&&!path.startsWith('//')&&!path.split('/').includes('..');}catch{return false;}
  };
  const links=(evidence:{title:string;url:string}[])=>evidence.filter(source=>safeLink(source.url)).map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`).join('');
  const components=license.components?.map(component=>`<section class="license-component"><h4>${esc(component.stage)} · ${esc(component.label)}</h4><p class="subtle">${esc(component.reason)}</p>${component.obligations.length?`<ul class="notes">${component.obligations.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`:''}<div class="row evidence-links">${links(component.evidence)}</div></section>`).join('')??'';
  return `<details class="license-details"><summary>License evidence · ${esc(license.label)}</summary><p class="subtle">${esc(license.reason)}</p>${components?`<div class="license-components" aria-label="Technology component licenses">${components}</div>`:''}${license.obligations.length?`<ul class="notes">${license.obligations.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`:''}<div class="row evidence-links">${links(license.evidence)}</div><p class="subtle">FREE means the audited technology route permits commercial use without geographic, revenue or paid-license gates. Required notices still apply. Unverified routes are labeled Restricted License. Reference-image rights are separate.</p></details>`;
}

export function selectedModel(record:ResultRecord|undefined,records:ResultRecord[]){
  if(!record)return '<div class="empty">No model matches these filters. The default shows FREE technology routes. Change Commercial use to All licenses to inspect restricted history, or clear other filters.</div>';
  const local=!!inlineModelURL(record);
  const hero=record.views.find(view=>view.available)??record.history?.boards.find(view=>view.available);
  const failed=/fail|unmet|reject/i.test(record.status);
  return `
    <div class="row between selected-heading">
      <div><div class="eyebrow">${record.history?'Historical review observation':'Selected model'}</div><h2 id="selected-title">${esc(record.name)}</h2></div>
      <label class="model-picker">Choose model<select id="asset-picker" aria-label="Choose selected model">${records.map(row=>`<option value="${esc(row.id)}" ${row.id===record.id?'selected':''}>${row.animations.length?'▶ '+row.animations.length+' clips · ':''}${esc(row.name)} · ${licenseOf(row).label}</option>`).join('')}</select></label>
    </div>
    <div class="row model-badges">${licenseBadge(record)}<span class="badge ${failed?'danger':''}">${esc(record.status)}</span>${clipBadge(record)}<span class="badge">${record.assetRole==='master'?'Master':record.assetRole==='variant'?'Delivery variant':'Derived experiment'}</span><span class="badge">${local?(record.artifacts.glb?.available===true?'GLB available locally':'GLB availability unverified'):'GLB preview unavailable'}</span></div>
    ${qualityNotice(record)}
    ${record.history?`<p class="subtle">Frozen ${esc(record.history.round)} observation of ${esc(record.history.originalAssetId)}. This is a past panel score for the recorded binary, not another generated asset. Current license policy applies; no historical generation time is inferred.</p>`:''}
    <div class="model-layout">
      <div class="model-preview">
        <div id="model-static-preview" class="model-static-preview">${hero?`<img src="${esc(hero.url)}" alt="${esc(record.name+' / '+hero.label)}">`:'<div class="placeholder">No retained PNG preview</div>'}</div>
        <div id="model-live-slot" hidden></div>
        <div class="row viewer-actions" role="group" aria-label="Preview format"><button id="load-model" class="${local?'primary':''}" aria-pressed="${local}" aria-controls="model-live-slot" ${local?'':'disabled'}>GLB preview</button><button id="unload-model" class="${local?'':'primary'}" aria-pressed="${!local}" aria-controls="model-static-preview">PNG preview</button><span id="viewer-load-status" class="subtle" role="status">${local?'Loading local GLB…':'Local GLB unavailable. Showing PNG preview.'}</span></div>
        ${record.artifacts.glb?.matchesRecordedSize===false?'<p class="danger subtle">This local GLB differs in size from the recorded result. Archived scores describe the recorded asset.</p>':''}
        ${record.artifacts.glb?.matchesRecordedHash===false?'<p class="danger subtle">This local GLB has a different SHA256 from the reviewed binary. The interactive viewer is disabled.</p>':''}
      </div>
      <div class="model-information">
        <div class="detailmetrics">${['quality',...(record.metrics.humanQualityCeiling?['humanQualityCeiling','modelQuality']:[]),'bytes',...(record.metrics.renderRetention?['renderRetention']:[]),...(record.metrics.pairedReviewRetention?['pairedReviewRetention']:[]),'seconds','qualityPerMB','qualityPerSec','triangles'].map(key=>metricCard(record,key)).join('')}</div>
        ${record.metrics.renderRetention?'<p class="subtle">Render retention compares this delivery with its master. Quality /10 is an independent reference-based review.</p>':''}
        ${record.metrics.pairedReviewRetention?'<p class="subtle">The paired ratio compares blind mean ratings with the source control. It is an estimate from this review, not a calibrated human-quality percentage.</p>':''}
        ${record.animations.length?`<section class="animation-list"><h3>Animations</h3><p class="subtle">Choose a clip to play it in the GLB preview.</p>${record.animations.map(clip=>`<button class="clip-button" data-play-clip="${esc(clip.name)}" ${local?'':'disabled'}><span>▶ ${esc(clip.name)}</span><small>${clip.duration==null?'Duration not recorded':nf(clip.duration)+' s'}</small></button>`).join('')}</section>`:'<p class="subtle">No animation clips recorded for this model.</p>'}
        <details><summary>Measurement context</summary><p class="scope"><strong>Quality rubric:</strong> ${esc(record.metrics.quality?.scope??'Not recorded')}<br><strong>Quality review:</strong> ${esc(metricEvaluationContext(record,'quality')??'Not recorded')}<br><strong>Timing:</strong> ${esc(record.metrics.seconds?.scope??'Not recorded')}</p><p class="subtle">Quality comparisons require the same independent review context as well as the same rubric. Quality ratios compare recorded score with file size or the named timing stage. They do not establish complete authoring throughput.</p></details>
        ${licenseDetails(record)}
        ${record.issues.length?`<ul class="notes danger">${record.issues.map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul>`:''}
        <details><summary>Findings and limitations (${record.notes.length})</summary><ul class="notes">${record.notes.filter(Boolean).map(note=>`<li>${esc(note)}</li>`).join('')}</ul></details>
        <div class="row evidence-links"><a href="${esc(sourceURL(record.source))}" target="_blank">Source data</a>${record.artifacts.review?.available?`<a href="${esc(record.artifacts.review.url)}" target="_blank">Original report</a>`:''}</div>
        <details><summary>All metrics and provenance</summary><pre>${esc(JSON.stringify({qualityAssessment:record.qualityAssessment,license:licenseOf(record),metrics:record.metrics,provenance:record.provenance,extra:record.extra},null,2))}</pre></details>
      </div>
    </div>
    ${record.history?.boards.length?`<section class="history-evidence"><h3>Frozen review boards · ${esc(record.history.round)}</h3><p class="subtle">The exact panel evidence is available without a local GLB. Where a retained board hash exists it is verified before the image is enabled. Earlier maps without board hashes retain that limitation.</p><div class="motionviews">${views(record,record.history.boards)}</div></section>`:''}
    <div class="fixed-view-heading"><h3>Four fixed perspectives</h3><span class="subtle">Comparable retained evidence</span></div><div class="fourviews">${views(record)}</div>
    ${record.motionViews.length?`<details class="motion-evidence"><summary>Animation phase sheets (${record.motionViews.length})</summary><div class="motionviews">${views(record,record.motionViews)}</div></details>`:''}`;
}

export function resultsTable(rows:ResultRecord[],state:{reviewRound?:string;extra:string[];sort:string;desc:boolean;active:string;compare:Set<string>}){
  const base=state.reviewRound?['quality','bytes','qualityPerMB']:['quality','bytes','seconds','qualityPerMB','qualityPerSec'];
  const defaults=[...base,...(rows.some(r=>r.metrics.humanQualityCeiling)?['humanQualityCeiling']:[])];
  const columns=[...defaults,...state.extra.filter(key=>!defaults.includes(key))];
  if(!rows.length)return '<div class="empty">No assets match. Clear a filter or choose All assets.</div>';
  return `<table><thead><tr>
    <th><span class="subtle">Compare</span></th><th><button data-sort="name">Model</button></th><th>License</th><th>Quality context</th><th>Animations</th>
    ${columns.map(key=>`<th><button data-sort="${esc(key)}">${esc(label(key))}${state.sort===key?(state.desc?' ↓':' ↑'):''}</button></th>`).join('')}<th>GLB</th>
  </tr></thead><tbody>${rows.map(row=>`<tr class="${row.id===state.active?'selected':''}">
    <td><input type="checkbox" data-compare="${esc(row.id)}" aria-label="Compare ${esc(row.name)}" ${state.compare.has(row.id)?'checked':''}></td>
    <td class="name"><button class="itemname" data-select="${esc(row.id)}">${esc(row.name)}</button><br><small>${esc(row.cohort)}</small><br><span class="badge ${/fail|unmet/i.test(row.status)?'danger':''}">${esc(row.status)}</span>${row.issues.length?`<small class="danger"> · ${row.issues.length} data notes</small>`:''}</td>
    <td>${licenseBadge(row)}</td>
    <td class="quality-context"><strong>${esc(qualityLabel(row))}</strong><br><span>${esc(reviewContextLabel(row)||'No independent review recorded')}</span><br><small>${esc(row.metrics.quality?.scope??'No rubric recorded')}</small>${row.qualityAssessment?.status==='human-rejected'?`<br><small>Raw model estimate ${esc(fmt(row.metrics.modelQuality,'modelQuality'))}/10 · excluded from quality ranking</small>`:''}${row.history?'<br><span class="badge">Historical observation</span>':''}</td>
    <td class="animation-cell">${clipBadge(row)}${row.animations.length?`<small class="clip-names">${row.animations.map(clip=>esc(clip.name)).join('<br>')}</small>`:'<small>Static</small>'}</td>
    ${columns.map(key=>`<td class="num" title="${esc([row.metrics[key]?.scope??row.metrics[key]?.reason??'Not recorded',metricEvaluationContext(row,key)].filter(Boolean).join(' · '))}">${fmt(row.metrics[key],key)}${key==='quality'&&qrange(row)?`<br><small>${qrange(row)}</small>`:''}${key==='quality'&&reviewContextLabel(row)?`<br><small>${esc(reviewContextLabel(row))}</small>`:''}</td>`).join('')}
    <td><span class="badge">${localGLBLabel(row)}</span></td>
  </tr>`).join('')}</tbody></table>`;
}

export type DisplayState={reviewRound?:string;includeHistory?:boolean;cohort:string;strategy:string;status:string;license?:string;mode:string;search:string;floor:number;unscored:boolean;x:string;y:string;group:string;chart:string;ranking?:'leaders'|'all';logX:boolean;extra:string[];compare:Set<string>};
function options(values:string[],current:string,first:string){
  return `<option value="">${first}</option>`+values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(value)}</option>`).join('');
}
export function metricOptions(data:Dataset,value:string){
  return data.metricCatalog.map(metric=>`<option value="${esc(metric.key)}" ${metric.key===value?'selected':''} ${metric.valid&&metric.key!=='humanQualityCeiling'?'':'disabled'}>${esc(label(metric.key))} · ${metric.key==='humanQualityCeiling'?'upper bound, not an exact plot value':esc(metric.units.join(' / ')||'unavailable')}</option>`).join('');
}

export function filters(data:Dataset,state:DisplayState){
  const scoped=data.records.filter(row=>(!state.cohort||row.cohort===state.cohort)&&(state.license==='all'||licenseOf(row).label===(state.license??'FREE')));
  const animated=scoped.filter(row=>row.animations.length).length;
  const advanced=[state.strategy,state.status,state.floor>0,!state.unscored,!['all','animated'].includes(state.mode)].filter(Boolean).length;
  return `<section class="filters" aria-label="Find models">
    <div class="filter-main"><label>Data view<select id="review-round" aria-label="All assets or historical review panel"><option value="" ${!state.reviewRound?'selected':''}>All assets</option>${data.reviewHistory?.rounds.length?`<optgroup label="Historical review panels">${data.reviewHistory.rounds.map(panel=>`<option value="${esc(panel.round)}" ${state.reviewRound===panel.round?'selected':''}>${esc(panel.cohort)} · ${panel.count} observations${panel.status==='invalid'?' · data issues':''}</option>`).join('')}</optgroup>`:''}</select></label><button id="all-assets" class="primary">All assets · every bucket</button><label class="check"><input id="include-history" type="checkbox" ${state.includeHistory?'checked':''} ${state.reviewRound?'disabled':''}>Include historical reviews</label><p class="subtle">${state.reviewRound?'One frozen panel at a time. Choose All assets for every bucket.':state.includeHistory?'Current assets plus separate historical review observations; a model can appear in several rounds.':'Current assets appear once across every bucket. Historical reviews are optional.'} Scores keep their own rubric and review scope.</p></div>
    <div class="filter-main"><label>Bucket / cohort<select id="cohort">${options(unique(data.records.map(row=>row.cohort)),state.cohort,state.reviewRound?'All observations in this panel':'All buckets')}</select></label><label>Commercial use<select id="license">${[['FREE','FREE · default'],['all','All licenses · include restricted'],['Restricted License','Restricted License']].map(([value,text])=>`<option value="${value}" ${value===(state.license??'FREE')?'selected':''}>${text}</option>`).join('')}</select></label><label class="search">Search all matching assets<input id="search" type="search" value="${esc(state.search)}" placeholder="Name, bucket, material or technique…"></label><button id="reset">Clear filters</button></div>
    <div class="row between"><div class="segmented quick-filters" aria-label="Model types"><button data-quick-mode="all" class="${state.mode==='all'?'active':''}" aria-pressed="${state.mode==='all'}">${state.reviewRound?'All observations':'All models'} <span>${scoped.length}</span></button><button data-quick-mode="animated" class="${state.mode==='animated'?'active':''}" aria-pressed="${state.mode==='animated'}">▶ Animated <span>${animated}</span></button></div><button id="all-animations" class="text-button">View all animated assets</button></div>
    <details id="filter-settings" class="advanced-filters"><summary>More filters${advanced?` · ${advanced} applied`:''}</summary><div class="filter-extra"><label>Base strategy<select id="strategy">${options(unique(data.records.map(row=>row.baseStrategy)),state.strategy,'All strategies')}</select></label><label>Status<select id="status">${options(unique(data.records.map(row=>row.status)),state.status,'All statuses')}</select></label><label>Asset type<select id="mode">${[['all','All models'],['masters','Masters'],['variants','Delivery variants'],['animated','Animated models'],['local','GLB available locally']].map(([value,text])=>`<option value="${value}" ${state.mode===value?'selected':''}>${text}</option>`).join('')}</select></label><label>Minimum quality<input id="floor" type="number" min="0" max="10" step=".25" value="${state.floor}"></label><label class="check"><input id="unscored" type="checkbox" ${state.unscored?'checked':''}>Include unscored</label></div></details>
  </section>`;
}

export function tradeoffs(data:Dataset,state:DisplayState,groups:Map<string,ResultRecord[]>){
  const presets=[['size','Quality vs size'],['density','Quality per MB'],['time','Quality vs time']];
  const preset=state.x==='bytes'&&state.y==='quality'?'size':state.x==='bytes'&&state.y==='qualityPerMB'?'density':state.x==='seconds'&&state.y==='quality'?'time':'';
  return `<section id="tradeoffs" class="panel" aria-labelledby="tradeoffs-title">
    <div class="row between"><div><div class="eyebrow">Measured tradeoffs</div><h2 id="tradeoffs-title">${esc(label(state.y))} ${state.chart==='scatter'?'vs '+label(state.x):state.chart==='bars'?'ranked':'distribution'}</h2></div><div class="segmented chart-types">${[['scatter','Scatter'],['bars','Ranked'],['distribution','Distribution']].map(([value,text])=>`<button data-chart="${value}" class="${state.chart===value?'active':''}">${text}</button>`).join('')}</div></div>
    <div class="row between"><div class="segmented chart-presets">${presets.map(([value,text])=>`<button data-preset="${value}" class="${preset===value?'active':''}">${text}</button>`).join('')}</div><span class="subtle">Select a point to inspect that model</span></div>
    <div class="graph-selection"><strong>Quality leaders require one compatible review scope</strong><span class="subtle">Top 15 score estimates + top 15 per MB are available only within that scope.</span><label>Graph selection<select id="graph-ranking"><option value="leaders" ${state.ranking!=='all'?'selected':''}>Within-scope top 15 + top 15 per MB</option><option value="all" ${state.ranking==='all'?'selected':''}>All distinct assets · unranked overview</option></select></label></div>
    <label class="plot-group">Plot comparison scope<select id="group"><option value="" ${!state.group?'selected':''}>All visible assets · unranked across reviews</option>${[...groups].map(([key,rows])=>`<option value="${esc(key)}" ${key===state.group?'selected':''}>Comparable detail · ${esc(key)} (${rows.length})</option>`).join('')}</select></label><p class="subtle">This scope controls only the plot. The asset table keeps every matching bucket. Mixed rubrics or review contexts have no numerical quality ranking, pooled frontier, deltas or averages. Powerhouse model estimates are unvalidated; MATERIAL ONLY reviews do not rate complete assets. Select one scope for compatible detail.</p>
    <div id="plot" class="plot"></div><p id="chart-note" class="chartfooter"></p>
    <div id="graph-selections"></div>
    <details id="chart-settings"><summary>Chart settings</summary><div class="axes"><label>X metric<select id="x-metric">${metricOptions(data,state.x)}</select></label><label>Y metric<select id="y-metric">${metricOptions(data,state.y)}</select></label><label class="check"><input id="logx" type="checkbox" ${state.logX?'checked':''}>Log X</label></div><p class="scope">${esc(state.group||'Unranked overview; select one review scope for numerical quality comparisons.')}</p><p class="subtle">A dash means missing evidence. A human ceiling is an upper bound, never an exact score or plot point. Current observations take precedence for an exact GLB SHA; distinct binaries remain separate. Compatible detail requires matching cohort, units, rubric, review context and timing boundaries. Reviewer ranges show model disagreement, not confidence intervals or accepted quality.</p></details>
  </section>`;
}

export function sources(data:Dataset){
  return `<section class="panel section source-panel"><details id="source-details"><summary>Data sources and import diagnostics (${data.sources.length})${data.issues.length?` · ${data.issues.length} issues`:''}</summary><p class="subtle">Retained reports stay unchanged. Add experiments/**/experiment.json to include new observations and numeric metrics.</p>${data.issues.length?`<div class="errorbox">${esc(data.issues.map(issue=>issue.source+': '+issue.message).join('\n'))}</div>`:''}<div class="sourcegrid">${data.sources.map(source=>`<div class="sourcecard"><a href="${esc(sourceURL(source.path))}" target="_blank">${esc(source.name)}</a><br><small>${source.records} observations · ${esc(source.path)}</small></div>`).join('')}</div><details><summary>Metric units, scope and coverage</summary><pre>${esc(JSON.stringify(data.metricCatalog,null,2))}</pre></details></details></section>`;
}
