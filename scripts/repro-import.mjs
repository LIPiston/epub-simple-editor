/**
 * Reproduction harness: imports the real parseEpub under a Node + jsdom DOM,
 * so we can observe exactly where an EPUB import fails.
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dom = new JSDOM('', { url: 'http://localhost/' });
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.window = dom.window;
if (!globalThis.File) globalThis.File = dom.window.File;

const entry = path.resolve('services/epub/importer.ts');
const out = path.resolve('scripts/.tmp-importer.mjs');

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: out,
  logLevel: 'error',
  external: ['jszip'],
});

const { parseEpub } = await import(pathToFileURL(out).href);

const filePath = process.argv[2];
const buf = readFileSync(filePath);
// Node's File/Blob isn't readable by jszip here; JSZip only needs a binary source.
// parseEpub otherwise only reads `file.name`, so attach it to an ArrayBuffer.
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const file = Object.assign(ab, { name: path.basename(filePath) });

// DOMParser XML error detection like the browser does
const parserProbe = new dom.window.DOMParser();
const probe = parserProbe.parseFromString('<a>&</a>', 'application/xml');
console.log('XML error detection probe:', probe.getElementsByTagName('parsererror').length > 0 ? 'WORKS' : 'NOT DETECTED');

try {
  const result = await parseEpub(file, { cleanHtml: true, removeImages: false });
  console.log('\n=== IMPORT SUCCEEDED ===');
  console.log('title      :', JSON.stringify(result.metadata?.title));
  console.log('creator    :', JSON.stringify(result.metadata?.creator));
  console.log('series     :', JSON.stringify(result.metadata?.series));
  console.log('chapters   :', result.chapters?.length);
  console.log('images     :', result.images?.length);
  console.log('extraFiles :', result.extraFiles?.length);
  console.log('cover      :', result.cover ? 'yes' : 'no');
  console.log('first ch   :', result.chapters?.[0]?.title, '| level', result.chapters?.[0]?.level,
    '| subItems', result.chapters?.[0]?.subItems?.length);
  console.log('chapter titles:', result.chapters?.slice(0, 4).map((c) => c.title));
} catch (err) {
  console.log('\n=== IMPORT FAILED ===');
  console.log('Error name   :', err?.name);
  console.log('Error message:', err?.message);
  console.log('Stack        :', err?.stack?.split('\n').slice(0, 6).join('\n'));
  process.exitCode = 1;
}
