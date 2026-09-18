import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, draw, isCorrect, parseBackup, type Settings } from '../src/core.ts';
import { seed } from '../src/data.ts';

test('液體研究所具備 30 題完整題庫', () => {
  const bank = seed();
  assert.equal(bank.length, 30);
  assert.deepEqual([1, 2, 3, 4].map((level) => bank.filter((question) => question.level === level).length), [8, 8, 7, 7]);
});

test('每關抽題、不重複、Level 4 可關閉', () => {
  const result = draw(seed(), defaults);
  assert.equal(result.questions.length, 16);
  assert.equal(new Set(result.questions.map((question) => question.id)).size, 16);
  const off: Settings = { ...defaults, level4Enabled: false, levels: [1, 2, 3] };
  const withoutLevel4 = draw(seed(), off);
  assert.equal(withoutLevel4.questions.length, 12);
  assert.ok(withoutLevel4.questions.every((question) => question.level < 4));
});

test('Level 2 搬家題包含預測與觀察流程', () => {
  const question = seed().find((item) => item.id === 'Q09')!;
  assert.equal(question.type, 'transfer');
  assert.ok(question.prediction && question.observation);
  assert.equal(question.prediction?.correctAnswer, 'o0');
  assert.equal(question.observation?.correctAnswer, 'o0');
});

test('多選判分與備份往返', () => {
  const question = seed().find((item) => item.id === 'Q30')!;
  assert.equal(isCorrect(question, question.multipleAnswers), true);
  assert.equal(isCorrect(question, question.multipleAnswers.slice(0, 2)), false);
  const backup = parseBackup(JSON.stringify({ version: 2, questions: seed(), settings: defaults }));
  assert.equal(backup.questions.length, 30);
});
