import { resolveVisualAsset } from '../assets/visual-assets.mjs';

// Opt-in library renderer. Existing quiz renderers are not switched to this component.
// The caller supplies a contextual accessible description, never an image URL.
export function AssetVisual({ visualId, alt }: { visualId: string; alt: string }) {
  const asset = resolveVisualAsset(visualId);
  if (!asset || !alt.trim()) return null;
  return <img src={(import.meta.env?.BASE_URL || '/') + asset.file.replace(/^\//,'')} alt={alt} data-visual-id={visualId} data-asset-source={asset.source}
    width={144} height={144} style={{ display: 'block', maxWidth: '100%', height: 'auto', objectFit: 'contain' }} />;
}
