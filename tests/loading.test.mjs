import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const dist=new URL('../dist/',import.meta.url);
const html=readFileSync(new URL('index.html',dist),'utf8');
const preloads=[...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map(m=>m[1]);

test('Three.js loads the minified build and both of its files are preloaded from the same release',()=>{
 const three=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports.three;
 assert.match(three,/\/three\.module\.min\.js$/);
 // A preload URL that differs from the import map would download Three.js twice.
 assert.ok(preloads.includes(three),three);
 assert.ok(preloads.includes(new URL('three.core.min.js',three).href),'three.core.min.js');
});

test('every local module behind app.js is preloaded, so none waits for its importer to download',()=>{
 const found=new Set(),queue=['app.js'];
 while(queue.length)for(const [,dep] of readFileSync(new URL(queue.pop(),dist),'utf8').matchAll(/(?:from|import\()\s*'\.\/([\w-]+\.js)'/g))if(!found.has(dep)){found.add(dep);queue.push(dep);}
 const local=preloads.filter(href=>href.startsWith('./')).map(href=>href.slice(2));
 assert.deepEqual(local.sort(),[...found].filter(file=>file!=='app.js').sort());
 for(const file of local)assert.ok(existsSync(new URL(file,dist)),file);
});
