/**
 * The magnetic force on a moving charge, lesson 4.5. Two views share one figure name:
 * - mode 'vectors' (figure 4.6א): v, B and F = qv×B at one charge, in a tilting 3D view;
 * - mode 'strip' (figure 4.6ב): a charge crossing a strip of magnetic or electric field.
 */

import StripPath, { type StripPathProps } from './StripPath';
import Vectors3D, { type Vectors3DProps } from './Vectors3D';

export type LorentzForceProps = ({ mode?: 'vectors' } & Vectors3DProps) | ({ mode: 'strip' } & StripPathProps);

export default function LorentzForce(props: LorentzForceProps) {
  if (props.mode === 'strip') return <StripPath {...props} />;
  return <Vectors3D {...props} />;
}
