import { readFile, writeFile, rename, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssetCatalog, approveCatalogAsset } from './asset-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const values = {};
for (let i=0;i<args.length;i++) {
  const key = args[i];
  if (!['--concepts','--out','--approve','--hexcode','--reviewed-by','--note'].includes(key) || values[key] || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Invalid CLI argument: '+key);
  values[key] = args[++i];
}
function localPath(value) {
  const path = resolve(root,value), rel = relative(root,path);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('Catalog paths must remain in TEST ARENA');
  return path;
}
const metadata = JSON.parse(await readFile(resolve(root,'vendor/openmoji/data/openmoji.json'),'utf8'));
const concepts = JSON.parse(await readFile(localPath(values['--concepts'] ?? 'data/asset-catalog/example-concepts.json'),'utf8'));
const registryPath = resolve(root,'src/assets/openmoji-registry.json');
const registry = JSON.parse(await readFile(registryPath,'utf8'));
const catalog = buildAssetCatalog(metadata,concepts,registry);
if (values['--approve']) {
  const updated = approveCatalogAsset(registry,catalog,{visualId:values['--approve'],hexcode:values['--hexcode'],reviewedBy:values['--reviewed-by'],note:values['--note']});
  await access(resolve(root,'vendor/openmoji/color', `${updated[values['--approve']].hexcode}.svg`));
  if (updated !== registry) {
    await writeFile(registryPath+'.tmp',JSON.stringify(updated,null,2)+'\n','utf8');
    await rename(registryPath+'.tmp',registryPath);
  }
  console.log('Approved semantic ID: '+values['--approve']+'. Run node scripts/copy-openmoji-selected.mjs to copy registry-selected assets.');
} else {
  if (values['--hexcode'] || values['--reviewed-by'] || values['--note']) throw new Error('Approval arguments require --approve');
  const output = localPath(values['--out'] ?? 'data/asset-catalog/example-catalog.json');
  // Catalog outputs cannot overwrite source code, the central registry or vendor metadata.
  const catalogDirectory = resolve(root,'data/asset-catalog');
  const rel = relative(catalogDirectory,output);
  if (rel.startsWith('..') || isAbsolute(rel) || !output.endsWith('.json') || output === localPath(values['--concepts'] ?? 'data/asset-catalog/example-concepts.json')) throw new Error('Use a separate JSON output under data/asset-catalog');
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(catalog,null,2)+'\n','utf8');
  console.log(JSON.stringify(catalog.summary));
}
