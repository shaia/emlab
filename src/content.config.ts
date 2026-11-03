import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { readdir, readFile } from 'node:fs/promises';
import { parse } from 'yaml';

/**
 * A collection kept as one YAML list per lesson (`<dir>/1-5.yaml`, …), merged into one collection.
 * Per-lesson files let lessons be written in parallel without editing a shared file; a duplicate id
 * across files fails the build.
 */
function yamlDir(dir: string) {
  return async () => {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.yaml')).sort();
    const seen = new Map<string, string>();
    const entries: { id: string }[] = [];
    for (const f of files) {
      const list = (parse(await readFile(`${dir}/${f}`, 'utf8')) ?? []) as { id: string }[];
      for (const e of list) {
        if (seen.has(e.id)) throw new Error(`${dir}: id "${e.id}" appears in both ${seen.get(e.id)} and ${f}`);
        seen.set(e.id, f);
        entries.push(e);
      }
    }
    return entries;
  };
}

const objective = z.object({ id: z.string().regex(/^OBJ-\d+\.\d+-\d+$/), text: z.string() });

const lessons = defineCollection({
  loader: glob({ base: './src/content/lessons', pattern: '**/*.mdx' }),
  schema: z.object({
    id: z.string().regex(/^\d+\.\d+$/),
    chapter: z.number().int().min(0).max(6),
    order: z.number().int().min(1),
    title: z.string(),
    subtitle: z.string().optional(),
    // the 60-minute cap applies to the Bagrut chapters only and lives in lint-content; chapter 6 has no cap
    minutes: z.number().int().min(5).max(180),
    objectives: z.array(objective).min(1),
    prerequisites: z.array(z.string()).default([]),
    videos: z.array(z.string()).default([]),
    figures: z.array(z.string()).default([]),
    /** lessons whose inclusion in the Bagrut is unverified are marked enrichment */
    enrichment: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

const choice = z.object({
  text: z.string(),
  correct: z.boolean().default(false),
  feedback: z.string(),
  misconception: z.string().optional(),
});

const common = {
  id: z.string().regex(/^Q-\d+\.\d+-[\w-]+$/),
  objectives: z.array(z.string()).min(1),
  prompt: z.string(),
  /** qualitative questions are the ones the Ministry asks teachers to favour */
  qualitative: z.boolean().default(false),
  level: z.enum(['basic', 'mid', 'bagrut']).default('basic'),
  hints: z.array(z.string()).default([]),
  /** worked explanation shown after answering, whatever the answer */
  explanation: z.string().optional(),
  /** ask "sure / not sure" before checking: separates misconceptions from gaps */
  confidence: z.boolean().default(true),
  /** show mc/multi/twotier choices in a fixed shuffled order; false keeps a deliberate order */
  shuffle: z.boolean().default(true),
};

const directions = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se', 'out', 'in', 'zero'] as const;

/** The type-specific fields of each auto-graded kind, shared by stand-alone questions and Bagrut parts. */
const bodies = {
  mc: { type: z.literal('mc'), choices: z.array(choice).min(2) },
  multi: { type: z.literal('multi'), choices: z.array(choice).min(2) },
  numeric: {
    type: z.literal('numeric'),
    answer: z.number(),
    unit: z.string(),
    /** relative tolerance */
    tolerance: z.number().positive().max(0.2).default(0.03),
    correctFeedback: z.string(),
    wrongFeedback: z.string(),
    /** recognisable wrong numbers, each traced to a misconception */
    commonWrong: z
      .array(z.object({ value: z.number(), feedback: z.string(), misconception: z.string().optional() }))
      .default([]),
  },
  vector: {
    type: z.literal('vector'),
    answer: z.enum(directions),
    /** figure drawn above the rose: an SVG snippet name from src/assessment/diagrams */
    diagram: z.string().optional(),
    allowOutIn: z.boolean().default(false),
    correctFeedback: z.string(),
    wrong: z
      .array(z.object({ dir: z.enum(directions), feedback: z.string(), misconception: z.string().optional() }))
      .default([]),
    wrongFeedback: z.string(),
  },
  rank: {
    type: z.literal('rank'),
    items: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
    /** correct order, largest first; ties as nested arrays */
    order: z.array(z.union([z.string(), z.array(z.string())])),
    correctFeedback: z.string(),
    wrongFeedback: z.string(),
  },
  twotier: {
    type: z.literal('twotier'),
    choices: z.array(choice).min(2),
    reasonPrompt: z.string().default('ומה הנימוק?'),
    reasons: z.array(choice).min(2),
  },
};

const mc = z.object({ ...common, ...bodies.mc });
const multi = z.object({ ...common, ...bodies.multi });
const numeric = z.object({ ...common, ...bodies.numeric });
const vector = z.object({ ...common, ...bodies.vector });
const rank = z.object({ ...common, ...bodies.rank });
const twotier = z.object({ ...common, ...bodies.twotier });

/* ---- Bagrut-style multi-part question: a scenario with lettered parts (א, ב, ג…) ---- */

const { id: _commonId, ...commonFields } = common;
const partCommon = {
  ...commonFields,
  /** a part may list no objective only while it waits for the lesson that owns it (pendingObjectives) */
  objectives: z.array(z.string()).default([]),
  /** the Hebrew letter that heads the part: א, ב, ג… */
  label: z.string().min(1).max(3),
  points: z.number().int().min(1).max(20),
  /** false when the part needs an answer from an earlier part: the chapter test then leaves it out */
  standalone: z.boolean().default(true),
  /** objectives of lessons not written yet, as free text; the engine ignores them and lint lists them */
  pendingObjectives: z.array(z.string()).default([]),
};

/** A part answered in free text and graded by the student against a model solution and a rubric. */
const openBody = {
  type: z.literal('open'),
  /** the model solution in Bagrut format, one step per entry */
  solution: z
    // `law`, `limit` and `units` are the chapter 6 (beyond the Bagrut) steps: general law, limit check, unit check
    .array(z.object({ kind: z.enum(['formula', 'law', 'manipulation', 'substitution', 'limit', 'units', 'result']), text: z.string() }))
    .min(1),
  /** the checklist the student ticks against their own work */
  rubric: z.array(z.object({ text: z.string(), weight: z.number().positive().default(1) })).min(2),
  /** fraction of the rubric weight that counts as "correct" for mastery evidence */
  passMark: z.number().min(0.5).max(1).default(0.75),
};

const part = z.discriminatedUnion('type', [
  z.object({ ...partCommon, ...bodies.mc }),
  z.object({ ...partCommon, ...bodies.multi }),
  z.object({ ...partCommon, ...bodies.numeric }),
  z.object({ ...partCommon, ...bodies.vector }),
  z.object({ ...partCommon, ...bodies.rank }),
  z.object({ ...partCommon, ...bodies.twotier }),
  z.object({ ...partCommon, ...openBody }),
]);

const bagrut = z.object({
  ...commonFields,
  id: z.string().regex(/^Q-\d+-bagrut-\d+$/),
  type: z.literal('bagrut'),
  title: z.string(),
  /** the scenario that all parts share */
  prompt: z.string(),
  /** inline SVG markup drawn under the scenario (physics space, LTR) */
  diagram: z.string().optional(),
  /** accessible description of the diagram: required when there is one */
  diagramAlt: z.string().optional(),
  /** filled from the parts when omitted; see bagrutObjectives() */
  objectives: z.array(z.string()).default([]),
  level: z.literal('bagrut').default('bagrut'),
  parts: z.array(part).min(2).max(6),
});

export const question = z.discriminatedUnion('type', [mc, multi, numeric, vector, rank, twotier, bagrut]);
export type Question = z.infer<typeof question>;
export type BagrutQuestion = Extract<Question, { type: 'bagrut' }>;
export type Part = BagrutQuestion['parts'][number];
export type OpenPart = Extract<Part, { type: 'open' }>;
export type AutoPart = Exclude<Part, OpenPart>;

const questions = defineCollection({
  loader: glob({ base: './src/content/questions', pattern: '**/*.yaml' }),
  schema: z.object({ chapter: z.number().int(), questions: z.array(question) }),
});

const misconceptions = defineCollection({
  loader: yamlDir('src/content/misconceptions'),
  schema: z.object({
    id: z.string().regex(/^MC-[\w-]+$/),
    title: z.string(),
    belief: z.string(),
    truth: z.string(),
    /** where to go to unlearn it: a lesson id plus an anchor or figure */
    remedy: z.object({ lesson: z.string(), anchor: z.string().optional(), label: z.string() }),
  }),
});

const glossary = defineCollection({
  loader: yamlDir('src/content/glossary'),
  schema: z.object({
    id: z.string(),
    term: z.string(),
    en: z.string(),
    definition: z.string(),
    symbol: z.string().optional(),
    unit: z.string().optional(),
    /** spellings that must not appear in course text */
    reject: z.array(z.string()).default([]),
    lesson: z.string().optional(),
  }),
});

const videos = defineCollection({
  loader: yamlDir('src/content/videos'),
  schema: z.object({
    id: z.string(),
    youtubeId: z.string().regex(/^[\w-]{11}$/),
    title: z.string(),
    channel: z.string(),
    lang: z.enum(['he', 'en']),
    captions: z.array(z.enum(['he', 'en'])).default([]),
    start: z.number().int().min(0).default(0),
    end: z.number().int().optional(),
    minutes: z.number(),
    why: z.string(),
    verified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

/* ---- Lesson workbook: open practice problems and sourced challenge problems, answers hidden ---- */

/**
 * One step of a written solution in Bagrut format; the last one is the `result`. Chapter 6 (beyond the Bagrut)
 * adds `law` (the general law it starts from), `limit` (the limit check) and `units` (the unit check).
 */
const solutionStep = z.object({
  kind: z.enum(['given', 'formula', 'law', 'manipulation', 'substitution', 'reasoning', 'limit', 'units', 'result']),
  text: z.string(),
});
const workbookItem = {
  objectives: z.array(z.string()).min(1),
  prompt: z.string(),
  /** inline SVG markup drawn under the prompt (physics space, LTR) */
  diagram: z.string().optional(),
  /** accessible description of the diagram: required when there is one */
  diagramAlt: z.string().optional(),
  /** the short final answer: value with units and direction, or a one-line decision */
  answer: z.string(),
  solution: z.array(solutionStep).min(1),
};
const workbook = defineCollection({
  loader: glob({ base: './src/content/workbook', pattern: '**/*.yaml' }),
  schema: z.object({
    lesson: z.string().regex(/^\d+\.\d+$/),
    practice: z.array(
      z.object({
        id: z.string().regex(/^W-\d+\.\d+-\d{2}$/),
        level: z.enum(['basic', 'mid', 'bagrut']),
        qualitative: z.boolean().default(false),
        ...workbookItem,
      }),
    ),
    challenge: z.array(
      z.object({
        id: z.string().regex(/^W-\d+\.\d+-c\d$/),
        /** 1 = hard (entrance-exam level), 2 = very hard (olympiad level) */
        stars: z.union([z.literal(1), z.literal(2)]),
        ...workbookItem,
        /** where the problem comes from; only a source actually opened and read is cited */
        source: z.object({
          name: z.string(),
          year: z.number().int().min(1900),
          problem: z.string(),
          url: z.string().url(),
          /** the day the source was opened; an unquoted YAML date arrives as a Date */
          verified: z.union([
            z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            z.date().transform((d) => d.toISOString().slice(0, 10)),
          ]),
          /** numbers or constants changed (to the formula sheet's), wording paraphrased */
          adapted: z.boolean().default(true),
        }),
      }),
    ),
  }),
});

/** End-of-chapter summary: what to remember and how to solve the chapter's problems. */
const summaries = defineCollection({
  loader: glob({ base: './src/content/summaries', pattern: '*.mdx' }),
  schema: z.object({ chapter: z.number().int().min(0).max(6), title: z.string() }),
});

export const collections = { lessons, questions, misconceptions, glossary, videos, workbook, summaries };
