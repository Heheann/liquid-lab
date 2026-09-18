import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaults, draw, isCorrect, parseBackup, roomIcons, roomNames, containerNames, validateQuestion, validateSettings, type Answer, type ContainerKind, type Difficulty, type Level, type Question, type Session, type Settings, type State } from './core';
import { seed } from './data';
import { read, save } from './store';
import { LiquidPourCanvas, pourDuration } from './LiquidPourCanvas';
import './style.css';

const levels: Level[] = [1, 2, 3, 4];
const visuals = ['water', 'milk', 'oil', 'juice', 'soup', 'soy', 'pencil'];
const visualNames: Record<string, string> = { water: '清水', milk: '牛奶', oil: '食用油', juice: '果汁', soup: '湯', soy: '醬油', pencil: '鉛筆' };

function emptyAnswer(question: Question): Answer { return { questionId: question.id, attempts: [], predictionAttempts: [], observationAttempts: [], stage: question.type === 'transfer' ? 'predict' : 'predict', done: false }; }
function answerText(question: Question, ids: string[], stage: 'main' | 'prediction' | 'observation' = 'main') {
  const choices = stage === 'prediction' ? question.prediction?.options : stage === 'observation' ? question.observation?.options : question.options;
  return ids.map((id) => choices?.find((option) => option.id === id)?.text ?? id).join('、');
}
function firstTryCorrect(question: Question, answer: Answer) {
  if (question.type === 'transfer') return answer.predictionAttempts.length === 1 && answer.observationAttempts.length === 1 && answer.predictionAttempts[0][0] === question.prediction?.correctAnswer && answer.observationAttempts[0][0] === question.observation?.correctAnswer;
  return !!answer.attempts[0] && isCorrect(question, answer.attempts[0]);
}

function App() {
  const [data, setData] = useState<State>({ questions: [], settings: structuredClone(defaults), active: null, history: [] });
  const [ready, setReady] = useState(false);
  const dataRef = useRef<State | null>(null);
  const [page, setPage] = useState<'home' | 'game' | 'result' | 'teacher'>('home');
  const [tab, setTab] = useState<'settings' | 'bank' | 'history' | 'backup'>('settings');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [animating, setAnimating] = useState(false);
  const [resultSession, setResultSession] = useState<Session | null>(null);
  const [editQuestion, setEditQuestion] = useState<Question | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ level: '', difficulty: '', enabled: '' });
  const lock = useRef(false);

  useEffect(() => { read().then((value) => { dataRef.current = value; setData(value); setReady(true); }).catch(() => setError('無法開啟本機保存空間，請重新整理網頁。')); }, []);
  useEffect(() => { dataRef.current = data; }, [data]);

  async function commit(next: State) {
    if (lock.current) return false;
    lock.current = true; setSaving(true);
    try { await save(next); dataRef.current = next; setData(next); return true; }
    catch { setError('資料尚未保存，請稍後再試。'); return false; }
    finally { lock.current = false; setSaving(false); }
  }

  if (!ready) return <main className="loading"><div className="lab-mark">◌</div><h1>液體研究所</h1><p>正在準備研究材料……</p></main>;
  const session = data.active;
  const question = session?.questions[session.index];
  const answer = session?.answers[session.index];

  async function startGame() {
    if (data.active && !data.active.finished && !confirm('重新開始會放棄目前尚未完成的研究，確定要重新抽題嗎？')) return;
    try {
      validateSettings(data.settings);
      const result = draw(data.questions, data.settings);
      if (!result.questions.length) { setError('目前沒有符合設定的題目，請到教師設定啟用題目。'); return; }
      if (result.notes.length && !confirm(`${result.notes.join('\n')}\n本局共 ${result.questions.length} 題，確定開始嗎？`)) return;
      const next: Session = { id: crypto.randomUUID(), started: new Date().toISOString(), questions: result.questions, index: 0, answers: result.questions.map(emptyAnswer), chosenTargets: result.questions.map((item) => item.to) };
      if (await commit({ ...data, active: next })) { setSelected([]); setResultSession(null); setPage('game'); }
    } catch (cause) { setError((cause as Error).message); }
  }
  function resumeGame() { setSelected([]); setPage('game'); }

  async function chooseTarget(kind: ContainerKind) {
    if (!session || !question || question.type !== 'transfer' || answer?.stage !== 'predict') return;
    const next = structuredClone(session); next.chosenTargets[next.index] = kind; await commit({ ...data, active: next });
  }
  async function finishAnimation() {
    const current = dataRef.current;
    if (!current?.active) return;
    const next = structuredClone(current.active); const currentAnswer = next.answers[next.index];
    if (currentAnswer?.stage === 'animating') { currentAnswer.stage = 'observe'; await commit({ ...current, active: next }); }
    setAnimating(false);
  }
  function startAnimationTimer() { setAnimating(true); window.setTimeout(() => void finishAnimation(), pourDuration(data.settings.speed)); }

  async function submit(input: string | string[]) {
    const ids = Array.isArray(input) ? input : [input];
    if (!session || !question || !answer || saving || answer.done || !ids.length || answer.stage === 'animating') return;
    const next = structuredClone(session); const current = next.answers[next.index];
    if (question.type === 'transfer') {
      if (current.stage === 'predict') {
        current.attempts.push(ids); current.predictionAttempts.push(ids);
        if (ids[0] === question.prediction?.correctAnswer) { current.stage = 'animating'; if (await commit({ ...data, active: next })) startAnimationTimer(); }
        else await commit({ ...data, active: next });
      } else if (current.stage === 'observe') {
        current.attempts.push(ids); current.observationAttempts.push(ids);
        if (ids[0] === question.observation?.correctAnswer) current.done = true, current.stage = 'done';
        if (await commit({ ...data, active: next })) setSelected(current.done ? ids : []);
      }
      return;
    }
    current.attempts.push(ids);
    if (isCorrect(question, ids)) current.done = true, current.stage = 'done';
    if (await commit({ ...data, active: next })) setSelected(current.done ? ids : []);
  }
  async function goNext() {
    if (!session || !answer?.done || saving) return;
    const next = structuredClone(session);
    if (next.index === next.questions.length - 1) {
      next.finished = new Date().toISOString();
      if (await commit({ ...data, active: next, history: [next, ...data.history] })) { setResultSession(next); setPage('result'); }
    } else { next.index += 1; if (await commit({ ...data, active: next })) setSelected([]); }
  }
  function toggleMultiple(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  async function importBackup(file: File) {
    try { const backup = parseBackup(await file.text()); if (!confirm(`備份包含 ${backup.questions.length} 題與遊戲設定，將取代目前題庫。確定匯入嗎？`)) return; if (await commit({ ...data, questions: backup.questions, settings: backup.settings })) setNotice('題庫與設定已匯入。'); }
    catch (cause) { setError(`匯入未完成：${(cause as Error).message}`); }
  }
  function exportBackup() { const blob = new Blob([JSON.stringify({ version: 2, questions: data.questions, settings: data.settings }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `液體研究所備份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 800); }

  return <>
    <header className="site-header"><button className="brand" onClick={() => setPage('home')}><span className="brand-drop">◆</span><span>液體研究所<small>LIQUID LAB</small></span></button><div className="header-actions"><span className="save-status">● 本機保存</span><button className="header-button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => setNotice('此瀏覽器未提供全螢幕模式。'))}>⛶ <span>全螢幕</span></button><button className="header-button" onClick={() => { setPage('teacher'); setEditQuestion(null); }}>⚙ 教師設定</button></div></header>
    {error && <div className="toast toast-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>關閉</button></div>}
    {notice && <div className="toast toast-ok" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>知道了</button></div>}
    {page === 'home' && <Home data={data} onStart={() => void startGame()} onResume={resumeGame} />}
    {page === 'game' && session && question && answer && <Game data={data} session={session} question={question} answer={answer} selected={selected} animating={animating} onSelect={question.type === 'multiple' ? toggleMultiple : (ids) => void submit(ids)} onSubmit={() => void submit(selected)} onNext={() => void goNext()} onTarget={(kind) => void chooseTarget(kind)} />}
    {page === 'result' && (resultSession || session) && <Result session={(resultSession || session)!} onRestart={() => void startGame()} onHome={() => setPage('home')} />}
    {page === 'teacher' && <Teacher data={data} tab={tab} setTab={setTab} editQuestion={editQuestion} setEditQuestion={setEditQuestion} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} onHome={() => setPage('home')} onCommit={commit} onNotice={setNotice} onError={setError} onExport={exportBackup} onImport={importBackup} onViewResult={(item) => { setResultSession(item); setPage('result'); }} />}
    {saving && <div className="saving" role="status">正在保存……</div>}
  </>;
}

function Home({ data, onStart, onResume }: { data: State; onStart: () => void; onResume: () => void }) {
  return <main className="home"><div className="eyebrow">115 學年度上學期 · 國中特教班 · 自然科學</div><section className="hero"><div className="hero-copy"><span className="kicker">WELCOME, RESEARCHER</span><h1>液體<br /><em>搬家大挑戰</em></h1><p className="hero-lede">看一看、倒一倒、想一想！<br />找出液體搬家的秘密。</p><p className="hero-body">歡迎小小研究員！<br />今天要研究：液體換了家，會發生什麼事？</p><button className="primary hero-start" onClick={onStart}>開始研究 <span>→</span></button>{data.active && !data.active.finished && <button className="resume" onClick={onResume}>繼續上次研究 · 第 {data.active.index + 1} 題 →</button>}<div className="session-info">{data.settings.levels.filter((level) => level !== 4 || data.settings.level4Enabled).map((level) => roomNames[level]).join(' → ')}<br />每關 {data.settings.count === 'all' ? '全部' : `${data.settings.count} 題`} · 不限時間</div></div><div className="hero-lab"><span className="lab-label">液體樣本 / 01</span><div className="hero-beaker"><div className="hero-liquid" /></div><div className="hero-stream" /><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-note"><b>LIQUID</b><span>沒有固定形狀</span></div></div></section><section className="room-list" aria-label="四個研究室">{levels.map((level) => <article key={level} className={level === 2 ? 'featured-room' : ''}><span className="room-icon">{roomIcons[level]}</span><div><small>LEVEL 0{level}</small><h2>{roomNames[level]}</h2><p>{['辨認會流動的液體', '先預測，再看倒液體動畫', '解開水位高度的迷思', '用證據完成多步推理'][level - 1]}</p></div></article>)}</section><footer>液體沒有固定形狀，會跟著容器改變形狀。</footer></main>;
}

function Game({ data, session, question, answer, selected, animating, onSelect, onSubmit, onNext, onTarget }: { data: State; session: Session; question: Question; answer: Answer; selected: string[]; animating: boolean; onSelect: (ids: string) => void; onSubmit: () => void; onNext: () => void; onTarget: (kind: ContainerKind) => void }) {
  const transfer = question.type === 'transfer';
  const stage = transfer ? answer.stage : 'main';
  const activeOptions = transfer ? stage === 'observe' ? question.observation!.options : question.prediction!.options : question.options;
  const activeQuestion = transfer ? stage === 'observe' ? question.observation!.question : question.prediction!.question : question.question;
  const activeCorrect = transfer ? stage === 'observe' ? question.observation!.correctAnswer : question.prediction!.correctAnswer : question.correctAnswer;
  const attempts = transfer ? stage === 'observe' ? answer.observationAttempts.length : answer.predictionAttempts.length : answer.attempts.length;
  const correctOptions = activeOptions.filter((option) => transfer ? option.id === activeCorrect : question.type === 'multiple' ? question.multipleAnswers.includes(option.id) : option.id === question.correctAnswer);
  const target = session.chosenTargets[session.index] || question.to;
  const reveal = attempts >= 3 && !answer.done && !animating;
  const retryTitle = reveal ? '🔍 一起看看答案' : '🤔 再想想看！';
  const retryHint = reveal ? `答案是「${correctOptions.map((option) => option.text).join('、')}」。${question.correctFeedback} 請再選一次正確答案。` : attempts === 1 ? question.wrongHint1 : question.wrongHint2;
  return <main className="game-shell"><div className="game-bar"><span className="kicker">{roomIcons[question.level]} {roomNames[question.level]}</span><span>研究進度 <b>{session.index + 1}</b> / {session.questions.length}</span></div><div className="progress"><span style={{ width: `${((session.index + 1) / session.questions.length) * 100}%` }} /></div><div className="game-heading"><small>{question.id} · {question.concept}</small><h1>{stage === 'animating' ? '請觀察倒液體動畫……' : activeQuestion}</h1>{question.type === 'multiple' && <p>可選擇多個答案，選好後按「確認答案」。</p>}{transfer && stage === 'predict' && <p>先選一個目的容器，再回答你的預測。</p>}</div><div className={`game-layout ${transfer ? 'transfer-layout' : ''}`}><div className="visual-column">{transfer ? <TransferBoard question={question} target={target} selectedTarget={target} animating={animating} completed={stage === 'observe' || stage === 'done'} speed={data.settings.speed} onTarget={onTarget} /> : <Specimen visual={question.visual} label={question.name} />}{transfer && stage === 'observe' && <div className="observation-tag">動畫完成 · 現在說說你的觀察</div>}</div><div className="answer-column">{stage !== 'animating' && <div className={`options ${question.type === 'multiple' ? 'multiple-options' : ''}`}>{activeOptions.map((option, index) => { const chosen = selected.includes(option.id); const correct = correctOptions.some((item) => item.id === option.id); return <button key={option.id} className={`option ${chosen ? 'selected' : ''} ${reveal && correct ? 'answer-key' : ''}`} disabled={answer.done || savingDisabled(answer, animating)} aria-pressed={question.type === 'multiple' ? chosen : undefined} onClick={() => question.type === 'multiple' ? onSelect(option.id) : onSelect(option.id)}><span className="option-letter">{question.type === 'multiple' ? chosen ? '✓' : '＋' : String.fromCharCode(65 + index)}</span><span>{option.text}</span></button>; })}</div>}{question.type === 'multiple' && !answer.done && stage !== 'animating' && <button className="primary confirm" disabled={!selected.length} onClick={onSubmit}>確認答案 →</button>}{stage === 'animating' && <div className="watch-panel"><strong>看一看</strong><p>水流正在進入「{containerNames[target]}」。注意水的形狀和水面。</p></div>}{answer.done ? <div className="feedback success" role="status"><h2>✓ 觀察正確！</h2><p>{question.correctFeedback}</p><button className="primary" onClick={onNext}>{session.index === session.questions.length - 1 ? '完成研究' : '下一題'} →</button></div> : attempts > 0 && stage !== 'animating' ? <div className="feedback retry" role="status"><h2>{retryTitle}</h2><p>{retryHint}</p></div> : stage !== 'animating' ? <p className="gentle">慢慢觀察，準備好再選答案。</p> : null}</div></div></main>;
}
function savingDisabled(answer: Answer, animating: boolean) { return answer.stage === 'animating' || animating; }

function TransferBoard({ question, target, selectedTarget, animating, completed, speed, onTarget }: { question: Question; target: ContainerKind; selectedTarget: ContainerKind; animating: boolean; completed: boolean; speed: Settings['speed']; onTarget: (kind: ContainerKind) => void }) {
  const [sourceSelected, setSourceSelected] = useState(false);
  useEffect(() => setSourceSelected(false), [question.id]);
  const phase = animating ? 'pouring' : completed ? 'complete' : 'ready';
  return <div className={`transfer-board ${animating ? 'is-pouring' : ''}`}><div className="pour-stage"><LiquidPourCanvas source={question.from} target={target} liquid={question.visual} phase={phase} speed={speed} /></div>{!animating && !completed && <div className="pour-controls"><button className={`source-select ${sourceSelected ? 'chosen' : ''}`} onPointerDown={() => setSourceSelected(true)} onClick={() => setSourceSelected(true)} aria-pressed={sourceSelected}>① 點選原杯中的液體</button><div className="transfer-targets"><p>{sourceSelected ? '② 已選取液體，請點目的容器' : '或直接選擇目的容器'}</p><div>{question.targets.map((kind) => <button key={kind} className={`target-button ${kind === selectedTarget ? 'chosen' : ''}`} onPointerDown={() => setSourceSelected(true)} onClick={() => { onTarget(kind); setSourceSelected(false); }} aria-pressed={kind === selectedTarget}><ContainerArt kind={kind} filled={false} /><span>{containerNames[kind]}</span></button>)}</div></div></div>}<div className="transfer-instruction">{animating ? '液體正在受重力落下，碰到接收容器後才會累積。' : completed ? '液體已進入新容器，液面逐漸恢復平靜。' : '可用手指、滑鼠或觸控筆選擇目的容器。'}</div></div>;
}

function ContainerArt({ kind, liquid = 'water', filled = true }: { kind: ContainerKind; liquid?: string; filled?: boolean }) { return <div className={`container-art ${kind}`} aria-hidden="true"><div className={`container-liquid liquid-${liquid} ${filled ? '' : 'empty'}`} /></div>; }
function Specimen({ visual, label }: { visual: string; label: string }) { return <figure className="specimen"><div className="specimen-stage">{visual.startsWith('data:') ? <img src={visual} alt="" /> : visual === 'pencil' ? <div className="pencil-object">✎</div> : <div className={`large-liquid large-${visual}`}><span /></div>}</div><figcaption>{label}</figcaption></figure>; }

function Result({ session, onRestart, onHome }: { session: Session; onRestart: () => void; onHome: () => void }) { const shown = [1, 2, 3, 4].filter((level) => session.questions.some((question) => question.level === level)); return <main className="result-page"><span className="kicker">研究完成 · MISSION COMPLETE</span><h1>🎓 液體研究任務完成！</h1><p>你已經用觀察、比較和證據，完成這一局研究。</p><div className="result-stats">{shown.map((level) => { const entries = session.questions.map((question, index) => ({ question, answer: session.answers[index] })).filter((entry) => entry.question.level === level); const score = entries.filter((entry) => firstTryCorrect(entry.question, entry.answer)).length; return <article key={level}><span>{roomIcons[level as Level]} {['', '液體辨識力', '搬家觀察力', '容器判斷力', '科學推理力'][level]}</span><strong>{score}<small> / {entries.length}</small></strong><p>第一次就答對</p></article>; })}</div><div className="result-actions"><button className="primary" onClick={onRestart}>再玩一次 →</button><button onClick={onHome}>回首頁</button></div><details className="records"><summary>📋 本局研究紀錄</summary>{session.questions.map((question, index) => { const answer = session.answers[index]; const attempts = question.type === 'transfer' ? [...answer.predictionAttempts, ...answer.observationAttempts] : answer.attempts; return <article key={question.id}><div><strong>{answer.done ? '✓' : '○'} {question.id} · {question.name}</strong><span>{question.concept}</span></div><p>{question.question}</p><ol>{attempts.map((ids, attemptIndex) => <li key={`${question.id}-${attemptIndex}`}>第 {attemptIndex + 1} 次：{answerText(question, ids, question.type === 'transfer' ? attemptIndex < answer.predictionAttempts.length ? 'prediction' : 'observation' : 'main')}{attemptIndex === attempts.length - 1 && answer.done ? ' ✓' : ''}</li>)}</ol><small>答錯次數：{Math.max(0, attempts.length - 1)} · 最後是否答對：{answer.done ? '是' : '否'} · 所屬概念：{question.concept}</small></article>; })}</details></main>; }

function Teacher({ data, tab, setTab, editQuestion, setEditQuestion, search, setSearch, filters, setFilters, onHome, onCommit, onNotice, onError, onExport, onImport, onViewResult }: { data: State; tab: 'settings' | 'bank' | 'history' | 'backup'; setTab: (tab: 'settings' | 'bank' | 'history' | 'backup') => void; editQuestion: Question | null; setEditQuestion: (question: Question | null) => void; search: string; setSearch: (value: string) => void; filters: { level: string; difficulty: string; enabled: string }; setFilters: (value: { level: string; difficulty: string; enabled: string }) => void; onHome: () => void; onCommit: (next: State) => Promise<boolean>; onNotice: (value: string) => void; onError: (value: string) => void; onExport: () => void; onImport: (file: File) => void; onViewResult: (session: Session) => void }) {
  const filtered = useMemo(() => data.questions.filter((question) => `${question.id}${question.name}${question.question}`.includes(search) && (!filters.level || String(question.level) === filters.level) && (!filters.difficulty || question.difficulty === filters.difficulty) && (!filters.enabled || String(question.enabled) === filters.enabled)), [data.questions, search, filters]);
  async function patchSettings(patch: Partial<Settings>) { await onCommit({ ...data, settings: { ...data.settings, ...patch } }); }
  function createQuestion() { setEditQuestion({ id: crypto.randomUUID(), name: '新研究題', level: 1, type: 'single', difficulty: '基礎', enabled: true, question: '', options: [{ id: 'o0', text: '' }, { id: 'o1', text: '' }], correctAnswer: 'o0', multipleAnswers: [], correctFeedback: '', wrongHint1: '', wrongHint2: '', concept: '液體特徵', visual: 'water', from: 'cup', to: 'cup', targets: ['cup'], prediction: null, observation: null }); }
  return <main className="teacher-page"><div className="teacher-title"><div><span className="kicker">教師工作區 · TEACHER DESK</span><h1>準備今天的研究</h1></div><button onClick={onHome}>回首頁</button></div><nav className="teacher-tabs">{([['settings', '遊戲設定'], ['bank', '題庫管理'], ['history', '學習紀錄'], ['backup', '匯入／匯出']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setEditQuestion(null); }}>{label}</button>)}</nav>{tab === 'settings' && <SettingsPanel settings={data.settings} onPatch={patchSettings} />}{tab === 'bank' && (editQuestion ? <Editor question={editQuestion} onCancel={() => setEditQuestion(null)} onSave={async (question) => { try { validateQuestion(question); const questions = data.questions.some((item) => item.id === question.id) ? data.questions.map((item) => item.id === question.id ? question : item) : [...data.questions, question]; if (await onCommit({ ...data, questions })) { setEditQuestion(null); onNotice('題目已保存。'); } } catch (cause) { onError((cause as Error).message); } }} /> : <section className="bank-panel"><div className="section-heading"><div><h2>題庫管理</h2><p>共 {data.questions.length} 題 · 啟用狀態與修改內容會保存在本機。</p></div><button className="primary" onClick={createQuestion}>＋ 新增題目</button></div><div className="filters"><input aria-label="搜尋題目" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋題目、概念或內容……" /><select aria-label="關卡篩選" value={filters.level} onChange={(event) => setFilters({ ...filters, level: event.target.value })}><option value="">全部關卡</option>{levels.map((level) => <option key={level} value={level}>{roomNames[level]}</option>)}</select><select aria-label="難度篩選" value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}><option value="">全部難度</option>{(['基礎', '一般', '挑戰'] as Difficulty[]).map((item) => <option key={item}>{item}</option>)}</select><select aria-label="狀態篩選" value={filters.enabled} onChange={(event) => setFilters({ ...filters, enabled: event.target.value })}><option value="">全部狀態</option><option value="true">啟用</option><option value="false">停用</option></select></div><div className="bank-table-wrap"><table><thead><tr><th>編號</th><th>題目</th><th>關卡／難度</th><th>狀態</th><th>操作</th></tr></thead><tbody>{filtered.map((question) => <tr key={question.id}><td><b>{question.id}</b></td><td><strong>{question.name}</strong><p>{question.question}</p><small>{question.type === 'transfer' ? '預測 → 動畫 → 觀察' : question.type === 'multiple' ? '多選' : '單選'}</small></td><td>{roomNames[question.level]}<br />{question.difficulty}</td><td>{question.enabled ? '啟用' : '停用'}</td><td><div className="table-actions"><button onClick={() => setEditQuestion(structuredClone(question))}>編輯</button><button onClick={() => void onCommit({ ...data, questions: data.questions.map((item) => item.id === question.id ? { ...item, enabled: !item.enabled } : item) })}>{question.enabled ? '停用' : '啟用'}</button><button className="danger" onClick={() => { if (confirm(`確定刪除「${question.name}」嗎？`)) void onCommit({ ...data, questions: data.questions.filter((item) => item.id !== question.id) }); }}>刪除</button></div></td></tr>)}</tbody></table></div></section>)}{tab === 'history' && <History history={data.history} onView={onViewResult} />}{tab === 'backup' && <Backup data={data} onExport={onExport} onImport={onImport} onReset={async () => { if (confirm('第一次確認：恢復 30 題預設題庫？') && confirm('第二次確認：自訂題目將被移除，設定與紀錄會保留。')) { await onCommit({ ...data, questions: seed() }); onNotice('已恢復 30 題預設題庫。'); } }} />}</main>;
}

function SettingsPanel({ settings, onPatch }: { settings: Settings; onPatch: (patch: Partial<Settings>) => void }) { const toggleLevel = (level: Level) => { const next = settings.levels.includes(level) ? settings.levels.filter((item) => item !== level) : [...settings.levels, level].sort() as Level[]; if (!next.length) return; onPatch({ levels: next }); }; return <section className="settings-panel"><div className="setting-block"><h2>研究室開關</h2><p>選擇本次要使用的關卡。Level 4 預設開啟，可在學生程度較需要時關閉。</p><div className="setting-buttons">{levels.map((level) => <button key={level} className={settings.levels.includes(level) && (level !== 4 || settings.level4Enabled) ? 'chosen' : ''} aria-pressed={settings.levels.includes(level) && (level !== 4 || settings.level4Enabled)} onClick={() => { if (settings.levels.length === 1 && settings.levels.includes(level)) return; if (level === 4) onPatch({ level4Enabled: !settings.level4Enabled, levels: settings.level4Enabled ? settings.levels.filter((item) => item !== 4) : [...settings.levels, 4].sort() as Level[] }); else toggleLevel(level); }}>{roomIcons[level]} {roomNames[level]}<small>{level === 4 ? settings.level4Enabled ? 'ON' : 'OFF' : settings.levels.includes(level) ? 'ON' : 'OFF'}</small></button>)}</div></div><div className="setting-block"><h2>每關抽題數</h2><div className="setting-buttons compact">{([3, 4, 5, 'all'] as const).map((count) => <button key={count} className={settings.count === count ? 'chosen' : ''} aria-pressed={settings.count === count} onClick={() => onPatch({ count })}>{count === 'all' ? '全部' : `${count} 題`}</button>)}</div></div><div className="setting-block"><h2>難度</h2><div className="setting-buttons compact">{(['基礎', '一般', '挑戰'] as Difficulty[]).map((difficulty) => <button key={difficulty} className={settings.difficulties.includes(difficulty) ? 'chosen' : ''} onClick={() => { const next = settings.difficulties.includes(difficulty) ? settings.difficulties.filter((item) => item !== difficulty) : [...settings.difficulties, difficulty]; if (next.length) onPatch({ difficulties: next }); }}>{settings.difficulties.includes(difficulty) ? '✓ ' : ''}{difficulty}</button>)}</div></div><div className="setting-block"><h2>倒液體動畫速度</h2><div className="setting-buttons compact">{([['slow', '慢'], ['normal', '正常'], ['fast', '快']] as const).map(([speed, label]) => <button key={speed} className={settings.speed === speed ? 'chosen' : ''} onClick={() => onPatch({ speed })}>{label}</button>)}</div><p className="setting-note">動畫保留足夠觀察時間，不會快到看不清楚。</p></div><div className="setting-block inline-setting"><div><h2>答對音效</h2><p>柔和短音；答錯不播放刺耳音效。</p></div><button className={settings.sound ? 'chosen' : ''} onClick={() => onPatch({ sound: !settings.sound })}>{settings.sound ? '開啟 ON' : '關閉 OFF'}</button></div></section>; }

function History({ history, onView }: { history: Session[]; onView: (session: Session) => void }) { return <section className="history-panel"><h2>已完成的研究</h2>{history.length === 0 ? <p>完成一局後，研究紀錄會保存在這裡。</p> : history.map((session) => <div className="history-row" key={session.id}><span>{new Date(session.started).toLocaleString('zh-TW')} · {session.questions.length} 題</span><button onClick={() => onView(session)}>查看紀錄</button></div>)}</section>; }
function Backup({ data, onExport, onImport, onReset }: { data: State; onExport: () => void; onImport: (file: File) => void; onReset: () => void }) { return <section className="backup-panel"><h2>備份與還原</h2><p>匯出會包含題庫、教師設定與自訂圖片；學習紀錄保存在目前瀏覽器。</p><div className="backup-actions"><button className="primary" onClick={onExport}>📤 匯出題庫與設定</button><label className="file-button">📥 匯入題庫與設定<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} /></label></div><hr /><h3>恢復預設題庫</h3><p>目前題庫共有 {data.questions.length} 題。恢復後會回到完整 30 題，並保留設定與學習紀錄。</p><button className="danger" onClick={onReset}>恢復 30 題預設題庫</button></section>; }

function Editor({ question, onCancel, onSave }: { question: Question; onCancel: () => void; onSave: (question: Question) => void }) { const [draft, setDraft] = useState(structuredClone(question)); const update = <K extends keyof Question>(key: K, value: Question[K]) => setDraft((current) => ({ ...current, [key]: value })); const upload = (file: File) => { const reader = new FileReader(); reader.onload = () => update('visual', String(reader.result)); reader.readAsDataURL(file); }; const setType = (type: Question['type']) => { if (type === 'transfer') return; update('type', type); if (type === 'multiple') update('multipleAnswers', []); else update('correctAnswer', draft.options[0]?.id || 'o0'); }; return <section className="editor-panel"><div className="section-heading"><div><span className="kicker">題目編輯器</span><h2>{draft.id.startsWith('Q') ? `編輯 ${draft.id}` : '新增研究題'}</h2></div><button onClick={onCancel}>取消</button></div><label>題目名稱<input value={draft.name} onChange={(event) => update('name', event.target.value)} /></label><label>題目文字<textarea value={draft.question} onChange={(event) => update('question', event.target.value)} /></label><div className="editor-grid"><label>研究室<select value={draft.level} onChange={(event) => update('level', Number(event.target.value) as Level)}>{levels.map((level) => <option key={level} value={level}>{roomNames[level]}</option>)}</select></label><label>難度<select value={draft.difficulty} onChange={(event) => update('difficulty', event.target.value as Difficulty)}>{(['基礎', '一般', '挑戰'] as Difficulty[]).map((item) => <option key={item}>{item}</option>)}</select></label><label>題型<select value={draft.type} onChange={(event) => setType(event.target.value as Question['type'])}><option value="single">單選／對錯</option><option value="multiple">多選</option><option value="transfer" disabled>搬家題（保留原流程）</option></select></label><label>狀態<select value={String(draft.enabled)} onChange={(event) => update('enabled', event.target.value === 'true')}><option value="true">啟用</option><option value="false">停用</option></select></label></div><div className="visual-editor"><div className="visual-preview"><Specimen visual={draft.visual} label="題目圖片預覽" /></div><div><label>預設圖片<select value={visuals.includes(draft.visual) ? draft.visual : ''} onChange={(event) => update('visual', event.target.value)}><option value="">自訂圖片</option>{visuals.map((visual) => <option key={visual} value={visual}>{visualNames[visual]}</option>)}</select></label><label className="file-button">更換圖片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.currentTarget.value = ''; }} /></label></div></div>{draft.type !== 'transfer' && <><h3>選項與正確答案</h3>{draft.options.map((option, index) => <div className="edit-option" key={option.id}><button type="button" className={(draft.type === 'multiple' ? draft.multipleAnswers : [draft.correctAnswer]).includes(option.id) ? 'chosen' : ''} onClick={() => draft.type === 'multiple' ? update('multipleAnswers', draft.multipleAnswers.includes(option.id) ? draft.multipleAnswers.filter((id) => id !== option.id) : [...draft.multipleAnswers, option.id]) : update('correctAnswer', option.id)}>{(draft.type === 'multiple' ? draft.multipleAnswers : [draft.correctAnswer]).includes(option.id) ? '✓' : '○'}</button><input aria-label={`選項 ${index + 1}`} value={option.text} onChange={(event) => update('options', draft.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item))} /><button type="button" disabled={draft.options.length <= 2} onClick={() => update('options', draft.options.filter((item) => item.id !== option.id))}>移除</button></div>)}<button type="button" onClick={() => update('options', [...draft.options, { id: `o${draft.options.length}`, text: '' }])}>＋ 增加選項</button></>}{([['correctFeedback', '答對回饋'], ['wrongHint1', '第一次提示'], ['wrongHint2', '第二次提示'], ['concept', '所屬概念']] as const).map(([key, label]) => <label key={key}>{label}<textarea value={draft[key]} onChange={(event) => update(key, event.target.value)} /></label>)}<div className="editor-actions"><button className="primary" onClick={() => onSave(draft)}>保存題目</button><button onClick={onCancel}>取消</button></div></section>; }

createRoot(document.getElementById('root')!).render(<App />);
