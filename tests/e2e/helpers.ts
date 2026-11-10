import { expect, type Locator, type Page } from '@playwright/test';

export const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('emlab:v1') ?? 'null'));

/** Count of inked pixels (sampled) on a canvas: zero means the figure drew nothing. */
export const inked = (c: Locator) =>
  c.evaluate((el: HTMLCanvasElement) => {
    const d = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 0) n++;
    return n;
  });

/**
 * Wait until the island around `el` has hydrated (Astro then drops its `ssr` attribute). Text typed
 * or a choice clicked before that lands in the static HTML and never reaches the component.
 */
export const hydrated = (el: Locator) => expect(el.locator('xpath=ancestor-or-self::astro-island[1]')).not.toHaveAttribute('ssr');

/**
 * Stop text steps from driving the figures. Scrolling a figure into view can bring a step paragraph
 * to mid-screen, and the step then resets the figure mid-test (by design: it is scrollytelling).
 * The step is dropped at dispatch (`steps.ts` calls `window.dispatchEvent` each time). A capturing
 * listener cannot do it: the event targets window itself, and Chromium runs at-target listeners in
 * registration order, so a figure that hydrated before the freeze still heard every step.
 */
export const freezeSteps = (page: Page) =>
  page.evaluate(() => {
    const dispatch = window.dispatchEvent.bind(window);
    window.dispatchEvent = (e: Event) => (e.type === 'emlab:step' ? true : dispatch(e));
  });

/**
 * Put a ranking question's items in `order`, each named by a fragment of its label's text (a rendered KaTeX label
 * keeps its TeX source, so `3000\,\mu\text{C}` works), whatever order they start in; then tie item i with item
 * i + 1 for each i in `ties`. The items start shuffled, so a fixed list of clicks only works by luck.
 */
export async function rankTo(card: Locator, order: string[], ties: number[] = []) {
  const labels = card.locator('.q-rank-label');
  for (let i = 0; i < order.length; i++) {
    const texts = await labels.allTextContents();
    const j = texts.findIndex((t) => t.includes(order[i]));
    if (j < 0) throw new Error(`rankTo: no item's label contains ${order[i]}`);
    for (let k = j; k > i; k--) await card.getByRole('button', { name: 'למעלה' }).nth(k).click();
  }
  for (const t of ties) await card.locator('.q-rank-rel').nth(t).click();
}
