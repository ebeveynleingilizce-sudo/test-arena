# Curriculum asset catalog (offline, human reviewed)

Generate proposals from OpenMoji 17 metadata:

```powershell
node scripts/asset-catalog-cli.mjs
node scripts/asset-catalog-cli.mjs --concepts data/asset-catalog/my-concepts.json --out data/asset-catalog/my-catalog.json
```

Concept input accepts semantic ID strings, or `{visualId, searchTerms?, preferredAnnotation?, directMatch?, kind?}`. Exact annotation, complete annotation words and metadata tags are searched; brand logos and skin-tone variants are excluded. Search hints are not new OpenMoji meanings. Ambiguous tag matches are REVIEW. Use `kind: "relationship"` for kinship concepts: person appearance never proves a family relationship. `directMatch: true` on a preferred annotation is a human-authored semantic search hint, not publication approval.

Catalog statuses are proposal suitability (`ready/review/missing`), independent of `approved`. A READY proposal with `approved:false` is not production-ready and is not copied. REVIEW needs contextual and visual review. MISSING needs a better search or the existing custom-education workflow. Source/version, match evidence and candidate annotation/codepoint/file are tooling data only; Question Engine uses only semantic IDs.

Human process:

1. Add semantic concepts to an input JSON and generate catalog proposals. One concept is shared across subjects; no subject-specific directories or duplicated copies.
2. Inspect candidate SVG in vendor plus metadata and pedagogical context. Do not approve sibling/parent roles solely from a girl/boy/woman/man image. Prefer existing registry entries before creating new IDs.
3. Only after human approval, run, for example:

```powershell
node scripts/asset-catalog-cli.mjs --approve apple --hexcode 1F34E --reviewed-by "reviewer-name" --note "Reviewed red apple SVG as fruit, not brand logo"
node scripts/copy-openmoji-selected.mjs
```

4. Approval records the decision in the single existing registry. It never overwrites existing ready/custom entries. The copy script reads only that registry, validates metadata/SVG safety, deduplicates by SVG filename, and copies only selected files. Catalog creation alone never changes the registry or public assets. Approval and copying are separate explicit steps.
5. Regenerate catalog to see approved status. Asset approval does not alter Question Engine family/asset whitelists or automatically authorize a quiz concept.

Custom-education entries and the shared renderer/resolver remain unchanged. No new custom SVGs are generated here. The 20 example concepts are a tooling evaluation set, not new question content.
