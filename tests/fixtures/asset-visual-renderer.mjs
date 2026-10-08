import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';

// Compile the real TSX component only for isolated SSR/browser tests.
export async function loadAssetVisual(futureCustom = false) {
  const directory = '.firebase/asset-visual-tests';
  mkdirSync(directory, { recursive: true });
  let resolver = pathToFileURL(resolve('src/assets/visual-assets.mjs')).href;
  if (futureCustom) {
    const fixture = `${directory}/future-custom.mjs`;
    writeFileSync(fixture, `import {isReadyVisualAsset} from ${JSON.stringify(resolver)};
      const entry={source:'custom-education',concept:'classroom',status:'ready',file:'/assets/education/school/classroom.svg'};
      export function resolveVisualAsset(id){return id==='classroom'&&isReadyVisualAsset(entry)?entry:null;}`);
    resolver = pathToFileURL(resolve(fixture)).href;
  }
  const source = readFileSync('src/ui/AssetVisual.tsx', 'utf8').replace("'../assets/visual-assets.mjs'", JSON.stringify(resolver));
  const compiled = ts.transpileModule(source, { compilerOptions:{jsx:ts.JsxEmit.ReactJSX, module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022} }).outputText;
  const output = `${directory}/${futureCustom ? 'future' : 'current'}-AssetVisual.mjs`;
  writeFileSync(output, compiled);
  return (await import(pathToFileURL(resolve(output)).href)).AssetVisual;
}
