import type { ReactNode } from 'react';
import type { ObjectAssetId, CompositionAssetId } from '../../../functions/visuals/contract.mjs';
import { ObjectIcon } from './ObjectIcon';
import { GeometryGraphic } from '../GeometryGraphic';

export function ObjectAsset({ asset, alt }: { asset: ObjectAssetId; alt: string }) {
  if (asset === 'battery' || asset === 'ball') return <div className="controlled-object" data-object-asset={asset} role="img" aria-label={alt}><ObjectIcon type={asset}/></div>;
  const glyphs: Record<Exclude<ObjectAssetId,'battery'|'ball'>, ReactNode> = {
    can: <><path d="M15 15v36c0 8 34 8 34 0V15" fill="#d8dedc"/><ellipse cx="32" cy="15" rx="17" ry="7" fill="#f1f2ed"/><ellipse cx="32" cy="15" rx="12" ry="3" fill="none"/><path d="M15 27h34v17H15" fill="#edc784"/><path d="M19 49h26M19 53h26" fill="none"/><path d="M29 29q-9 7 3 12 12-5 3-12Z" fill="#d77d55"/></>,
    'party-hat': <><path d="M9 49 32 10 55 49Q32 60 9 49Z" fill="#efc177"/><path d="M9 49q23-9 46 0" fill="none"/><path d="M13 51q19 21 38 0" fill="none" stroke="#c87941" strokeWidth="1.5"/><g data-hat-decoration="pompon" fill="#e5a08a" strokeWidth="1">{[[29,6],[35,6],[32,3],[32,9]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3"/>)}</g>{[[27,25],[35,35],[24,43],[43,46]].map(([x,y])=><circle key={x} cx={x} cy={y} r="2.5" fill="#c87941" stroke="none"/>)}<path d="m26 16 11 17m-21 8 9 6" fill="none" stroke="#fffaf1" strokeWidth="3"/></>,
    dice: <><path d="m8 19 22-12 26 14v26L34 59 8 45Z" fill="#fffaf1"/><path d="m8 19 26 14 22-12M34 33v26" fill="none"/>{[[22,30],[20,43],[44,32],[48,44],[31,19]].map(([x,y])=><circle key={x} cx={x} cy={y} r="2.5" fill="#14243c"/>)}</>,
    orange: <><circle cx="32" cy="34" r="23" fill="#eeae46"/><path d="m31 13 2-6q13-6 15 3-9 9-15 0" fill="#afbd91"/>{[[21,26],[43,31],[27,46],[38,48]].map(([x,y])=><circle key={x} cx={x} cy={y} r=".8" fill="#c27b36" stroke="none"/>)}</>,
    'shoe-box': <><path d="m6 25 19-11 33 10v23L39 58 6 48Z"/><path d="m6 25 33 10 19-11M39 35v23M6 31l33 10 19-11" fill="none"/><path d="m18 34 8 2v8l-8-2Z" fill="#fffaf1"/></>,
    'paper-roll': <><path d="M15 15v37q17 10 34 0V15" fill="#fffaf1"/><ellipse cx="32" cy="15" rx="17" ry="7" fill="#fffaf1"/><ellipse cx="32" cy="15" rx="6" ry="3" fill="#dfbd82"/><path d="M40 21v35l16 4V24Z" fill="#fffaf1"/><path d="M40 39h16" strokeDasharray="2 3" fill="none"/></>,
    'ice-cream-cone': <><path d="m16 22 16 37 16-37Z" fill="#dfbd82"/><path d="m20 29 16 15m-12-5 17-10m-10 22 8-15" fill="none"/><path d="M11 22q0-20 21-20 21 0 21 20Z" fill="#f1d6c2"/></>,
    book: <><path d="m8 20 17-9 30 9v30l-17 9-30-9Z" fill="#bcc9cc"/><path d="m8 20 30 9 17-9M38 29v30" fill="none"/><path d="m8 44 30 9 13-7v-6l-13 7-30-9Z" fill="#fffaf1"/><path d="m16 24 16 5m-16-1 16 5" fill="none"/></>,
    door: <><rect x="13" y="4" width="38" height="56" fill="#dfbd82"/><rect x="19" y="10" width="26" height="44" fill="#f6dfac"/><rect x="23" y="15" width="18" height="17" fill="none"/><circle cx="40" cy="38" r="2" fill="#ec941f"/></>,
    'wall-clock': <><circle cx="32" cy="32" r="27" fill="#dfbd82"/><circle cx="32" cy="32" r="23" fill="#fffaf1"/>{[0,90,180,270].map(a=><path key={a} d="M32 12v4" transform={`rotate(${a} 32 32)`}/>)}<path d="M32 17v15l11 8" fill="none"/><circle cx="32" cy="32" r="2"/></>,
    'square-tile': <><rect x="9" y="9" width="46" height="46" fill="#e9d6ba"/><rect x="14" y="14" width="36" height="36" fill="#fffaf1"/><path d="M14 14l36 36M50 14 14 50" stroke="#e5d6bc" fill="none"/></>,
    plate: <><circle cx="32" cy="32" r="26" fill="#fffaf1"/><circle cx="32" cy="32" r="20" fill="none"/><circle cx="32" cy="32" r="15" fill="#eee6d7"/></>,
    coin: <><circle cx="32" cy="32" r="26" fill="#dbbb77"/><circle cx="32" cy="32" r="21" fill="#f6dfac"/><path d="M32 19v27M24 27h16M24 34h16M28 45q14 0 14-11" fill="none"/></>,
    'triangular-sign': <><path d="M32 35v25" strokeWidth="5" stroke="#abb5b7"/><path d="M32 4 59 48H5Z" fill="#dc947c"/><path d="M32 13 49 41H15Z" fill="#fffaf1"/><path d="M32 24v8" strokeWidth="3"/><circle cx="32" cy="36" r="1.5" fill="#14243c"/></>
  };
  return <svg className="controlled-object" data-object-asset={asset} viewBox="0 0 64 64" role="img" aria-label={alt}><title>{alt}</title><g fill="#f6dfac" stroke="#14243c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">{glyphs[asset]}</g></svg>;
}

export function CompositionAsset({ asset, alt }: { asset: CompositionAssetId; alt: string }) {
  const row = asset === 'ball-dice-can' ? ['ball','dice','can'] as const : asset === 'clock-door-sign' ? ['wall-clock','door','triangular-sign'] as const : null;
  if (row) return <div className="controlled-composition object-row" data-composition-asset={asset} role="group" aria-label={alt}>{row.map(a=><ObjectAsset key={a} asset={a} alt={{ball:'Top',dice:'Zar',can:'Konserve kutusu','wall-clock':'Duvar saati',door:'Kapı','triangular-sign':'Trafik levhası'}[a]!}/>)}</div>;
  if (asset === 'square-triangle') return <div className="controlled-composition shape-pair" data-composition-asset={asset} role="group" aria-label={alt}><GeometryGraphic visual={{kind:'geometry',shape:'square',alt:'Kare'}}/><GeometryGraphic visual={{kind:'geometry',shape:'triangle',alt:'Üçgen'}}/></div>;
  if (asset === 'cube-vertex') return <div data-composition-asset={asset}><GeometryGraphic visual={{kind:'geometry',shape:'cube',alt}} mark="vertex"/></div>;
  if (asset === 'cube-face') return <svg className="math-diagram" data-composition-asset={asset} viewBox="0 0 128 128" role="img" aria-label={alt}><GeometryGraphic visual={{kind:'geometry',shape:'cube',alt:'Küp modeli'}}/><polygon data-mark="face" points="30,42 65,62 65,102 30,82" fill="#edac43" fillOpacity=".75" stroke="#c37b0e" strokeWidth="3"/></svg>;
  if (asset === 'cube-cylinder-house') return <svg className="math-diagram" data-composition-asset={asset} viewBox="0 0 260 170" role="img" aria-label={alt}><title>{alt}</title><svg x="45" y="20" width="70" height="135"><GeometryGraphic visual={{kind:'geometry',shape:'cylinder',alt:'Silindir parça'}}/></svg><svg x="65" y="15" width="135" height="150"><GeometryGraphic visual={{kind:'geometry',shape:'cube',alt:'Küp parça'}}/></svg><svg x="150" y="20" width="70" height="135"><GeometryGraphic visual={{kind:'geometry',shape:'cylinder',alt:'Silindir parça'}}/></svg></svg>;
  // Fixed liquid presets: equal water uses equal widths and equal water heights;
  // capacity is represented by different container heights, without invented numbers.
  const equal = asset === 'same-water-different-capacity';
  return <svg className="math-diagram" data-composition-asset={asset} viewBox="0 0 280 180" role="img" aria-label={alt}><title>{alt}</title><g stroke="#14243c" strokeWidth="2" fill="#fffaf1">
    {equal ? <><path d="M30 95V160H100V95"/><path d="M170 30V160H240V30"/><rect x="31" y="130" width="68" height="29" fill="#a5c4cc" stroke="none"/><rect x="171" y="130" width="68" height="29" fill="#a5c4cc" stroke="none"/></> : <><path d="M20 55H150L135 160H35Z"/><path d="M32 55Q85 0 138 55" fill="none"/><path d="M34 151H136L135 159H35Z" fill="#a5c4cc" stroke="none"/><path d="M195 90H250L245 160H200Z"/><path d="M196 91H249L244 159H201Z" fill="#a5c4cc" stroke="none"/></>}
    <text x={equal?65:85} y="177" textAnchor="middle" fontSize="12" fill="#14243c" stroke="none">{equal?'Küçük kap':'Kova'}</text><text x={equal?205:222} y="177" textAnchor="middle" fontSize="12" fill="#14243c" stroke="none">{equal?'Büyük kap':'Bardak'}</text>
  </g></svg>;
}
