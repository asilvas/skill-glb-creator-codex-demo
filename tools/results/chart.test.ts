import {test,expect} from 'bun:test';
import {renderTradeoffPlot,type PlotState} from './chart';
import {comparisonKey} from './model';
import {disjointLeaders,graphRow} from './graph-fixtures';
const state:PlotState={x:'bytes',y:'quality',chart:'scatter',logX:false,group:'',active:'',ranking:'leaders'};
test('scatter and ranked modes draw the complete30asset union, never truncate one arm to20',()=>{
  const rows=disjointLeaders();for(const chart of ['scatter','bars']){const r=renderTradeoffPlot(rows,{...state,chart});expect(r.selectedIds).toHaveLength(30);expect(r.plottedIds).toHaveLength(30);expect((r.html.match(/data-select=/g)??[])).toHaveLength(30);expect(r.html).toContain('data-select="big-14"');expect(r.html).toContain('data-select="small-14"');expect(r.rankedHTML).toContain('Quality #15');expect(r.rankedHTML).toContain('Per MB #15');}
  const density=renderTradeoffPlot(rows,{...state,chart:'bars',y:'qualityPerMB'});expect(density.plottedIds).toHaveLength(30);expect(density.html).toContain('data-select="big-14"');
});
test('mixed-review overview has no quality ranking or plotted comparison; one scope remains usable',()=>{
  const a=graphRow('small',7,100,'Bucket A','reviews/round-1/quality.json'),b=graphRow('large',9,1e9,'Bucket B','reviews/round-2/quality.json'),r=renderTradeoffPlot([a,b],state);
  expect(r.frontierIds).toHaveLength(0);expect(r.note).toContain('no numerical ranking');expect(r.plottedIds).toHaveLength(0);expect(r.rankedHTML).toBe('');expect(r.html).toContain('Choose one compatible comparison scope');expect(r.selectedIds).toHaveLength(2);
  const scoped=renderTradeoffPlot([a],{...state,group:comparisonKey(a,'bytes','quality')!});expect(scoped.frontierIds).toEqual(['small']);expect(scoped.note).toContain('within this compatible scope');
});
test('all-assets mode and a forged group cannot bypass the mixed-quality guard or plot an upper bound as an exact point',()=>{
  const a=graphRow('a'),b=graphRow('b',9,100,'Bucket A','different-review');
  for(const options of[{ranking:'all' as const},{group:'forged-group'}]){const r=renderTradeoffPlot([a,b],{...state,...options});expect(r.plottedIds).toHaveLength(0);expect(r.rankedHTML).toBe('');}
  a.metrics.humanQualityCeiling={value:7,unit:'points/10',scope:'rubric',bound:'upper'};expect(renderTradeoffPlot([a],{...state,y:'humanQualityCeiling',ranking:'all'}).plottedIds).toHaveLength(0);
});
test('quality leaders missing size stay listed without invented scatter coordinates and render in quality bars',()=>{
  const missing=graphRow('No GLB size',10,null),known=graphRow('Known',7,100),r=renderTradeoffPlot([known,missing],state);expect(r.selectedIds).toContain('No GLB size');expect(r.plottedIds).toEqual(['Known']);expect(r.html).not.toContain('data-select="No GLB size"');expect(r.rankedHTML).toContain('not plotted: chosen axis value missing or invalid');expect(r.rankedHTML).toContain('Quality #1');expect(r.note).toContain('1 selected assets have missing axis');
  expect(renderTradeoffPlot([known,missing],{...state,chart:'bars'}).plottedIds).toHaveLength(2);
});
test('distribution/mixed units require explicit compatible detail and never advertise suppressed points as plotted',()=>{
  const a=graphRow('A'),b=graphRow('B');const distribution=renderTradeoffPlot([a,b],{...state,chart:'distribution'});expect(distribution.html).toContain('Choose one compatible comparison scope');expect(distribution.plottedIds).toHaveLength(0);expect(distribution.note).toContain('0 plotted');
  b.metrics.bytes.unit='KiB';const units=renderTradeoffPlot([a,b],state);expect(units.html).toContain('different units');expect(units.plottedIds).toHaveLength(0);expect(units.note).toContain('0 plotted');
});
test('all-distinct option supports unscored custom axes; ranking labels and contexts escape hostile text',()=>{
  const unscored=graphRow('unscored',null,500),all=renderTradeoffPlot([unscored],{...state,y:'bytes',chart:'bars',ranking:'all'});expect(all.plottedIds).toEqual(['unscored']);expect(all.note).toContain('All distinct graph assets');
  const unsafe=graphRow('<script>name</script>',9,100,'<img onerror=x>','review<unsafe>');const r=renderTradeoffPlot([unsafe],state);expect(r.html).not.toContain('<script>');expect(r.rankedHTML).not.toContain('<img onerror');expect(r.rankedHTML).toContain('&lt;script&gt;name&lt;/script&gt;');expect(r.rankedHTML).toContain('&lt;img onerror=x&gt;');
});
