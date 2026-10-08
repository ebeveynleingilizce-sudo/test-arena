export type GeometryShape = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'rectangular-prism' | 'triangle' | 'square' | 'rectangle' | 'circle';
export type ObjectType = 'pencil' | 'eraser' | 'apple' | 'hazelnut' | 'ball' | 'flower' | 'star' | 'candy' | 'strawberry' | 'book' | 'marble' | 'cube' | 'battery' | 'box' | 'pot' | 'dot';
type Base = {
    alt: string;
};
export type GeometryVisual = Base & {
    kind: 'geometry';
    shape: GeometryShape;
};
export type ObjectAssetId = 'battery'|'ball'|'can'|'party-hat'|'dice'|'orange'|'shoe-box'|'paper-roll'|'ice-cream-cone'|'book'|'door'|'wall-clock'|'square-tile'|'plate'|'coin'|'triangular-sign';
export type CompositionAssetId = 'cube-cylinder-house'|'ball-dice-can'|'clock-door-sign'|'cube-face'|'cube-vertex'|'square-triangle'|'same-water-different-capacity'|'bucket-low-glass-full';
export type SchoolVisualDescriptor = Base & ({kind:'school-place';asset:'classroom'|'library'|'garden'} | {kind:'school-person';asset:'teacher'|'pupil'|'headmaster'} | {kind:'school-dialogue';asset:'two-pupils';speech:string});
export type QuestionVisual = GeometryVisual | SchoolVisualDescriptor | Base & {kind:'image';src:string} | Base & {kind:'object';asset:ObjectAssetId} | Base & {kind:'composition';asset:CompositionAssetId} | Base & {
    kind: 'objects';
    objectType: ObjectType;
    count: number;
    layout: 'grid' | 'rows' | 'scattered';
    groupSize?: number;
} | Base & {
    kind: 'base-ten';
    tens: number;
    ones: number;
} | Base & {
    kind: 'math-cards';
    mode: 'tokens' | 'equations';
    items: {
        value: number | string | null;
        shape: 'chip' | 'circle' | 'box' | 'triangle' | 'star';
    }[];
} | Base & {
    kind: 'vertical';
    operator: '+' | '−';
    top: number;
    bottom: number;
    result: number | null;
} | Base & {
    kind: 'sequence';
    mode: 'numbers' | 'shapes';
    items: (number | GeometryShape | null)[];
} | Base & {
    kind: 'paths';
    rows: {
        label: string;
        values: (number | null)[];
    }[];
} | Base & {
    kind: 'character';
    avatar: 'ada' | 'deniz' | 'efe';
    name: string;
    value?: number;
    unit?: 'kg' | 'cm' | 'TL' | 'kuruş' | 'L' | 'mL' | 'adet';
    speech?: string;
} | Base & {
    kind: 'groups';
    objectType: ObjectType;
    totalObjects: number;
    groupCount?: number;
    objectsPerGroup?: number;
    arrangement: 'plates' | 'array' | 'pots';
} | Base & {
    kind: 'geometry-layout';
    items: {
        shape: GeometryShape;
        column: number;
        row: number;
        size: 'large' | 'small';
        rotation: 0 | 90 | 180 | 270;
        mark?: 'face' | 'edge' | 'vertex';
    }[];
} | Base & {
    kind: 'symmetry';
    axis: 'vertical' | 'horizontal';
    left: {
        x: number;
        y: number;
    }[];
    right: {
        x: number;
        y: number;
    }[];
    showAxis: boolean;
} | Base & {
    kind: 'rotation';
    direction?: 'clockwise' | 'counterclockwise';
    quarterTurns?: number;
    startIndex: number;
    labels: (number | string)[];
} | Base & {
    kind: 'fraction';
    model: 'circle' | 'rectangle' | 'bar';
    parts: number[];
    shaded: number[];
} | Base & {
    kind: 'clock';
    hour: number;
    minute: number;
} | Base & {
    kind: 'money';
    items: {
        kurus: number;
        count: number;
    }[];
} | Base & {
    kind: 'ruler';
    maxCm: number;
    startCm: number;
    endCm: number;
    objectType: 'pencil' | 'book' | 'eraser';
    showLength: boolean;
} | Base & {
    kind: 'balance';
    left: {
        objectType: ObjectType;
        value: number;
        unit: 'kg' | 'g';
    };
    right: {
        objectType: ObjectType;
        value: number;
        unit: 'kg' | 'g';
    };
    tilt: 'level' | 'left' | 'right';
} | Base & {
    kind: 'container';
    vessel: 'glass' | 'bottle' | 'jug' | 'bucket' | 'spoon' | 'ladle' | 'cup' | 'pot';
    capacityClass: 'small' | 'medium' | 'large';
    fill: number;
    capacityMl?: number;
    amountMl?: number;
} | Base & {
    kind: 'data';
    mode: 'bar' | 'pictograph' | 'tally' | 'table';
    unitValue: number;
    rows: {
        label: string;
        value: number;
    }[];
} | Base & {
    kind: 'number-line';
    min: number;
    max: number;
    step: number;
    points: number[];
    jumps?: number;
} | Base & {
    kind: 'scene';
    preset: 'compare' | 'equation' | 'stack';
    items: QuestionVisual[];
    operators?: ('+' | '−' | '×' | '÷' | '=' | '→')[];
    stimulusId?: string;
};
export interface VisualChoice {
    choiceId: string;
    text: string;
    visual?: QuestionVisual;
}
export const geometryShapes: readonly GeometryShape[];
export const objectTypes: readonly ObjectType[];
export const objectAssets: readonly ObjectAssetId[];
export const compositionAssets: readonly CompositionAssetId[];
export const visualKinds: readonly string[];
export function parseVisual(value: unknown): QuestionVisual | undefined;
export function visualCost(value: QuestionVisual | undefined): number;
export function parsePresentation(questionText: unknown, choices: unknown, visual?: unknown, visualPlacement?: unknown, content?: unknown): {
    questionText: string;
    content?: string;
    choices: VisualChoice[];
    visual?: QuestionVisual;
    visualPlacement?: "above" | "below";
};
export function resolveStimulus(visual: unknown, stimulusId: unknown, stimuli: unknown): unknown;
