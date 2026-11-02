/**
 * Tasks complete only after the reader acts. A text step may move a figure into a state that
 * satisfies a task (the step that puts P straight above the charge does exactly that); scrolling past
 * it must not tick the task. `touched` turns true on any pointer, key or input event inside the
 * figure, and a scene clears it whenever a step arrives.
 */

import { useRef } from 'preact/hooks';

export function useTouched() {
  const touched = useRef(false);
  const on = () => {
    touched.current = true;
  };
  const handlers = {
    onPointerDownCapture: on,
    onKeyDownCapture: on,
    onInputCapture: on,
    onClickCapture: on,
  };
  return { touched, handlers };
}
