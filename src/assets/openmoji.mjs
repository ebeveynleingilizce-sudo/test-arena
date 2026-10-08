import { visualAssetRegistry, resolveVisualAsset } from './visual-assets.mjs';

// Semantic IDs only. No path construction, fallback asset or user-provided SVG.
export const openmojiRegistry = Object.freeze(Object.fromEntries(
  Object.entries(visualAssetRegistry).filter(([, entry]) => entry.source === 'openmoji')
));

export function resolveOpenMojiAsset(visualId) {
  const entry = resolveVisualAsset(visualId);
  return entry?.source === 'openmoji' ? entry : null;
}
