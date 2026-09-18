export type Level = 1 | 2 | 3 | 4;
export type Difficulty = '基礎' | '一般' | '挑戰';
export type QuestionType = 'single' | 'transfer' | 'multiple';
export type ContainerKind = 'cup' | 'tall' | 'bowl' | 'bottle' | 'triangle';

export type Option = { id: string; text: string };

export type Question = {
  id: string;
  name: string;
  level: Level;
  type: QuestionType;
  difficulty: Difficulty;
  enabled: boolean;
  question: string;
  options: Option[];
  correctAnswer: string;
  multipleAnswers: string[];
  correctFeedback: string;
  wrongHint1: string;
  wrongHint2: string;
  concept: string;
  visual: string;
  from: ContainerKind;
  to: ContainerKind;
  targets: ContainerKind[];
  prediction: { question: string; options: Option[]; correctAnswer: string } | null;
  observation: { question: string; options: Option[]; correctAnswer: string } | null;
};

export type Settings = {
  levels: Level[];
  count: 3 | 4 | 5 | 'all';
  level4Enabled: boolean;
  difficulties: Difficulty[];
  speed: 'slow' | 'normal' | 'fast';
  sound: boolean;
};

export type Answer = {
  questionId: string;
  attempts: string[][];
  predictionAttempts: string[][];
  observationAttempts: string[][];
  stage: 'predict' | 'animating' | 'observe' | 'done';
  done: boolean;
};

export type Session = {
  id: string;
  started: string;
  finished?: string;
  questions: Question[];
  index: number;
  answers: Answer[];
  chosenTargets: ContainerKind[];
};

export type State = {
  questions: Question[];
  settings: Settings;
  active: Session | null;
  history: Session[];
};

export const defaults: Settings = {
  levels: [1, 2, 3, 4],
  count: 4,
  level4Enabled: true,
  difficulties: ['基礎', '一般', '挑戰'],
  speed: 'normal',
  sound: false,
};

export const roomNames: Record<Level, string> = {
  1: '液體偵察室',
  2: '液體搬家室',
  3: '容器迷惑室',
  4: '首席研究員挑戰',
};

export const roomIcons: Record<Level, string> = { 1: '💦', 2: '🥛', 3: '🧪', 4: '🧠' };

export const containerNames: Record<ContainerKind, string> = {
  cup: '一般透明杯',
  tall: '高瘦透明杯',
  bowl: '寬矮碗',
  bottle: '細長試管',
  triangle: '三角容器',
};

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function isCorrect(question: Question, ids: string[]): boolean {
  const wanted = question.type === 'multiple' ? question.multipleAnswers : [question.correctAnswer];
  return ids.length === wanted.length && wanted.every((id) => ids.includes(id));
}

export function draw(bank: Question[], settings: Settings): { questions: Question[]; notes: string[] } {
  const notes: string[] = [];
  const questions: Question[] = [];
  const activeLevels = settings.levels.filter((level) => level !== 4 || settings.level4Enabled);
  for (const level of activeLevels) {
    const pool = shuffle(bank.filter((question) => question.enabled && question.level === level && settings.difficulties.includes(question.difficulty)));
    const wanted = settings.count === 'all' ? pool.length : settings.count;
    if (pool.length < wanted) notes.push(`${roomNames[level]}目前只有 ${pool.length} 題可用，將使用全部可用題。`);
    questions.push(...pool.slice(0, wanted));
  }
  return { questions: structuredClone(questions), notes };
}

export function validateQuestion(question: Question): void {
  if (!question || !question.id || !question.name || !question.question || !question.correctFeedback || !question.wrongHint1 || !question.wrongHint2 || !question.concept) throw new Error('請填寫題目名稱、題目、概念、回饋及提示。');
  if (![1, 2, 3, 4].includes(question.level) || !['single', 'transfer', 'multiple'].includes(question.type) || !['基礎', '一般', '挑戰'].includes(question.difficulty) || typeof question.enabled !== 'boolean') throw new Error('題目分類格式不正確。');
  if (question.type === 'transfer') {
    const prediction = question.prediction;
    const observation = question.observation;
    if (!prediction || !observation || prediction.options.length < 2 || observation.options.length < 2 || !prediction.options.some((option) => option.id === prediction.correctAnswer) || !observation.options.some((option) => option.id === observation.correctAnswer)) throw new Error('搬家題需要有效的預測與觀察選項。');
    return;
  }
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => !option.id || !option.text.trim())) throw new Error('每題至少需要 2 個選項。');
  if (question.type === 'multiple') {
    if (!question.multipleAnswers.length || question.multipleAnswers.some((id) => !question.options.some((option) => option.id === id))) throw new Error('請設定有效的多選答案。');
  } else if (!question.options.some((option) => option.id === question.correctAnswer)) throw new Error('請設定有效的正確答案。');
}

export function validateSettings(settings: Settings): void {
  if (!settings.levels.length || settings.levels.some((level) => ![1, 2, 3, 4].includes(level)) || ![3, 4, 5, 'all'].includes(settings.count) || !settings.difficulties.length || settings.difficulties.some((difficulty) => !['基礎', '一般', '挑戰'].includes(difficulty))) throw new Error('請至少選擇一個研究室與一種難度。');
}

export function parseBackup(text: string): { version: number; questions: Question[]; settings: Settings } {
  const backup = JSON.parse(text) as { version: number; questions: Question[]; settings: Settings };
  if (backup.version !== 2 || !Array.isArray(backup.questions) || backup.questions.length > 3000) throw new Error('不支援的備份格式或題目過多。');
  backup.questions.forEach(validateQuestion);
  if (new Set(backup.questions.map((question) => question.id)).size !== backup.questions.length) throw new Error('題目 ID 重複。');
  validateSettings(backup.settings);
  return backup;
}
