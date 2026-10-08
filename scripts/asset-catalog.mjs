// Offline tooling only. Metadata and catalog proposals never enter Question Engine.
const normalize = value => String(value ?? '').toLowerCase().trim();
const words = value => normalize(value).split(/[^a-z0-9]+/).filter(Boolean);
const semanticId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const relationshipConcepts = new Set(['mother','father','sister','brother','grandmother','grandfather','parent','sibling','aunt','uncle','cousin','niece','nephew','wife','husband']);
export function buildAssetCatalog(metadata, concepts, registry = {}) {
  const seen = new Set();
  const usable = metadata.filter(row => row.subgroups !== 'brand' && !row.skintone && /^[A-F0-9]+(?:-[A-F0-9]+)*$/.test(row.hexcode));
  const entries = concepts.map(spec => {
    if (typeof spec === 'string') spec = { visualId: spec };
    const { visualId } = spec;
    if (!semanticId.test(visualId) || seen.has(visualId)) throw new Error('Invalid or duplicate semantic visualId');
    seen.add(visualId);
    const terms = [visualId.replaceAll('-', ' '), ...(spec.searchTerms ?? [])].map(normalize);
    const preferred = normalize(spec.preferredAnnotation ?? '');
    const candidates = usable.map(row => {
      const annotation = normalize(row.annotation);
      const tags = words(`${row.tags} ${row.openmoji_tags}`);
      let score = 0, match = '';
      for (const term of terms) {
        if (annotation === term && score < 100) { score = 100; match = 'annotation-exact'; }
        else if (words(term).every(word => words(annotation).includes(word)) && score < 60) { score = 60; match = 'annotation-words'; }
        else if (words(term).every(word => tags.includes(word)) && score < 30) { score = 30; match = 'metadata-tags'; }
      }
      if (preferred && annotation === preferred) { score = 110; match = 'explicit-search-hint'; }
      if (Object.hasOwn(registry, visualId) && registry[visualId].source === 'openmoji' && registry[visualId].hexcode === row.hexcode) {
        score = 120; match = 'existing-approved-registry';
      }
      return { annotation:row.annotation, hexcode:row.hexcode, sourceFile:`${row.hexcode}.svg`, match, score };
    }).filter(row => row.score > 0).sort((a,b) => b.score-a.score || a.annotation.length-b.annotation.length || a.hexcode.localeCompare(b.hexcode)).slice(0,8);
    const existing = Object.hasOwn(registry, visualId) ? registry[visualId] : null;
    const requiresContext = spec.kind === 'relationship' || relationshipConcepts.has(visualId);
    const top = candidates[0];
    const direct = top && !requiresContext && (top.match === 'annotation-exact' || top.match === 'existing-approved-registry' || (top.match === 'explicit-search-hint' && spec.directMatch === true));
    const custom = existing?.source === 'custom-education';
    const status = custom ? existing.status : !top ? 'missing' : direct ? 'ready' : 'review';
    return { visualId, concept:visualId, source:custom ? 'custom-education' : 'openmoji', status,
      approved: !!existing && existing.status === 'ready', requiresContext,
      reason: custom ? 'Existing custom fallback retained' : requiresContext ? 'Relationship requires context; person appearance cannot establish kinship' : !top ? 'No metadata candidate' : direct ? 'Direct proposal; human approval required before registry/copy' : 'Semantic or visual suitability requires human review',
      candidates };
  });
  return { release:'17.0.0', purpose:'human-review-catalog', entries,
    summary:{ total:entries.length, ready:entries.filter(e=>e.status==='ready').length, review:entries.filter(e=>e.status==='review').length, missing:entries.filter(e=>e.status==='missing').length } };
}

export function approveCatalogAsset(registry, catalog, { visualId, hexcode, reviewedBy, note }) {
  if (!semanticId.test(visualId) || !reviewedBy?.trim() || !note?.trim()) throw new Error('Explicit reviewer and review note required');
  const proposal = catalog.entries.find(entry => entry.visualId === visualId);
  const candidate = proposal?.candidates.find(entry => entry.hexcode === hexcode);
  if (!candidate || proposal.source !== 'openmoji' || proposal.status === 'missing') throw new Error('No eligible OpenMoji candidate');
  if (Object.hasOwn(registry, visualId)) {
    if (registry[visualId].source === 'openmoji' && registry[visualId].status === 'ready' && registry[visualId].hexcode === hexcode) return registry;
    throw new Error('Existing registry entry cannot be overwritten by catalog approval');
  }
  return { ...registry, [visualId]:{ source:'openmoji', concept:visualId, status:'ready', annotation:candidate.annotation,
    hexcode, file:`/assets/openmoji/selected/${hexcode}.svg`, approval:{ reviewedBy:reviewedBy.trim(), note:note.trim(), requiresContext:proposal.requiresContext } } };
}
