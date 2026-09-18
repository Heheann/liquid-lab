import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {seed} from '../src/data.ts';
await mkdir('output/playwright',{recursive:true});
const template=await readFile('tests/browser-flow.template.js','utf8');
await writeFile('output/playwright/browser-flow.js',template.replace('__BANK__',JSON.stringify(seed())));
const offline=await readFile('tests/browser-offline.template.js','utf8');
await writeFile('output/playwright/browser-offline.js',offline.replace('__BANK__',JSON.stringify(seed())));
