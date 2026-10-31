/** Question banks, at build time. Ids are unique across all banks (lint-content enforces it). */

import { getCollection } from 'astro:content';
import type { Question } from '~/content.config';

let cache: Map<string, Question> | null = null;

export async function allQuestions(): Promise<Map<string, Question>> {
  if (cache) return cache;
  const banks = await getCollection('questions');
  const map = new Map<string, Question>();
  for (const b of banks) {
    for (const q of b.data.questions) {
      if (map.has(q.id)) throw new Error(`duplicate question id ${q.id} (in ${b.id})`);
      map.set(q.id, q);
    }
  }
  cache = map;
  return map;
}

export async function getQuestion(id: string, where: string): Promise<Question> {
  const q = (await allQuestions()).get(id);
  if (!q) throw new Error(`${where}: unknown question id ${id}`);
  return q;
}

/** "/lessons/1-5/" (with or without a base path) → "1.5" */
export function lessonFromPath(pathname: string): string | null {
  const m = pathname.match(/\/lessons\/(\d+)-(\d+)\/?$/);
  return m ? `${m[1]}.${m[2]}` : null;
}
