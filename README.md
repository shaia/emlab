# חשמל ומגנטיות: ספר לימוד חי

An interactive, Hebrew-only course in electricity and magnetism for Israeli high-school physics at the 5-unit level
(Bagrut paper 036371), written for a student who meets the material for the first time.

**Live site:** <https://slow-is-smooth.io/emlab/>

Each lesson is laid out as an open book: text on the right page and, on the left, a live figure the student can
touch. As the text scrolls, its steps change what the figure shows. Students commit to a prediction before
exploring, and the questions record how confident they were along with what they answered. A wrong answer given
with confidence is how the course tells a misconception apart from a gap in knowledge.

## Status

An early preview. The full course map is visible on the home page. **Lesson 1.5 (השדה החשמלי)** is written and is
the reference lesson the others will follow. The remaining lessons of chapters 0–5 are marked "בקרוב".

## Running it

Requires Node 22.23.4 or newer.

```sh
npm ci
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
npm run preview    # serve dist/
```

## Checks

```sh
npx vitest run         # physics engine and grading logic
npm run lint:content   # lesson template, question coverage, misconceptions, glossary, videos
npx astro check        # types
npx playwright test    # end-to-end, against `npm run preview`
```

The build fails on any formula KaTeX rejects and on any lesson or question that breaks its schema. Every push to
`master` runs all of the above in GitHub Actions and deploys to GitHub Pages only if everything passes.

## Layout

| Path | Holds |
| --- | --- |
| `src/content/lessons/` | Lessons, one MDX file each |
| `src/content/questions/` | Question banks, one YAML file per chapter |
| `src/content/*.yaml` | Misconception register, glossary, verified YouTube videos |
| `src/physics/` | The physics engine, pure TypeScript with tests in `tests/physics/` |
| `src/sims/` | Live figures (Preact + canvas) |
| `src/assessment/` | Question types, grading and the build-time TeX renderer |
| `src/progress/` | The student's progress, kept in the browser, with export and import |
| `src/course.ts` | The course map: every chapter and planned lesson |

Progress lives in the student's browser only. The answer keys ship with the page, so the course suits self-study,
not secure testing.

Built with [Astro](https://astro.build), [Preact](https://preactjs.com) and [KaTeX](https://katex.org). The
visual design is inspired by [Every Joule](https://iamtechartist.com/every-joule/).
