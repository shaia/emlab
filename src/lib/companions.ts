/** Pages that accompany lessons and chapters: the lesson workbook and the chapter summary. */

import { getCollection } from 'astro:content';

/** Lesson ids ("1.5") that have a workbook page. */
export async function lessonsWithWorkbook(): Promise<Set<string>> {
  return new Set((await getCollection('workbook')).map((w) => w.data.lesson));
}

/** Chapter numbers that have a summary page. */
export async function chaptersWithSummary(): Promise<Set<number>> {
  return new Set((await getCollection('summaries')).map((s) => s.data.chapter));
}
