import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.argv[2] || path.join(root, '../StuCanvasProject/StuCanvasLite'));
const destination = path.join(root, 'lite');
const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (manifest.name !== 'stucanvas-lite') throw new Error('Source must be the StuCanvas Lite project.');
if (source === destination) throw new Error('Source and snapshot must be different directories.');

const entries = ['index.html', 'src', 'assets', 'logo/official', 'licenses', 'docs'];
const isMarkdown = filename => /\.(?:md|markdown|mdown|mkd|mkdn|mdx)$/i.test(filename);
// Check all inputs before touching an existing snapshot.
for (const entry of entries) await stat(path.join(source, entry));
const notices = await readFile(path.join(source, 'THIRD_PARTY_NOTICES.md'), 'utf8');
try {
  await readFile(path.join(destination, 'snapshot.json'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  try {
    await readdir(destination);
    throw new Error('Refusing to replace lite/: it is not an existing managed snapshot.');
  } catch (missing) {
    if (missing.code !== 'ENOENT') throw missing;
  }
}
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of entries) await cp(path.join(source, entry), path.join(destination, entry), {
  recursive: true,
  filter: filename => !isMarkdown(filename),
});
await writeFile(path.join(destination, 'THIRD_PARTY_NOTICES.txt'), notices);
for (const optional of ['LICENSE', 'LICENSE.txt']) {
  try { await cp(path.join(source, optional), path.join(destination, optional)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const files = [];
async function inventory(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(filename);
    else files.push({ path: path.relative(destination, filename).split(path.sep).join('/'), sha256: createHash('sha256').update(await readFile(filename)).digest('hex') });
  }
}
await inventory(destination);
const dependencies = Object.fromEntries(['mathlive', 'matter-js', 'earcut'].map(name => [name, manifest.dependencies[name]]));
await writeFile(path.join(destination, 'snapshot.json'), JSON.stringify({ source: 'StuCanvas Lite', version: manifest.version, dependencies, files }, null, 2) + '\n');
console.log(`Synced StuCanvas Lite ${manifest.version}: ${files.length} files into lite/.`);
