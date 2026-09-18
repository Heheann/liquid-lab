import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, draw, isCorrect, parseBackup, type ContainerKind, type Settings } from '../src/core.ts';
import { seed } from '../src/data.ts';
import { boundsOf, horizontalSpan, makeContainerPoints, polygonArea, surfaceForFraction } from '../src/liquidPhysics.ts';

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

test('杯子轉移到碗、細試管與三角容器時都能依形狀計算水平液面', () => {
  const sourceVolume = polygonArea(makeContainerPoints('cup', 0, 0)) * 0.62;
  const targets: ContainerKind[] = ['bowl', 'bottle', 'triangle'];
  for (const kind of targets) {
    const points = makeContainerPoints(kind, 0, 0);
    const fraction = Math.min(0.86, sourceVolume / polygonArea(points));
    const surface = surfaceForFraction(points, fraction);
    const bounds = boundsOf(points);
    const span = horizontalSpan(points, surface + 1);
    assert.ok(surface > bounds.minY && surface < bounds.maxY, `${kind} 的液面應位於容器內`);
    assert.ok(span && span.right > span.left, `${kind} 的液體應有受內壁限制的寬度`);
  }
});

test('三角容器愈靠近底部愈寬，液面會隨累積量平滑上升', () => {
  const triangle = makeContainerPoints('triangle', 0, 0);
  const bounds = boundsOf(triangle);
  const upper = horizontalSpan(triangle, bounds.minY + (bounds.maxY - bounds.minY) * 0.35)!;
  const lower = horizontalSpan(triangle, bounds.minY + (bounds.maxY - bounds.minY) * 0.8)!;
  assert.ok(lower.right - lower.left > upper.right - upper.left);
  assert.ok(surfaceForFraction(triangle, 0.7) < surfaceForFraction(triangle, 0.25));
});
