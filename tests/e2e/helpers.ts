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
 * A capturing listener on window runs before the figures' own listeners and swallows the event.
 */
export const freezeSteps = (page: Page) =>
  page.evaluate(() => window.addEventListener('emlab:step', (e) => e.stopImmediatePropagation(), true));
