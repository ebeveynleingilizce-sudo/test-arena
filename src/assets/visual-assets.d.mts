export interface VisualAsset {
  readonly source: 'openmoji' | 'custom-education';
  readonly concept: string;
  readonly status: 'ready' | 'review' | 'missing';
  readonly annotation?: string;
  readonly hexcode?: string;
  readonly file: string | null;
  readonly plannedFile?: string;
  readonly note?: string;
}
export type ReadyVisualAsset = VisualAsset & { readonly status: 'ready'; readonly file: string };
export const visualAssetRegistry: Readonly<Record<string, VisualAsset>>;
export function isReadyVisualAsset(entry: unknown): entry is ReadyVisualAsset;
export function resolveVisualAsset(visualId: unknown): ReadyVisualAsset | null;
