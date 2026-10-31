/**
 * Content lint: the rules a schema cannot express, checked across lessons, question banks,
 * the misconception register, the glossary and the video list. Reports every problem, then
 * exits 1 if there were any.
 *
 *   npm run lint:content
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'src/content');
const problems: string[] = [];
const fail = (where: string, msg: string) => problems.push(`${where}: ${msg}`);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');
const yamlFile = <T>(p: string): T => parse(readFileSync(p, 'utf8')) as T;

/* ------------------------------------------------------------------ load */

interface Choice {
  text: string;
  correct?: boolean;
  feedback: string;
  misconception?: string;
}
interface Question {
  id: string;
  type: string;
  objectives: string[];
  qualitative?: boolean;
  prompt: string;
  choices?: Choice[];
  reasons?: Choice[];
  commonWrong?: { misconception?: string; feedback: string }[];
  wrong?: { misconception?: string; feedback: string }[];
  [k: string]: unknown;
}
interface Lesson {
  file: string;
  id: string;
  objectives: string[];
  videos: string[];
  figures: string[];
  body: string;
  raw: string;
}

const lessons: Lesson[] = walk(join(CONTENT, 'lessons'))
  .filter((f) => f.endsWith('.mdx'))
  .map((file) => {
    const raw = readFileSync(file, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!m) {
      fail(rel(file), 'no frontmatter');
      return null;
    }
    const fm = parse(m[1]) as { id: string; objectives: { id: string }[]; videos?: string[]; figures?: string[] };
    return {
      file: rel(file),
      id: fm.id,
      objectives: fm.objectives.map((o) => o.id),
      videos: fm.videos ?? [],
      figures: fm.figures ?? [],
      body: m[2],
      raw,
    };
  })
  .filter((l): l is Lesson => l !== null);

const banks = readdirSync(join(CONTENT, 'questions'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({ file: `src/content/questions/${f}`, data: yamlFile<{ questions: Question[] }>(join(CONTENT, 'questions', f)) }));
const questions = banks.flatMap((b) => b.data.questions.map((q) => ({ q, file: b.file })));

const misconceptions = yamlFile<{ id: string; remedy: { lesson: string; anchor?: string } }[]>(join(CONTENT, 'misconceptions.yaml'));
const glossary = yamlFile<{ id: string; term: string; reject?: string[] }[]>(join(CONTENT, 'glossary.yaml'));
const videos = yamlFile<{ id: string }[]>(join(CONTENT, 'videos.yaml'));

const lessonById = new Map(lessons.map((l) => [l.id, l]));
const objectiveIds = new Set(lessons.flatMap((l) => l.objectives));
const mcIds = new Set(misconceptions.map((m) => m.id));
const videoIds = new Set(videos.map((v) => v.id));
const glossaryIds = new Set(glossary.map((g) => g.id));

/* ------------------------------------------------------------- questions */

const seenQ = new Set<string>();
const detected = new Set<string>();
for (const { q, file } of questions) {
  const w = `${file} ${q.id}`;
  if (seenQ.has(q.id)) fail(w, 'duplicate question id');
  seenQ.add(q.id);
  const lessonOfId = q.id.match(/^Q-(\d+\.\d+)-/)?.[1];
  for (const o of q.objectives) {
    if (!objectiveIds.has(o)) fail(w, `objective ${o} is not declared by any lesson`);
    if (lessonOfId && !o.startsWith(`OBJ-${lessonOfId}-`)) fail(w, `objective ${o} belongs to another lesson than the id prefix ${lessonOfId}`);
  }
  const tags = [
    ...(q.choices ?? []),
    ...(q.reasons ?? []),
    ...(q.commonWrong ?? []),
    ...(q.wrong ?? []),
  ].flatMap((c) => (c.misconception ? [c.misconception] : []));
  for (const t of tags) {
    if (!mcIds.has(t)) fail(w, `misconception ${t} is not in misconceptions.yaml`);
    detected.add(t);
  }
  const correctCount = (cs?: Choice[]) => (cs ?? []).filter((c) => c.correct).length;
  if ((q.type === 'mc' || q.type === 'twotier') && correctCount(q.choices) !== 1) fail(w, 'needs exactly one correct choice');
  if (q.type === 'twotier' && correctCount(q.reasons) !== 1) fail(w, 'needs exactly one correct reason');
  if (q.type === 'multi' && correctCount(q.choices) < 1) fail(w, 'needs at least one correct choice');
  for (const c of [...(q.choices ?? []), ...(q.reasons ?? [])]) {
    if (!c.feedback?.trim()) fail(w, `choice "${c.text}" has no feedback`);
  }
}

/* ------------------------------------------------- objectives coverage */

for (const l of lessons) {
  for (const o of l.objectives) {
    const qs = questions.filter(({ q }) => q.objectives.includes(o)).map(({ q }) => q);
    if (qs.length < 3) fail(l.file, `objective ${o} has ${qs.length} questions (needs ≥ 3)`);
    else if (!qs.some((q) => q.qualitative)) fail(l.file, `objective ${o} has no qualitative question`);
  }
}

/* ------------------------------------------------------- misconceptions */

for (const m of misconceptions) {
  if (!detected.has(m.id)) fail('src/content/misconceptions.yaml', `${m.id} is not detected by any distractor`);
  const target = lessonById.get(m.remedy.lesson);
  if (!target) fail('src/content/misconceptions.yaml', `${m.id} remedy points at lesson ${m.remedy.lesson}, which is not written`);
  else if (m.remedy.anchor && !target.figures.includes(m.remedy.anchor) && !target.body.includes(`id="${m.remedy.anchor}"`)) {
    fail('src/content/misconceptions.yaml', `${m.id} remedy anchor #${m.remedy.anchor} is not in lesson ${m.remedy.lesson}`);
  }
}

/* -------------------------------------------------------------- lessons */

const TEMPLATE = ['Hook', 'Predict', 'Explore', 'Explain', 'Example', 'Check', 'Watch', 'Summary'];
for (const l of lessons) {
  const blocks = [...l.body.matchAll(/<(Hook|Predict|Explore|Explain|Example|Check|Watch|Summary)\b/g)].map((m) => m[1]);
  for (const b of TEMPLATE) if (!blocks.includes(b)) fail(l.file, `lesson template: missing <${b}>`);
  let last = -1;
  for (const b of blocks) {
    const i = TEMPLATE.indexOf(b);
    if (i < last) fail(l.file, `lesson template: <${b}> comes after <${TEMPLATE[last]}>`);
    last = Math.max(last, i);
  }

  const spreadFigs = [...l.body.matchAll(/<Spread[\s\S]*?\bfig="([^"]+)"/g)].map((m) => m[1]);
  for (const f of spreadFigs) if (!l.figures.includes(f)) fail(l.file, `figure ${f} is not listed in frontmatter figures`);
  for (const f of l.figures) if (!spreadFigs.includes(f)) fail(l.file, `frontmatter figure ${f} has no <Spread>`);
  for (const m of l.body.matchAll(/<Step\s+fig="([^"]+)"/g)) {
    if (!spreadFigs.includes(m[1])) fail(l.file, `<Step fig="${m[1]}"> drives a figure that is not in this lesson`);
  }

  for (const m of l.body.matchAll(/<Watch\s+id="([^"]+)"/g)) {
    if (!videoIds.has(m[1])) fail(l.file, `<Watch id="${m[1]}">: not in videos.yaml`);
    if (!l.videos.includes(m[1])) fail(l.file, `<Watch id="${m[1]}"> is not listed in frontmatter videos`);
  }
  for (const v of l.videos) if (!videoIds.has(v)) fail(l.file, `frontmatter video ${v} is not in videos.yaml`);

  for (const m of l.body.matchAll(/<Check[\s\S]*?ids=\{\[([^\]]*)\]\}/g)) {
    for (const id of m[1].match(/'([^']+)'/g) ?? []) {
      const qid = id.slice(1, -1);
      if (!seenQ.has(qid)) fail(l.file, `<Check> asks for unknown question ${qid}`);
    }
  }
  for (const m of l.body.matchAll(/<Term\s+id="([^"]+)"/g)) {
    if (!glossaryIds.has(m[1])) fail(l.file, `<Term id="${m[1]}"> is not in glossary.yaml`);
  }

  // JS strings in MDX props turn "\f", "\v", "\t"… into control characters: TeX there must be doubled
  for (const m of l.body.matchAll(/=\{[\s\S]*?\}\}?/g)) {
    if (/'[^']*\\[a-z][^']*'/.test(m[0])) fail(l.file, `TeX backslash inside a JS string prop (${m[0].slice(0, 40)}…): use a "..." attribute or \\\\`);
  }
}

/* ------------------------------------------------------------- glossary */

const texts = [
  ...lessons.map((l) => ({ where: l.file, text: l.body })),
  ...questions.map(({ q, file }) => ({ where: `${file} ${q.id}`, text: JSON.stringify(q) })),
];
for (const g of glossary) {
  for (const bad of g.reject ?? []) {
    for (const t of texts) if (t.text.includes(bad)) fail(t.where, `"${bad}": the course spells this "${g.term}"`);
  }
}

/* --------------------------------------------------------------- report */

if (problems.length) {
  console.error(`lint-content: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`lint-content: ok (${lessons.length} lessons, ${questions.length} questions, ${misconceptions.length} misconceptions, ${glossary.length} terms, ${videos.length} videos)`);
