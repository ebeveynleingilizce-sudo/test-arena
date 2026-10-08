# OpenMoji 17.0.0 — local vendor source

Stable release: https://github.com/hfg-gmuend/openmoji/releases/tag/17.0.0

- Color SVG archive: https://github.com/hfg-gmuend/openmoji/releases/download/17.0.0/openmoji-svg-color.zip
- Metadata: https://raw.githubusercontent.com/hfg-gmuend/openmoji/17.0.0/data/openmoji.json
- License: https://raw.githubusercontent.com/hfg-gmuend/openmoji/17.0.0/LICENSE.txt

`color/` contains the 4,495 original release SVGs. It is outside `public/` and is not distributed by the app build. Only the six ready entries in `src/assets/openmoji-registry.json` are copied into `public/assets/openmoji/selected/` by:

```powershell
node scripts/copy-openmoji-selected.mjs
```

## School Life selection

| Concept | Annotation | Codepoint / SVG | Decision |
| --- | --- | --- | --- |
| school | school | 1F3EB / 1F3EB.svg | Ready: school building |
| teacher | teacher | 1F9D1-200D-1F3EB / 1F9D1-200D-1F3EB.svg | Ready: neutral teacher at board |
| pupil/student | student | 1F9D1-200D-1F393 / 1F9D1-200D-1F393.svg | REVIEW: graduation cap/gown; not selected for grade 2 pupil |
| headmaster/principal | — | — | Missing |
| classroom | — | — | Missing |
| library | — | — | Missing; books are not a library scene |
| garden | — | — | Missing; house with garden is not a standalone garden |
| book | open book | 1F4D6 / 1F4D6.svg | Ready |
| pencil | pencil | 270F / 270F.svg | Ready |
| schoolbag | backpack | 1F392 / 1F392.svg | Ready |
| desk | — | — | Missing; desktop computer is not a desk |
| chair | chair | 1FA91 / 1FA91.svg | Ready |

`resolveOpenMojiAsset(visualId)` resolves only ready semantic IDs. Missing, review, unknown IDs and file paths return null. A future renderer may use the resolved `file` as an image source with a contextual accessible description. It must not accept AI-provided paths or raw SVG. Full metadata is a build/copy input, not a client import.

This library is not connected to Question Engine, current school renderers or asset/answer validation whitelists. A ready library entry does not automatically authorize a generation capability or curriculum mapping.

## Shared registry extension

The existing JSON registry is now shared by OpenMoji and `custom-education`. `src/assets/visual-assets.mjs` is the source-neutral resolver; `AssetVisual.tsx` is the shared opt-in image renderer. The OpenMoji-specific module is retained as a filtered compatibility API, and its copy script continues to select only OpenMoji files.

Classroom, library, garden, headmaster/principal and pupil/student are planned custom entries (`missing`, `file: null`). Their five `plannedFile` paths are not active image URLs. No custom SVGs exist yet; no current questions or renderers have been migrated.

All emojis designed by OpenMoji – the open-source emoji and icon project. License: CC BY-SA 4.0
