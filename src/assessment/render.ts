/**
 * Build-time rendering of a question: every student-facing string goes through tex(), so the
 * browser receives finished HTML (no KaTeX shipped to the client) and a broken formula in a
 * YAML bank fails the build with the question id in the message.
 */

import type { Question } from '~/content.config';
import { tex } from '~/lib/tex';

export function renderQuestion(q: Question): Question {
  const t = (s: string, field: string) => tex(s, `${q.id}.${field}`);
  const base = {
    ...q,
    prompt: t(q.prompt, 'prompt'),
    hints: q.hints.map((h, i) => t(h, `hints[${i}]`)),
    explanation: q.explanation ? t(q.explanation, 'explanation') : undefined,
  };
  const choices = <C extends { text: string; feedback: string }>(cs: C[], name: string) =>
    cs.map((c, i) => ({ ...c, text: t(c.text, `${name}[${i}].text`), feedback: t(c.feedback, `${name}[${i}].feedback`) }));

  switch (q.type) {
    case 'mc':
    case 'multi':
      return { ...base, type: q.type, choices: choices(q.choices, 'choices') } as Question;
    case 'twotier':
      return {
        ...base,
        type: 'twotier',
        choices: choices(q.choices, 'choices'),
        reasons: choices(q.reasons, 'reasons'),
        reasonPrompt: t(q.reasonPrompt, 'reasonPrompt'),
      } as Question;
    case 'numeric':
      return {
        ...base,
        type: 'numeric',
        correctFeedback: t(q.correctFeedback, 'correctFeedback'),
        wrongFeedback: t(q.wrongFeedback, 'wrongFeedback'),
        commonWrong: q.commonWrong.map((w, i) => ({ ...w, feedback: t(w.feedback, `commonWrong[${i}]`) })),
      } as Question;
    case 'vector':
      return {
        ...base,
        type: 'vector',
        correctFeedback: t(q.correctFeedback, 'correctFeedback'),
        wrongFeedback: t(q.wrongFeedback, 'wrongFeedback'),
        wrong: q.wrong.map((w, i) => ({ ...w, feedback: t(w.feedback, `wrong[${i}]`) })),
      } as Question;
    case 'rank':
      return {
        ...base,
        type: 'rank',
        items: q.items.map((it, i) => ({ ...it, label: t(it.label, `items[${i}]`) })),
        correctFeedback: t(q.correctFeedback, 'correctFeedback'),
        wrongFeedback: t(q.wrongFeedback, 'wrongFeedback'),
      } as Question;
  }
}
