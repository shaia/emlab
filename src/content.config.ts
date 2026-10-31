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
    chapter: z.number().int().min(0).max(5),
    order: z.number().int().min(1),
    title: z.string(),
    subtitle: z.string().optional(),
    minutes: z.number().int().min(5).max(60),
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
};

const mc = z.object({ ...common, type: z.literal('mc'), choices: z.array(choice).min(2) });
const multi = z.object({ ...common, type: z.literal('multi'), choices: z.array(choice).min(2) });

const numeric = z.object({
  ...common,
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
});

const directions = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se', 'out', 'in', 'zero'] as const;
const vector = z.object({
  ...common,
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
});

const rank = z.object({
  ...common,
  type: z.literal('rank'),
  items: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  /** correct order, largest first; ties as nested arrays */
  order: z.array(z.union([z.string(), z.array(z.string())])),
  correctFeedback: z.string(),
  wrongFeedback: z.string(),
});

const twotier = z.object({
  ...common,
  type: z.literal('twotier'),
  choices: z.array(choice).min(2),
  reasonPrompt: z.string().default('ומה הנימוק?'),
  reasons: z.array(choice).min(2),
});

export const question = z.discriminatedUnion('type', [mc, multi, numeric, vector, rank, twotier]);
export type Question = z.infer<typeof question>;

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

export const collections = { lessons, questions, misconceptions, glossary, videos };
