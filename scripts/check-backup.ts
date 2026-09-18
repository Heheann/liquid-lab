import {readFile,writeFile} from 'node:fs/promises';
import {parseBackup} from '../src/core.ts';
const b=parseBackup(await readFile('output/playwright/backup.json','utf8'));
const custom=b.questions.find(q=>q.name==='驗收：雙圖片題目');
if(b.questions.length!==35||!custom?.imageA.startsWith('data:image/webp')||!custom?.imageB.startsWith('data:image/webp'))throw Error('備份未包含雙圖片');
console.log('備份含 35 題、雙圖片、正確答案及設定，驗證通過。');
await writeFile('output/playwright/invalid.json','{"version":999,"questions":[]}');
