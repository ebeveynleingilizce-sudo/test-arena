# Planned custom education SVG assets

No custom SVGs have been authored or copied yet. Five illustrations are needed:

- classroom.svg
- library.svg
- garden.svg
- headmaster.svg (also principal)
- pupil.svg (also student)

Entries remain `source: custom-education`, `status: missing`, `file: null` in the central `src/assets/openmoji-registry.json`. `plannedFile` is documentation only and is never rendered. Once an approved SVG exists, its entry can be explicitly changed to `ready` with its actual local `file` path. Do not mark absent files ready.

Both sources use `resolveVisualAsset` and the opt-in `AssetVisual` component. IDs do not change. Missing/unknown IDs have no guessed substitute. Existing SchoolVisual drawings, Question Engine whitelists, answer binding and published questions remain unchanged.
