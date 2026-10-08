import { useId, type ReactNode } from 'react';
import type { QuestionVisual, ObjectType } from '../../../functions/visuals/contract.mjs';
import { GeometryGraphic } from '../GeometryGraphic';
import { ObjectIcon } from './ObjectIcon';
import { ObjectAsset, CompositionAsset } from './ControlledAssets';
import { scatteredPositions } from './scattered.mjs';
import {SchoolVisual} from '../SchoolVisual';
type V = Exclude<QuestionVisual, {
    kind: 'geometry';
}>;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const polar = (cx: number, cy: number, r: number, degrees: number) => [cx + r * Math.sin(degrees * Math.PI / 180), cy - r * Math.cos(degrees * Math.PI / 180)];
function Drawing({ alt, children, width = 240, height = 160 }: {
    alt: string;
    children: ReactNode;
    width?: number;
    height?: number;
}) { return <svg className="math-diagram" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={alt}><title>{alt}</title><g stroke="#14243c" strokeWidth="2" fill="#f6dfac" strokeLinejoin="round">{children}</g></svg>; }
function Objects({ type, count, scattered=false }: {
    type: ObjectType;
    count: number;
    scattered?: boolean;
}) {
    if(scattered){const model=scatteredPositions(count);return <svg className="scattered-objects" viewBox={`0 0 ${model.width} ${model.height}`} role="list" aria-label="Dağınık nesneler">{model.points.map((p,i)=><svg key={i} data-scattered-object="true" x={p.x} y={p.y} width={model.size} height={model.size} role="listitem" aria-label="Nesne"><ObjectIcon type={type} scattered/></svg>)}</svg>;}
    return <div className="object-grid">{range(count).map(i => <span key={i} role="listitem" aria-label="Nesne"><ObjectIcon type={type}/></span>)}</div>;
}
export function MathematicalVisual({ visual: v }: {
    visual: V;
}) {
    const clipId = useId();
    let content: ReactNode;
    switch (v.kind) {
        case 'image': content=<img className="package-question-image" src={v.src} alt={v.alt}/>; break;
        case 'school-place': case 'school-person': case 'school-dialogue': content=<SchoolVisual visual={v}/>; break;
        case 'object': content = <ObjectAsset asset={v.asset} alt={v.alt}/>; break;
        case 'composition': content = <CompositionAsset asset={v.asset} alt={v.alt}/>; break;
        case 'scene':
            content = <div className={`math-scene preset-${v.preset}`} data-stimulus-id={v.stimulusId}>{v.items.map((item, i) => <div className="scene-part" key={i}>{i > 0 && v.preset === 'equation' && <b className="scene-operator">{v.operators![i - 1]}</b>}{item.kind === 'geometry' ? <GeometryGraphic visual={item}/> : <MathematicalVisual visual={item}/>}</div>)}</div>;
            break;
        case 'objects': {
            if(v.layout==='scattered'){content=<Objects type={v.objectType} count={v.count} scattered/>;break;}
            const group = v.groupSize ?? v.count;
            content = <div className={`object-collection layout-${v.layout}`}>{range(Math.ceil(v.count / group)).map(i => <div className={v.groupSize ? 'object-bundle' : ''} role="list" key={i}><Objects type={v.objectType} count={Math.min(group, v.count - i * group)}/></div>)}</div>;
            break;
        }
        case 'base-ten':
            content = <div className="base-ten-model"><div className="ten-rods" role="list" aria-label="Onluk çubuklar">{range(v.tens).map(i => <div className="ten-rod" key={i} role="listitem" aria-label="On eş hücreli çubuk">{range(10).map(j => <i key={j}/>)}</div>)}</div><div className="one-blocks" role="list" aria-label="Birlik hücreler">{range(v.ones).map(i => <i key={i} role="listitem" aria-label="Tek hücre"/>)}</div></div>;
            break;
        case 'math-cards':
            content = <div className={'math-cards ' + v.mode}>{v.items.map((item, i) => <span className={'number-token token-' + item.shape} key={i}>{item.value ?? '?'}</span>)}</div>;
            break;
        case 'vertical':
            content = <div className="vertical-operation" aria-label={v.alt}><div className="operation-row"><span />{String(v.top).padStart(3, ' ').split('').map((s, i) => <b key={i}>{s}</b>)}</div><div className="operation-row"><span>{v.operator}</span>{String(v.bottom).padStart(3, ' ').split('').map((s, i) => <b key={i}>{s}</b>)}</div><div className="operation-row operation-result"><span />{v.result === null ? <b className="missing-result">?</b> : String(v.result).padStart(3, ' ').split('').map((s, i) => <b key={i}>{s}</b>)}</div></div>;
            break;
        case 'sequence':
            content = <div className="sequence-items">{v.items.map((item, i) => <span className="sequence-step" key={i}>{i > 0 && <small aria-hidden="true">→</small>}{item === null ? <b>?</b> : typeof item === 'number' ? <b>{item}</b> : <GeometryGraphic visual={{ kind: 'geometry', shape: item, alt: 'Örüntüdeki şekil' }}/>}</span>)}</div>;
            break;
        case 'paths':
            content = <div className="number-paths">{v.rows.map((row, i) => <div className="number-path" key={i}><b>{row.label}</b><div className="sequence-items">{row.values.map((n, j) => <span className="path-stop" key={j}>{j > 0 && <small>→</small>}<b>{n ?? '?'}</b></span>)}</div></div>)}</div>;
            break;
        case 'character': {
            const color = { ada: '#e4bb87', deniz: '#b4c5cc', efe: '#ccc099' }[v.avatar];
            content = <div className="character-data"><svg className="math-avatar" viewBox="0 0 80 95" aria-hidden="true"><path d="M8 94Q10 56 40 57 70 56 72 94" fill={color}/><circle cx="40" cy="32" r="24" fill="#efcda6" stroke="#14243c" strokeWidth="2"/><path d="M17 28Q15 0 43 6 64 5 64 30L54 15 24 18Z" fill="#14243c"/><circle cx="31" cy="32" r="2"/><circle cx="49" cy="32" r="2"/><path d="M32 45q8 6 16 0" stroke="#14243c" strokeWidth="2" fill="none"/></svg><div><strong>{v.name}</strong>{v.value !== undefined && <b className="character-value">{v.value} {v.unit}</b>}{v.speech && <p className="speech-bubble">{v.speech}</p>}</div></div>;
            break;
        }
        case 'groups': {
            const groups = v.groupCount ?? v.totalObjects / v.objectsPerGroup!;
            content = <div className={'equal-groups arrangement-' + v.arrangement}>{range(groups).map(i => <div className="equal-group" role="list" key={i}><Objects type={v.objectType} count={v.totalObjects / groups}/></div>)}</div>;
            break;
        }
        case 'geometry-layout':
            content = <div className="geometry-layout">{v.items.map((item, i) => <div className={'geometry-cell size-' + item.size} key={i} style={{ gridColumn: item.column + 1, gridRow: item.row + 1, transform: `rotate(${item.rotation}deg)` }}><GeometryGraphic visual={{ kind: 'geometry', shape: item.shape, alt: item.mark ? `Modelde ${item.mark === 'vertex' ? 'köşesi' : item.mark === 'edge' ? 'ayrıtı veya kenarı' : 'yüzü'} işaretlenmiş şekil` : 'Modeldeki şekil' }} mark={item.mark}/></div>)}</div>;
            break;
        case 'symmetry':
            content = <Drawing alt={v.alt} width={200} height={200}>{range(9).map(i => <g key={i} fill="none" stroke="#ded7c9"><path d={`M${20 + i * 20} 20V180M20 ${20 + i * 20}H180`}/></g>)}{v.showAxis && <path d={v.axis === 'vertical' ? 'M100 10V190' : 'M10 100H190'} stroke="#ba7515" strokeDasharray="5 4"/>}{[v.left, v.right].map((points, i) => <g key={i}>{points.map(({ x, y }, j) => <rect key={j} x={10 + x * 20} y={10 + y * 20} width="20" height="20" fill={i ? '#b4c5cc' : '#f6dfac'}/>)}</g>)}</Drawing>;
            break;
        case 'rotation': {
            const [x, y] = polar(110, 110, 70, v.startIndex * 360 / v.labels.length);
            content = <><Drawing alt={v.alt} width={220} height={220}><circle cx="110" cy="110" r="94" fill="#fffaf1"/>{v.labels.map((label, i) => { const [a, b] = polar(110, 110, 75, i * 360 / v.labels.length); return <text key={i} x={a} y={b + 6} textAnchor="middle" fill="#14243c" stroke="none" fontSize="18">{label}</text>; })}<path d={`M110 110L${x} ${y}`} strokeWidth="4"/><circle cx="110" cy="110" r="5"/></Drawing>{v.quarterTurns !== undefined && <p className="given-data">{v.quarterTurns === 1 ? 'Çeyrek' : 'Yarım'} dönüş · {v.direction === 'clockwise' ? 'Saat yönünde' : 'Saatin tersi yönünde'}</p>}</>;
            break;
        }
        case 'fraction': {
            const total = v.parts.reduce((a, b) => a + b, 0);
            let sum = 0;
            content = <Drawing alt={v.alt} width={220} height={v.model === 'bar' ? 90 : 180}>{v.parts.map((part, i) => { const start = sum / total; sum += part; const end = sum / total, fill = v.shaded.includes(i) ? '#edac43' : '#fffaf1'; if (v.model === 'circle') {
                const [x1, y1] = polar(110, 90, 75, start * 360), [x2, y2] = polar(110, 90, 75, end * 360);
                return <path key={i} fill={fill} d={`M110 90L${x1} ${y1}A75 75 0 ${end - start > 0.5 ? 1 : 0} 1 ${x2} ${y2}Z`}/>;
            } return <rect key={i} x={10 + 200 * start} y="15" width={200 * (end - start)} height={v.model === 'bar' ? 55 : 145} fill={fill}/>; })}</Drawing>;
            break;
        }
        case 'clock': {
            const [mx, my] = polar(110, 110, 72, v.minute * 6), [hx, hy] = polar(110, 110, 48, (v.hour % 12) * 30 + v.minute / 2);
            content = <Drawing alt={v.alt} width={220} height={220}><circle cx="110" cy="110" r="98" fill="#fffaf1"/>{range(12).map(i => { const [x, y] = polar(110, 110, 80, (i + 1) * 30); return <text key={i} x={x} y={y + 6} fontSize="22" textAnchor="middle" stroke="none" fill="#14243c">{i + 1}</text>; })}<path data-hand="minute" d={`M110 110L${mx} ${my}`} strokeWidth="3"/><path data-hand="hour" d={`M110 110L${hx} ${hy}`} strokeWidth="6"/><circle cx="110" cy="110" r="5"/></Drawing>;
            break;
        }
        case 'money':
            content = <div className="money-items">{v.items.flatMap((m, i) => range(m.count).map(j => <span key={`${i}-${j}`} className={m.kurus <= 100 ? 'coin' : 'note'}>{m.kurus < 100 ? m.kurus : m.kurus / 100}<small>{m.kurus < 100 ? 'kuruş' : 'TL'}</small></span>))}</div>;
            break;
        case 'ruler':
            content = <><Drawing alt={v.alt} width={Math.max(220, v.maxCm * 28 + 30)} height={150}><rect x="10" y="70" width={v.maxCm * 28 + 10} height="55"/>{range(v.maxCm + 1).map(i => <g key={i}><path d={`M${15 + i * 28} 70v16`}/><text x={15 + i * 28} y="112" textAnchor="middle" fontSize="16" fill="#14243c" stroke="none">{i}</text></g>)}<path d={`M${15 + v.startCm * 28} 42H${15 + v.endCm * 28}`} stroke="#af7116" strokeWidth="12"/><path d={`M${15 + v.startCm * 28} 48V70M${15 + v.endCm * 28} 48V70`} strokeDasharray="3 3"/><text x="15" y="143" fontSize="14" stroke="none" fill="#14243c">cm</text></Drawing><span className="measurement-object"><ObjectIcon type={v.objectType}/></span>{v.showLength && <b>{v.endCm - v.startCm} cm</b>}</>;
            break;
        case 'balance': {
            const leftY = v.tilt === 'left' ? 65 : v.tilt === 'right' ? 35 : 50, rightY = 100 - leftY;
            content = <><Drawing alt={v.alt} width={240} height={170}><path d={`M120 50V145M85 145h70M25 ${leftY}L215 ${rightY}`} fill="none" strokeWidth="4"/><path d={`M25 ${leftY}v65M215 ${rightY}v65M3 ${leftY + 60}q22 30 44 0ZM193 ${rightY + 60}q22 30 44 0Z`}/></Drawing><div className="mass-values">{[v.left, v.right].map((side, i) => <div key={i}><ObjectIcon type={side.objectType}/><b>{side.value} {side.unit}</b></div>)}</div></>;
            break;
        }
        case 'container': {
            const scale = { small: .7, medium: .85, large: 1 }[v.capacityClass];
            const outlines = { glass: 'M65 35H155L145 165H75Z', bottle: 'M90 20H130V50L150 70V165H70V70L90 50Z', jug: 'M70 30H140V160H70Z', bucket: 'M55 55H165L150 165H70ZM65 55Q110-10 155 55', spoon: 'M105 160V80C65 80 65 20 105 20C145 20 145 80 105 80Z', ladle: 'M110 20V125Q50 105 55 145Q70 180 120 150Z', cup: 'M65 60H140V150H65Z', pot: 'M50 65H160V150H50Z' };
            const bounds = { glass: [35, 165], bottle: [70, 165], jug: [30, 160], bucket: [55, 165], spoon: [20, 80], ladle: [125, 160], cup: [60, 150], pot: [65, 150] }[v.vessel];
            const waterTop = bounds[1] - v.fill * (bounds[1] - bounds[0]);
            content = <><Drawing alt={v.alt} width={220} height={190}><defs><clipPath id={clipId}><rect x="0" y={waterTop} width="220" height={190 - waterTop}/></clipPath></defs><g transform={`translate(${110 * (1 - scale)} ${190 * (1 - scale)}) scale(${scale})`}><path d={outlines[v.vessel]} fill="#fffaf1"/><path d={outlines[v.vessel]} fill="#a5c4cc" stroke="none" clipPath={`url(#${clipId})`}/><path d={outlines[v.vessel]} fill="none"/>{v.vessel === 'jug' && <path d="M140 45Q200 40 165 110H140" fill="none"/>}{v.vessel === 'cup' && <path d="M140 75Q185 70 165 120H140" fill="none"/>}{v.vessel === 'pot' && <path d="M30 75H50M160 75H185" fill="none"/>}</g></Drawing><div className="given-data">{v.capacityMl !== undefined && <>Kapasite: {v.capacityMl} mL · İçindeki sıvı: {v.amountMl} mL</>}</div></>;
            break;
        }
        case 'data':
            content = v.mode === 'bar' ? <div className="math-data data-mode-bar"><div className="bar-chart"><div className="bar-axis">{[20, 15, 10, 5, 0].map(n => <span key={n}>{n}</span>)}</div><div className="bar-columns">{v.rows.map((r, i) => <div className="bar-column" key={i}><div className="bar-track"><span className="bar-fill" style={{ height: r.value * 5 + '%' }}><b>{r.value}</b></span></div><strong>{r.label}</strong></div>)}</div></div><small>Adet</small></div> : v.mode === 'table' ? <table className="math-data-table"><thead><tr><th>Tür</th><th>Miktar</th></tr></thead><tbody>{v.rows.map((r, i) => <tr key={i}><th>{r.label}</th><td>{r.value}</td></tr>)}</tbody></table> : <div className={'math-data data-mode-' + v.mode}>{v.rows.map((r, i) => <div className="data-row" key={i}><b>{r.label}</b><div className="data-marks">{v.mode === 'pictograph' ? range(r.value / v.unitValue).map(j => <ObjectIcon type="star" key={j}/>) : range(Math.ceil(r.value / 5)).map(j => <span className="tally-group" key={j}>{range(Math.min(5, r.value - j * 5)).map(k => <i className={k === 4 ? 'fifth' : ''} key={k}/>)}</span>)}</div></div>)}{v.mode === 'pictograph' && <small>Her yıldız {v.unitValue} nesneyi gösterir.</small>}</div>;
            break;
        case 'number-line':
            content = <Drawing alt={v.alt} width={300} height={105}><path d="M10 50H290M285 46l5 4-5 4" fill="none"/>{range((v.max - v.min) / v.step + 1).map(i => { const value = v.min + i * v.step, x = 15 + 270 * i / ((v.max - v.min) / v.step); return <g key={i}><path d={`M${x} 42v16`}/><text x={x} y="80" textAnchor="middle" stroke="none" fill="#14243c" fontSize="15">{value}</text>{v.points.includes(value) && <circle cx={x} cy="33" r="6" fill="#edac43"/>}</g>; })}{range(v.jumps??0).map(i=>{const span=270/((v.max-v.min)/v.step),x=15+i*span,end=x+span;return <g key={i} data-number-jump="true"><path d={`M${x} 40Q${x+span/2} 2 ${end} 40`} fill="none" stroke="#c37b0e"/><path d={`M${end-5} 34L${end} 40L${end+1} 32`} fill="none" stroke="#c37b0e"/></g>;})}</Drawing>;
            break;
    }
    return <div className={'mathematical-visual kind-' + v.kind} role="group" aria-label={v.alt} data-visual-kind={v.kind}>{content}</div>;
}
