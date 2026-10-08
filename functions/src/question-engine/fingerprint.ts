import { createHash } from 'node:crypto';
import type { CandidateQuestion, Fingerprints } from './contracts.js';

export const normalizeText = (s: string) => s.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableJSON((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
// Alt is presentation/accessibility metadata; changing it must not evade duplicate checks.
export function semantics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantics);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'alt').map(([k,v]) => [k,semantics(v)]));
  return value;
}
const hash = (v: unknown) => createHash('sha256').update(stableJSON(v)).digest('hex');
export function fingerprint(candidate: CandidateQuestion): Fingerprints {
  const scope = candidate.scope, family = candidate.family, model = semantics(candidate.model);
  const options = candidate.options.map(o => ({ text:normalizeText(o.text), visual:semantics(o.visual ?? null) })).sort((a,b) => stableJSON(a).localeCompare(stableJSON(b)));
  return {
    content: hash({scope,family,model,question:normalizeText(candidate.question),options,visual:semantics(candidate.visual ?? null)}),
    structural: hash({scope,family,model,options,visual:semantics(candidate.visual ?? null)})
  };
}
// Per dry-run, in-memory only. Failed candidates never reserve fingerprints.
export class DuplicateIndex {
  private readonly values = new Set<string>();
  has(f: Fingerprints) { return this.values.has('content:' + f.content) || this.values.has('structural:' + f.structural); }
  add(f: Fingerprints) { this.values.add('content:' + f.content); this.values.add('structural:' + f.structural); }
}
