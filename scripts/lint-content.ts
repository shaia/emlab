/**
 * Content lint: the rules a schema cannot express, checked across lessons, question banks,
 * the misconception register, the glossary and the video list. Reports every problem, then
 * exits 1 if there were any.
 *
 *   npm run lint:content                       # the whole course (CI)
 *   npx tsx scripts/lint-content.ts --file <p> # problems in one file only (the edit hook)
 *
 * --file skips completeness checks ("≥ 3 questions per objective", "every misconception is
 * detected", "every template part is present"): a lesson being written is incomplete by design,
 * and the hook must not block each save. CI runs the full lint.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'src/content');
const fileArg = process.argv.indexOf('--file');
const onlyFile = fileArg > 0 ? process.argv[fileArg + 1]?.replaceAll('\\', '/') : null;
const problems: string[] = [];
const fail = (where: string, msg: string, completeness = false) => {
  if (onlyFile && (completeness || !where.startsWith(onlyFile))) return;
  problems.push(`${where}: ${msg}`);
};

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
  /** Bagrut questions: lettered parts, each a question-like object */
  parts?: Part[];
  diagram?: string;
  diagramAlt?: string;
  [k: string]: unknown;
}
interface Part extends Omit<Question, 'id' | 'parts' | 'prompt'> {
  label: string;
  prompt: string;
  points: number;
  pendingObjectives?: string[];
  rubric?: { text: string; weight?: number }[];
  solution?: { kind: string; text: string }[];
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

const banks = walk(join(CONTENT, 'questions'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({ file: rel(f), data: yamlFile<{ questions: Question[] }>(f) }));
const questions = banks.flatMap((b) => (b.data?.questions ?? []).map((q) => ({ q, file: b.file })));

/** A per-lesson YAML folder (`misconceptions/1-5.yaml`, …): every entry, tagged with its file. */
const yamlDir = <T>(name: string): (T & { file: string })[] =>
  readdirSync(join(CONTENT, name))
    .filter((f) => f.endsWith('.yaml'))
    .flatMap((f) => (yamlFile<T[]>(join(CONTENT, name, f)) ?? []).map((e) => ({ ...e, file: `src/content/${name}/${f}` })));

const misconceptions = yamlDir<{ id: string; remedy: { lesson: string; anchor?: string } }>('misconceptions');
const glossary = yamlDir<{ id: string; term: string; reject?: string[] }>('glossary');
const videos = yamlDir<{ id: string }>('videos');
for (const [name, list] of [['misconceptions', misconceptions], ['glossary', glossary], ['videos', videos]] as const) {
  const seen = new Map<string, string>();
  for (const e of list) {
    if (seen.has(e.id)) fail(e.file, `${name} id ${e.id} is also defined in ${seen.get(e.id)}`);
    seen.set(e.id, e.file);
  }
}

const lessonById = new Map(lessons.map((l) => [l.id, l]));
const objectiveIds = new Set(lessons.flatMap((l) => l.objectives));
const mcIds = new Set(misconceptions.map((m) => m.id));
const videoIds = new Set(videos.map((v) => v.id));
const glossaryIds = new Set(glossary.map((g) => g.id));

/* ------------------------------------------------------------- questions */

const seenQ = new Set<string>();
const detected = new Set<string>();
const pending: string[] = [];
/** Every gradable unit: a question, or one part of a Bagrut question. */
const units = questions.flatMap(({ q, file }) =>
  q.type === 'bagrut'
    ? (q.parts ?? []).map((p) => ({ q: { ...p, id: `${q.id}/${p.label}`, type: p.type } as Question, file, part: p, parent: q }))
    : [{ q, file, part: null as Part | null, parent: null as Question | null }],
);
for (const { q, file } of questions) {
  if (seenQ.has(q.id)) fail(`${file} ${q.id}`, 'duplicate question id');
  seenQ.add(q.id);
}
for (const { q: bq, file } of questions.filter(({ q }) => q.type === 'bagrut')) {
  const w = `${file} ${bq.id}`;
  const parts = bq.parts ?? [];
  if (parts.length < 2) fail(w, 'a Bagrut question needs at least 2 parts');
  const labels = parts.map((p) => p.label);
  if (new Set(labels).size !== labels.length) fail(w, 'two parts share a label');
  if (bq.diagram && !bq.diagramAlt?.trim()) fail(w, 'a diagram needs diagramAlt (its accessible description)');
  if (bq.diagram && /<script|on\w+=/i.test(bq.diagram)) fail(w, 'the diagram SVG must not contain scripts or event handlers');
  if (parts.length && !parts.some((p) => p.type === 'open')) fail(w, 'a Bagrut question should have an open part (full written solution)', true);
  const total = parts.reduce((n, p) => n + (p.points ?? 0), 0);
  if (total !== 33) fail(w, `parts add up to ${total} points; a Bagrut question is worth 33`, true);
}
for (const { q, file, part, parent } of units) {
  const w = `${file} ${q.id}`;
  const lessonOfId = q.id.match(/^Q-(\d+\.\d+)-/)?.[1];
  for (const o of q.objectives ?? []) {
    if (!objectiveIds.has(o)) fail(w, `objective ${o} is not declared by any lesson`);
    if (lessonOfId && !o.startsWith(`OBJ-${lessonOfId}-`)) fail(w, `objective ${o} belongs to another lesson than the id prefix ${lessonOfId}`);
  }
  if (part) {
    const waiting = part.pendingObjectives ?? [];
    if ((q.objectives ?? []).length === 0 && waiting.length === 0) fail(w, 'a part needs objectives, or pendingObjectives naming the lesson it waits for');
    for (const x of waiting) pending.push(`${parent?.id}/${part.label}: ${x}`);
    if (part.type === 'open') {
      if (!part.solution?.length) fail(w, 'an open part needs a model solution');
      else if (!part.solution.some((s) => s.kind === 'result')) fail(w, 'the model solution must end in a result step (value or conclusion, with units)');
      if ((part.rubric ?? []).length < 2) fail(w, 'an open part needs a rubric of at least 2 lines');
    }
  } else if ((q.objectives ?? []).length === 0) {
    fail(w, 'no objectives');
  }
  const tags = [
    ...(q.choices ?? []),
    ...(q.reasons ?? []),
    ...(q.commonWrong ?? []),
    ...(q.wrong ?? []),
  ].flatMap((c) => (c.misconception ? [c.misconception] : []));
  for (const t of tags) {
    if (!mcIds.has(t)) fail(w, `misconception ${t} is not in the misconception register (src/content/misconceptions/)`);
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
    const qs = questions.filter(({ q }) => q.type !== 'bagrut' && q.objectives.includes(o)).map(({ q }) => q);
    if (qs.length < 3) fail(l.file, `objective ${o} has ${qs.length} questions (needs ≥ 3)`, true);
    else if (!qs.some((q) => q.qualitative)) fail(l.file, `objective ${o} has no qualitative question`, true);
  }
}

/* ------------------------------------------------------- misconceptions */

for (const m of misconceptions) {
  if (!detected.has(m.id)) fail(m.file, `${m.id} is not detected by any distractor`, true);
  const target = lessonById.get(m.remedy.lesson);
  if (!target) fail(m.file, `${m.id} remedy points at lesson ${m.remedy.lesson}, which is not written`, true);
  else if (m.remedy.anchor && !target.figures.includes(m.remedy.anchor) && !target.body.includes(`id="${m.remedy.anchor}"`)) {
    fail(m.file, `${m.id} remedy anchor #${m.remedy.anchor} is not in lesson ${m.remedy.lesson}`, true);
  }
}

/* -------------------------------------------------------------- lessons */

const TEMPLATE = ['Hook', 'Predict', 'Explore', 'Explain', 'Example', 'Check', 'Watch', 'Summary'];
for (const l of lessons) {
  const blocks = [...l.body.matchAll(/<(Hook|Predict|Explore|Explain|Example|Check|Watch|Summary)\b/g)].map((m) => m[1]);
  for (const b of TEMPLATE) if (!blocks.includes(b)) fail(l.file, `lesson template: missing <${b}>`, true);
  let last = -1;
  for (const b of blocks) {
    const i = TEMPLATE.indexOf(b);
    if (i < last) fail(l.file, `lesson template: <${b}> comes after <${TEMPLATE[last]}>`);
    last = Math.max(last, i);
  }

  const spreadFigs = [...l.body.matchAll(/<Spread[\s\S]*?\bfig="([^"]+)"/g)].map((m) => m[1]);
  for (const f of spreadFigs) if (!l.figures.includes(f)) fail(l.file, `figure ${f} is not listed in frontmatter figures`);
  for (const f of l.figures) if (!spreadFigs.includes(f)) fail(l.file, `frontmatter figure ${f} has no <Spread>`, true);
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
      if (!seenQ.has(qid)) fail(l.file, `<Check> asks for unknown question ${qid}`, true);
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

if (pending.length) {
  console.log(`lint-content: ${pending.length} Bagrut part(s) wait for objectives of lessons not written yet:
`);
  for (const p of pending) console.log(`  • ${p}`);
  console.log('');
}
if (problems.length) {
  console.error(`lint-content: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`lint-content: ok${onlyFile ? ` for ${onlyFile}` : ''} (${lessons.length} lessons, ${questions.length} questions, ${misconceptions.length} misconceptions, ${glossary.length} terms, ${videos.length} videos)`);
