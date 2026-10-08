export interface OpenMojiAsset {
  readonly source: 'openmoji';
  readonly concept: string;
  readonly status: 'ready' | 'review' | 'missing';
  readonly annotation?: string;
  readonly hexcode?: string;
  readonly file: string | null;
  readonly note?: string;
}
export const openmojiRegistry: Readonly<Record<string, OpenMojiAsset>>;
export function resolveOpenMojiAsset(visualId: unknown): (OpenMojiAsset & { readonly file: string }) | null;
