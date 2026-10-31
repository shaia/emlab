/**
 * The charge lab (lessons 1.1 and 1.2): one island, five scenes. A scene is a small apparatus
 * that a text step can drive through `set={{ … }}` (see src/ui/steps.ts):
 *   pair         two balls, signs `a` and `b` (±1)
 *   rub          `pair` ('glass-silk' | 'pvc-wool'), `rubs` (0–8)
 *   materials    `reset: true`, `load` (electrons on the left site of both bars)
 *   electroscope `stage` (a name in STAGES), `rod` (excess electrons on the rod, default 8)
 *   polarise     `rod` (excess electrons on the charged body), `dist` (0–4)
 */

import ElectroscopeScene from './ElectroscopeScene';
import MaterialsScene from './MaterialsScene';
import PairScene from './PairScene';
import PolariseScene from './PolariseScene';
import RubScene from './RubScene';

export type ChargeLabScene = 'pair' | 'rub' | 'materials' | 'electroscope' | 'polarise';

export interface ChargeLabProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  scene: ChargeLabScene;
  tasks?: string[];
  /** electroscope only: show the touch button and the ground wire (lesson 1.2, figure 1.2b) */
  charging?: boolean;
}

export default function ChargeLab({ scene, id, tasks, charging }: ChargeLabProps) {
  switch (scene) {
    case 'pair':
      return <PairScene id={id} tasks={tasks} />;
    case 'rub':
      return <RubScene id={id} tasks={tasks} />;
    case 'materials':
      return <MaterialsScene id={id} tasks={tasks} />;
    case 'electroscope':
      return <ElectroscopeScene id={id} tasks={tasks} charging={charging} />;
    case 'polarise':
      return <PolariseScene id={id} tasks={tasks} />;
  }
}
