/**
 * The field-language figure (lesson 6.3): one island, four scenes, each a figure of its own spread.
 *   map         a scalar field as numbers, a vector field as arrows, and ∂V/∂x as the limit of ΔV/Δx
 *   coords      one point in Cartesian, cylindrical and spherical coordinates (oblique 3D drawing)
 *   products    the dot and cross products of two vectors in the page, from their components
 *   separation  Coulomb's law with the separation vector r − r′, and a movable origin
 * Text steps drive a scene through `set={{ … }}` (src/ui/steps.ts); the keys are in each scene.
 */

import CoordsScene, { type CoordSystem } from './CoordsScene';
import MapScene, { type Axis } from './MapScene';
import ProductsScene from './ProductsScene';
import SeparationScene from './SeparationScene';

export type FieldLanguageScene = 'map' | 'coords' | 'products' | 'separation';

export interface FieldLanguageProps {
  /** figure id: the step bus key and the prefix of task ids */
  id: string;
  scene: FieldLanguageScene;
  tasks?: string[];
  /** map: the probe P [m]; separation: the field point P [m] */
  probe?: [number, number];
  /** map: the variable of the partial derivative */
  axis?: Axis;
  showNumbers?: boolean;
  showArrows?: boolean;
  /** coords */
  point?: [number, number, number];
  system?: CoordSystem;
  showBasis?: boolean;
  /** products: the two vectors in grid units */
  a?: [number, number];
  b?: [number, number];
  showDot?: boolean;
  showCross?: boolean;
  /** separation: the origin and the source point, in page coordinates [m] */
  origin?: [number, number];
  source?: [number, number];
}

export default function FieldLanguage(p: FieldLanguageProps) {
  switch (p.scene) {
    case 'map':
      return <MapScene id={p.id} tasks={p.tasks} probe={p.probe} axis={p.axis} showNumbers={p.showNumbers} showArrows={p.showArrows} />;
    case 'coords':
      return <CoordsScene id={p.id} tasks={p.tasks} point={p.point} system={p.system} showBasis={p.showBasis} />;
    case 'products':
      return <ProductsScene id={p.id} tasks={p.tasks} a={p.a} b={p.b} showDot={p.showDot} showCross={p.showCross} />;
    case 'separation':
      return <SeparationScene id={p.id} tasks={p.tasks} origin={p.origin} source={p.source} probe={p.probe} />;
  }
}
