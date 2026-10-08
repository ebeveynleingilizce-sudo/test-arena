import entries from './openmoji-registry.json' with { type: 'json' };

// One registry for both sources; the legacy JSON filename is retained for compatibility.
export const visualAssetRegistry = Object.freeze(Object.fromEntries(
  Object.entries(entries).map(([id, entry]) => [id, Object.freeze(entry)])
));

export function isReadyVisualAsset(entry) {
  if (!entry || entry.status !== 'ready' || typeof entry.file !== 'string') return false;
  if (entry.source === 'openmoji') {
    return typeof entry.hexcode === 'string' && /^[A-F0-9]+(?:-[A-F0-9]+)*$/.test(entry.hexcode) &&
      entry.file === `/assets/openmoji/selected/${entry.hexcode}.svg`;
  }
  return entry.source === 'custom-education' && /^\/assets\/education\/school\/[a-z][a-z0-9-]*\.svg$/.test(entry.file);
}

export function resolveVisualAsset(visualId) {
  if (typeof visualId !== 'string' || !Object.hasOwn(visualAssetRegistry, visualId)) return null;
  const entry = visualAssetRegistry[visualId];
  return isReadyVisualAsset(entry) ? entry : null;
}
