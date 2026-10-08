import type { ReactNode } from 'react';
import type { GeometryShape, GeometryVisual } from '../../functions/visuals/contract.mjs';
// New visual kinds should get their own validated renderer; content cannot supply markup.
export function GeometryGraphic({ visual, mark }: {
    visual: GeometryVisual;
    mark?: "face" | "edge" | "vertex";
}) {
    const shapes: Record<GeometryShape, ReactNode> = {
        cube: <><path d="M30 42 65 22 99 42 99 82 65 102 30 82Z"/><path d="M30 42 65 62 99 42M65 62V102" fill="none"/></>,
        sphere: <><circle cx="64" cy="64" r="40"/><path d="M64 24C30 44 30 84 64 104M64 24C98 44 98 84 64 104M24 64C40 82 88 82 104 64" fill="none"/></>,
        cylinder: <><path d="M28 34V94C28 109 100 109 100 94V34"/><ellipse cx="64" cy="34" rx="36" ry="13"/><path d="M28 94C28 81 100 81 100 94" fill="none" strokeDasharray="4 4"/></>,
        cone: <><path d="M26 98 64 23 102 98C102 116 26 116 26 98Z"/><ellipse cx="64" cy="98" rx="38" ry="12"/></>,
        'rectangular-prism': <><path d="M18 48 49 30 111 45 111 81 80 99 18 84Z"/><path d="M18 48 80 63 111 45M80 63V99" fill="none"/></>,
        triangle: <path d="M64 22 108 102H20Z"/>,
        square: <rect x="26" y="26" width="76" height="76" rx="1"/>,
        rectangle: <rect x="14" y="36" width="100" height="56" rx="1"/>,
        circle: <circle cx="64" cy="64" r="40"/>
    };
    const locations: Record<GeometryShape, {
        vertex: [
            number,
            number
        ];
        edge: string;
        face: [
            number,
            number
        ];
    }> = {
        cube: { vertex: [65, 22], edge: 'M30 42L65 62', face: [48, 76] }, sphere: { vertex: [64, 64], edge: '', face: [64, 64] }, cylinder: { vertex: [64, 34], edge: 'M28 34A36 13 0 0 0 100 34', face: [64, 74] }, cone: { vertex: [64, 23], edge: 'M26 98A38 12 0 0 0 102 98', face: [64, 73] }, 'rectangular-prism': { vertex: [49, 30], edge: 'M18 48L80 63', face: [48, 70] }, triangle: { vertex: [64, 22], edge: 'M64 22L108 102', face: [64, 75] }, square: { vertex: [26, 26], edge: 'M26 26H102', face: [64, 64] }, rectangle: { vertex: [14, 36], edge: 'M14 36H114', face: [64, 64] }, circle: { vertex: [64, 64], edge: '', face: [64, 64] }
    };
    const location = locations[visual.shape];
    return <svg className="math-visual" viewBox="0 0 128 128" role="img" aria-label={visual.alt} focusable="false">
    <title>{visual.alt}</title><g fill="#f6dfac" stroke="#14243c" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">{shapes[visual.shape]}{mark === 'edge' && <path d={location.edge} fill="none" stroke="#c37b0e" strokeWidth="6"/>}{mark === 'vertex' && <circle cx={location.vertex[0]} cy={location.vertex[1]} r="5" fill="#ec941f"/>}{mark === 'face' && <circle cx={location.face[0]} cy={location.face[1]} r="6" fill="#ec941f"/>}</g>
  </svg>;
}
