// Shared whitelist contract for import, safe server DTO and bounded mathematical presets.
import {schoolPlaces,schoolPeople,schoolVisualAlt,schoolDialogueStemValid} from './school-life.mjs';
export const geometryShapes = Object.freeze(['cube', 'sphere', 'cylinder', 'cone', 'rectangular-prism', 'triangle', 'square', 'rectangle', 'circle']);
export const objectTypes = Object.freeze(['pencil', 'eraser', 'apple', 'hazelnut', 'ball', 'flower', 'star', 'candy', 'strawberry', 'book', 'marble', 'cube', 'battery', 'box', 'pot', 'dot']);
export const objectAssets = Object.freeze(['battery','ball','can','party-hat','dice','orange','shoe-box','paper-roll','ice-cream-cone','book','door','wall-clock','square-tile','plate','coin','triangular-sign']);
export const compositionAssets = Object.freeze(['cube-cylinder-house','ball-dice-can','clock-door-sign','cube-face','cube-vertex','square-triangle','same-water-different-capacity','bucket-low-glass-full']);
const fail = () => { throw new Error('Geçersiz görsel: desteklenen tip, sınırlı parametreler ve okunabilir alt etiketi gerekli.'); };
const text = (v, max = 300) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail();
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max ? v : fail();
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail();
const en = (v, values) => values.includes(v) ? v : fail();
const list = (v, min, max, parse) => Array.isArray(v) && v.length >= min && v.length <= max ? v.map(parse) : fail();
const exact = (v, keys) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k)))
    fail(); };
const field = (fn, optional = false) => ({ fn, optional });
const I = (min, max) => field(v => int(v, min, max)), T = (max = 300) => field(v => text(v, max)), E = values => field(v => en(v, values)), A = (min, max, fn) => field(v => list(v, min, max, fn));
const optional = f => ({ ...f, optional: true });
const scalar = v => v === null ? null : int(v, 0, 999);
const shape = v => en(v, geometryShapes);
const token = v => { exact(v, ['value', 'shape']); return { value: v.value === null ? null : typeof v.value === 'number' ? int(v.value, 0, 999) : text(v.value, 32), shape: en(v.shape, ['chip', 'circle', 'box', 'triangle', 'star']) }; };
const point = v => { exact(v, ['x', 'y']); return { x: int(v.x, 0, 8), y: int(v.y, 0, 8) }; };
function fields(v, spec) { exact(v, ['kind', 'alt', ...Object.keys(spec)]); const result = { kind: v.kind, alt: text(v.alt) }; if (/^[A-F]$/i.test(result.alt))
    fail(); for (const [key, { fn, optional }] of Object.entries(spec)) {
    if (v[key] === undefined) {
        if (!optional)
            fail();
    }
    else
        result[key] = fn(v[key]);
} return result; }
const specs = {
    image: {src:field(v => typeof v==='string' && /^\/assets\/question-images\/[a-f0-9]{64}\.(png|jpg|jpeg|webp)$/.test(v) ? v : fail())},
    'school-place': {asset:E(schoolPlaces)},
    'school-person': {asset:E(schoolPeople)},
    'school-dialogue': {asset:E(['two-pupils']),speech:T(100)},
    object: { asset: E(objectAssets) },
    composition: { asset: E(compositionAssets) },
    geometry: { shape: field(shape) },
    objects: { objectType: E(objectTypes), count: I(1, 100), layout: E(['grid', 'rows', 'scattered']), groupSize: optional(I(1, 20)) },
    'base-ten': { tens: I(0, 9), ones: I(0, 9) },
    'math-cards': { mode: E(['tokens', 'equations']), items: A(1, 9, token) },
    vertical: { operator: E(['+', '−']), top: I(0, 999), bottom: I(0, 999), result: field(scalar) },
    sequence: { mode: E(['numbers', 'shapes']), items: A(2, 12, v => v === null ? null : typeof v === 'number' ? int(v, 0, 999) : shape(v)) },
    paths: { rows: A(1, 3, v => { exact(v, ['label', 'values']); return { label: text(v.label, 12), values: list(v.values, 2, 8, scalar) }; }) },
    character: { avatar: E(['ada', 'deniz', 'efe']), name: T(40), value: optional(field(v => num(v, 0, 999))), unit: optional(E(['kg', 'cm', 'TL', 'kuruş', 'L', 'mL', 'adet'])), speech: optional(T(700)) },
    groups: { objectType: E(objectTypes), totalObjects: I(1, 100), groupCount: optional(I(1, 12)), objectsPerGroup: optional(I(1, 20)), arrangement: E(['plates', 'array', 'pots']) },
    'geometry-layout': { items: A(1, 12, v => { exact(v, ['shape', 'column', 'row', 'size', 'rotation', 'mark']); const r = { shape: shape(v.shape), column: int(v.column, 0, 3), row: int(v.row, 0, 3), size: en(v.size, ['large', 'small']), rotation: en(v.rotation, [0, 90, 180, 270]) }; if (v.mark !== undefined) {
            r.mark = en(v.mark, ['face', 'edge', 'vertex']);
            if (['sphere', 'circle'].includes(r.shape) && r.mark !== 'face' || r.shape === 'cylinder' && r.mark === 'vertex')
                fail();
        } return r; }) },
    symmetry: { axis: E(['vertical', 'horizontal']), left: A(1, 20, point), right: A(0, 20, point), showAxis: field(v => typeof v === 'boolean' ? v : fail()) },
    rotation: { direction: optional(E(['clockwise', 'counterclockwise'])), quarterTurns: optional(I(1, 2)), startIndex: I(0, 7), labels: A(4, 8, v => typeof v === 'number' ? int(v, 0, 99) : text(v, 12)) },
    fraction: { model: E(['circle', 'rectangle', 'bar']), parts: A(2, 8, v => int(v, 1, 8)), shaded: A(0, 8, v => int(v, 0, 7)) },
    clock: { hour: I(0, 23), minute: I(0, 59) },
    money: { items: A(1, 12, v => { exact(v, ['kurus', 'count']); return { kurus: en(v.kurus, [1, 5, 10, 25, 50, 100, 500, 1000, 2000, 5000, 10000, 20000]), count: int(v.count, 1, 10) }; }) },
    ruler: { maxCm: I(1, 12), startCm: I(0, 12), endCm: I(0, 12), objectType: E(['pencil', 'book', 'eraser']), showLength: field(v => typeof v === 'boolean' ? v : fail()) },
    balance: { left: { fn: v => { exact(v, ['objectType', 'value', 'unit']); return { objectType: en(v.objectType, objectTypes), value: num(v.value, 0, 100), unit: en(v.unit, ['kg', 'g']) }; } }, right: { fn: v => { exact(v, ['objectType', 'value', 'unit']); return { objectType: en(v.objectType, objectTypes), value: num(v.value, 0, 100), unit: en(v.unit, ['kg', 'g']) }; } }, tilt: E(['level', 'left', 'right']) },
    container: { vessel: E(['glass', 'bottle', 'jug', 'bucket', 'spoon', 'ladle', 'cup', 'pot']), capacityClass: E(['small', 'medium', 'large']), fill: field(v => num(v, 0, 1)), capacityMl: optional(I(1, 10000)), amountMl: optional(I(0, 10000)) },
    data: { mode: E(['bar', 'pictograph', 'tally', 'table']), unitValue: I(1, 5), rows: A(1, 5, v => { exact(v, ['label', 'value']); return { label: text(v.label, 35), value: int(v.value, 0, 20) }; }) },
    'number-line': { min: I(0, 100), max: I(1, 100), step: I(1, 10), points: A(0, 10, v => int(v, 0, 100)), jumps: optional(I(1, 10)) }
};
export const visualKinds = Object.freeze([...Object.keys(specs), 'scene']);
export function parseVisual(value, depth = 0) {
    if (value === undefined)
        return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        fail();
    let r;
    if (value.kind === 'scene') {
        if (depth !== 0)
            fail();
        exact(value, ['kind', 'alt', 'preset', 'items', 'operators', 'stimulusId']);
        r = { kind: 'scene', alt: text(value.alt), preset: en(value.preset, ['compare', 'equation', 'stack']), items: list(value.items, 1, 6, v => parseVisual(v, 1)) };
        if (r.items.some(v => !v))
            fail();
        if (value.operators !== undefined)
            r.operators = list(value.operators, 0, 5, v => en(v, ['+', '−', '×', '÷', '=', '→']));
        if (r.preset === 'equation' && r.operators?.length !== r.items.length - 1)
            fail();
        if (r.preset !== 'equation' && r.operators !== undefined)
            fail();
        if (value.stimulusId !== undefined) {
            if (typeof value.stimulusId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.stimulusId))
                fail();
            r.stimulusId = value.stimulusId;
        }
    }
    else {
        const spec = Object.hasOwn(specs, value.kind) ? specs[value.kind] : undefined;
        if (!spec)
            fail();
        r = fields(value, spec);
    }
    if (['school-place','school-person','school-dialogue'].includes(r.kind) &&
        (r.alt !== schoolVisualAlt[r.asset] || r.kind==='school-dialogue' && !schoolDialogueStemValid(r.speech))) fail();
    if (r.kind === 'sequence' && r.items.some(v => v !== null && (r.mode === 'numbers' ? typeof v !== 'number' : typeof v !== 'string')))
        fail();
    if (r.kind === 'character' && ((r.value === undefined) !== (r.unit === undefined) || r.value === undefined && !r.speech))
        fail();
    if (r.kind === 'groups') {
        if ((r.groupCount === undefined) === (r.objectsPerGroup === undefined))
            fail();
        const n = r.groupCount ?? r.totalObjects / r.objectsPerGroup;
        if (!Number.isInteger(n) || n < 1 || n > 12 || r.totalObjects % n !== 0 || r.totalObjects / n > 20)
            fail();
    }
    if (r.kind === 'rotation' && ((r.direction === undefined) !== (r.quarterTurns === undefined)))
        fail();
    if (r.kind === 'rotation' && (r.labels.length !== 4 && r.labels.length !== 8 || r.startIndex >= r.labels.length))
        fail();
    if (r.kind === 'fraction' && (new Set(r.shaded).size !== r.shaded.length || r.shaded.some(v => v >= r.parts.length)))
        fail();
    if (r.kind === 'money' && r.items.reduce((n, v) => n + v.count, 0) > 24)
        fail();
    if (r.kind === 'ruler' && (r.startCm >= r.endCm || r.endCm > r.maxCm))
        fail();
    if (r.kind === 'balance') {
        const left = r.left.value * (r.left.unit === 'kg' ? 1000 : 1), right = r.right.value * (r.right.unit === 'kg' ? 1000 : 1);
        if (r.tilt !== (left === right ? 'level' : left > right ? 'left' : 'right'))
            fail();
    }
    if (r.kind === 'container' && ((r.capacityMl === undefined) !== (r.amountMl === undefined) || r.amountMl > r.capacityMl || r.capacityMl !== undefined && Math.abs(r.fill - r.amountMl / r.capacityMl) > 0.001))
        fail();
    if (r.kind === 'data' && r.mode === 'pictograph' && r.rows.some(v => v.value % r.unitValue))
        fail();
    if (r.kind === 'number-line' && (r.min >= r.max || (r.max - r.min) % r.step || (r.max - r.min) / r.step > 10 || r.jumps !== undefined && r.jumps > (r.max-r.min)/r.step || r.points.some(v => v !== null && (v < r.min || v > r.max || (v - r.min) % r.step))))
        fail();
    if (visualCost(r) > 180)
        fail();
    return r;
}
export function visualCost(v) { if (!v)
    return 0; if (v.kind === 'scene')
    return v.items.reduce((n, c) => n + visualCost(c), 0); return v.kind === 'objects' ? v.count : v.kind === 'groups' ? v.totalObjects : v.kind === 'base-ten' ? v.tens * 10 + v.ones : v.kind === 'data' ? v.rows.reduce((n, r) => n + r.value, 0) : v.kind === 'money' ? v.items.reduce((n, i) => n + i.count, 0) : 10; }
export function parsePresentation(questionText, choices, visual, visualPlacement, content) {
    if (content !== undefined && (typeof content !== 'string' || !content.trim() || content.length > 10000))
        throw new Error('Geçersiz soru içeriği: 1–10000 karakterlik metin gerekli.');
    if (typeof questionText !== 'string' || !questionText.trim() || questionText.length > 10000 || !Array.isArray(choices) || choices.length < 2 || choices.length > 6)
        throw new Error('Geçersiz soru sunumu.');
    const questionVisual = parseVisual(visual), ids = new Set();
    const safeChoices = choices.map(c => {
        if (!c || typeof c.choiceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(c.choiceId) || ids.has(c.choiceId) || typeof c.text !== 'string' || c.text.length > 4000)
            throw new Error('Geçersiz seçenek.');
        ids.add(c.choiceId);
        const choiceVisual = parseVisual(c.visual);
        if (!c.text.trim() && !choiceVisual)
            throw new Error('Seçenek metin veya görsel içermeli.');
        return { choiceId: c.choiceId, text: c.text, ...(choiceVisual ? { visual: choiceVisual } : {}) };
    });
    if (visualCost(questionVisual) + safeChoices.reduce((n, c) => n + visualCost(c.visual), 0) > 600)
        fail();
    if (visualPlacement !== undefined && (!questionVisual || !['above', 'below'].includes(visualPlacement)))
        fail();
    return { questionText, choices: safeChoices, ...(content !== undefined ? { content } : {}), ...(questionVisual ? { visual: questionVisual } : {}), ...(visualPlacement ? { visualPlacement } : {}) };
}
// Resolve author-side shared stimuli into independent immutable question snapshots.
export function resolveStimulus(visual, stimulusId, stimuli) {
    if (stimuli !== undefined) {
        if (!stimuli || typeof stimuli !== 'object' || Array.isArray(stimuli) || Object.keys(stimuli).length > 30)
            fail();
        for (const [id, v] of Object.entries(stimuli)) {
            if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
                fail();
            parseVisual(v);
        }
    }
    if (stimulusId === undefined)
        return visual;
    if (visual !== undefined || typeof stimulusId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(stimulusId) || !stimuli || !Object.hasOwn(stimuli, stimulusId))
        fail();
    const shared = parseVisual(stimuli[stimulusId]);
    return parseVisual(shared.kind === 'scene' ? { ...shared, stimulusId } : { kind: 'scene', preset: 'stack', items: [shared], alt: shared.alt, stimulusId });
}
