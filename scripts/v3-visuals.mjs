import { parseVisual, compositionAssets } from '../functions/visuals/contract.mjs';
const aliases = {
  'solid-construction': ['cube-cylinder-house'],
  'object-row': ['ball-dice-can','clock-door-sign'],
  'marked-solid': ['cube-face','cube-vertex'],
  'shape-pair': ['square-triangle'],
  'liquid-comparison': ['same-water-different-capacity','bucket-low-glass-full']
};
// Author aliases map only to explicitly supported presets, never arbitrary asset paths.
export function normalizeV3Visual(v) {
  if (v && Object.hasOwn(aliases,v.kind)) {
    if (Object.keys(v).some(k=>!['kind','asset','alt'].includes(k)) || !aliases[v.kind].includes(v.asset) || !compositionAssets.includes(v.asset)) throw new Error('Unsupported V3 preset');
    return parseVisual({kind:'composition',asset:v.asset,alt:v.alt});
  }
  return parseVisual(v);
}
