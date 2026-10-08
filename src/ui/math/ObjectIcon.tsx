import type { ObjectType } from '../../../functions/visuals/contract.mjs';
// Local educational glyphs. No arbitrary assets, markup, styles or URLs from question data.
export function ObjectIcon({ type, scattered = false }: {
    type: ObjectType;
    scattered?: boolean;
}) {
    const glyphs = {
        dot: <circle cx="32" cy="32" r="16" fill="#14243c"/>,
        pencil: <><path d="M17 45 23 14 32 16 26 47 20 53Z"/><path d="m23 14 1-6 9 2-1 6M20 53l6-6" fill="none"/></>,
        eraser: <><path d="m13 38 18-24 20 15-18 24Z"/><path d="m23 25 19 15M13 38h17" fill="none"/></>,
        apple: <><path d="M31 21C6 5 5 53 28 53H36C57 51 58 8 33 21Z" fill="#eaa68b"/><path d="m32 22 2-13M34 15q10-12 16-2-8 7-16 2" fill="none"/></>,
        hazelnut: <><path d="M12 25Q32 1 51 25C58 60 8 61 12 25Z" fill="#dfbd82"/><path d="M12 25q20 8 39 0M32 34v18" fill="none"/></>,
        ball: <g data-ball-style="football"><circle cx="32" cy="32" r="23" fill="#fffaf1"/><path d="m32 22 10 7-4 12H26l-4-12Z" fill="#14243c"/><path d="M32 22V9M42 29l12-4M38 41l8 9M26 41l-8 9M22 29l-12-4" fill="none"/><path d="m26 10 6-1 6 1-6 5ZM50 18l4 7-2 6-5-6ZM52 44l-6 6-6 2 3-7ZM24 54l-6-4-5-7 9 2ZM10 30l-1-5 5-9 2 9Z" fill="#14243c" strokeWidth="1"/></g>,
        flower: <><path d="M32 32v27M32 46q-20-12-17 1 5 9 17 0" fill="none"/>{[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="32" cy="17" rx="7" ry="12" transform={`rotate(${a} 32 28)`}/>)}<circle cx="32" cy="28" r="6" fill="#ec941f"/></>,
        star: <path d="m32 6 8 17 19 3-14 14 3 19-16-9-17 9 4-19L5 26l19-3Z"/>,
        candy: <><path d="M18 24 5 17v30l13-7M46 24l13-7v30l-13-7"/><rect x="17" y="19" width="30" height="25" rx="10"/></>,
        strawberry: <><path d="M10 24Q32 9 54 24 50 41 32 57 14 42 10 24Z" fill="#eaa68b"/><path d="m12 21 13 4 7-16 7 16 13-4" fill="#bac7a2"/>{[22, 32, 42].map(x => <path key={x} d={`m${x} 32 1 2m${x - 5} 41 1 2`} fill="none"/>)}</>,
        book: <><path d="M7 11q14-6 25 2 12-8 25-2v39q-13-7-25 0-13-7-25 0Z"/><path d="M32 13v37M12 21l13 2M39 23l13-2" fill="none"/></>,
        marble: <><circle cx="32" cy="32" r="22" fill="#bbcad0"/><path d="M15 18q36 10 22 34M25 12q-3 27 26 30" fill="none"/></>,
        cube: <><path d="m9 20 23-13 23 13v26L32 59 9 46Z"/><path d="m9 20 23 14 23-14M32 34v25" fill="none"/></>,
        battery: <><rect x="17" y="10" width="30" height="47" rx="5"/><rect x="25" y="5" width="14" height="5"/><path d="M23 26h18M32 17v18M24 45h16" fill="none"/></>,
        box: <><path d="m7 19 18-10 32 9v29L39 57 7 48Z"/><path d="m7 19 32 9 18-10M39 28v29M25 9l32 9" fill="none"/></>,
        pot: <><path d="M15 30h34l-5 25H20Z"/><path d="M32 30V9M32 20q-24-22-18-2 7 12 18 2M32 15q21-20 18-3-4 14-18 3" fill="none"/></>
    };
    const viewBox = scattered && type === 'pencil' ? '14 5 22 51' : scattered && type === 'dot' ? '13 13 38 38' : '0 0 64 64';
    return <svg className="object-icon" viewBox={viewBox} aria-hidden="true"><g fill="#f6dfac" stroke="#14243c" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">{glyphs[type]}</g></svg>;
}
