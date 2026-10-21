import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'lite');
const output = path.join(root, 'docs/.vitepress/dist');
const snapshot = JSON.parse(await readFile(path.join(source, 'snapshot.json'), 'utf8'));
const isMarkdown = filename => /\.(?:md|markdown|mdown|mkd|mkdn|mdx)$/i.test(filename);
// A Cloudflare checkout is self-contained: never read a sibling repository here.
for (const [name, version] of Object.entries(snapshot.dependencies)) {
  const installed = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
  if (installed.version !== version) throw new Error(`Lite requires ${name}@${version}; installed ${installed.version}. Update the website lockfile.`);
}
for (const file of snapshot.files) {
  if (isMarkdown(file.path)) throw new Error(`Markdown is not allowed in the Lite snapshot: ${file.path}. Run npm run lite:sync again.`);
  const hash = createHash('sha256').update(await readFile(path.join(source, file.path))).digest('hex');
  if (hash !== file.sha256) throw new Error(`Lite snapshot changed: ${file.path}. Run npm run lite:sync again.`);
}
await readFile(path.join(output, 'tutorials.html'));
const entries = ['src', 'assets', 'logo/official', 'licenses', 'docs', 'THIRD_PARTY_NOTICES.txt'];
for (const entry of entries) await cp(path.join(source, entry), path.join(output, entry), {
  recursive: true,
  filter: filename => !isMarkdown(filename),
});
// Public dependency URLs use vendor/, independent of deployment tools' handling
// of node_modules directories. The upstream snapshot remains unchanged.
const publicPaths = text => text.replaceAll('/node_modules/', '/vendor/');
for (const file of snapshot.files.filter(file => file.path.startsWith('src/') && file.path.endsWith('.js'))) {
  const filename = path.join(output, file.path);
  await writeFile(filename, publicPaths(await readFile(filename, 'utf8')));
}
for (const optional of ['LICENSE', 'LICENSE.txt']) {
  try { await cp(path.join(source, optional), path.join(output, optional)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// Keep only the dependencies actually requested by the static application.
const runtime = [
  'mathlive/mathlive.min.mjs', 'mathlive/mathlive-static.css', 'mathlive/mathlive-fonts.css', 'mathlive/fonts', 'mathlive/LICENSE.txt',
  'matter-js/build/matter.min.js', 'matter-js/build/matter.js', 'matter-js/LICENSE',
  'earcut/src', 'earcut/LICENSE',
];
for (const entry of runtime) {
  const filename = path.join(output, 'vendor', entry);
  await mkdir(path.dirname(filename), { recursive: true });
  await cp(path.join(root, 'node_modules', entry), filename, { recursive: true });
}
await cp(path.join(root, 'site'), output, { recursive: true });
const html = publicPaths(await readFile(path.join(source, 'index.html'), 'utf8'))
  .replace('</head>', '  <link rel="stylesheet" href="/site-links.css" />\n</head>')
  .replace('</body>', '  <script type="module" src="/site-links.js"></script>\n</body>');
await writeFile(path.join(output, 'index.html'), html);
console.log('Built Lite at /, tutorial home at /tutorials; existing documentation and toolbox routes retained.');
