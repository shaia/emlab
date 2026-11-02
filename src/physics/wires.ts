/**
 * Forces between long straight parallel wires, for lesson 4.9 (figure ParallelWires): the force
 * per unit length that one wire exerts on another, and the net force on each wire of a set
 * (superposition).
 *
 * MODEL SPECIFICATION
 * - System: N long straight wires, all perpendicular to the page, each a `Wire` of magnetism.ts:
 *   position (x, y) [m] and current I [A], I > 0 out of the page (⊙), I < 0 into it (⊗).
 * - Dynamics: none (statics). Wire j makes the field B_j = μ₀I_j/(2πr) circling it (wireFieldAt);
 *   wire i, a current I_i·ẑ in that field, feels per unit length f = I_i ẑ × B_j (F = IL×B), whose
 *   size is μ₀I_iI_j/(2πd) and which points toward j for currents in the same direction and away
 *   from j for opposite currents. The net force on a wire is the vector sum over the other wires.
 *   A wire's own field exerts no net force on it, so the sum skips i = j.
 * - Boundary: the wires are infinitely long (the result is per metre of length); no magnetic
 *   materials.
 * - Ignored: the wires' thickness, the leads that close each circuit, the electric force (the
 *   wires are neutral), the wires' motion.
 * - Valid when: each wire's length is much larger than the distances between wires, and the
 *   distances are much larger than the wires' thickness.
 * - Failure modes: two wires at the same point have no defined force; the pair is skipped
 *   (reported as zero), and callers keep the wires apart.
 */

import { wireFieldAt, type Wire } from './magnetism';
import type { Vec2 } from './vec';

/** Force per unit length on wire i due to wire j alone, f = I_i ẑ × B_j [N/m]. */
export function pairForcePerLength(wires: readonly Wire[], i: number, j: number): Vec2 {
  if (i === j) return [0, 0];
  const wi = wires[i];
  const [bx, by] = wireFieldAt([wires[j]], wi.x, wi.y);
  // ẑ × (bx, by, 0) = (−by, bx, 0)
  return [-wi.I * by, wi.I * bx];
}

/** Net force per unit length on wire i from all the other wires (superposition) [N/m]. */
export function netForcePerLength(wires: readonly Wire[], i: number): Vec2 {
  const wi = wires[i];
  const others = wires.filter((_, k) => k !== i);
  const [bx, by] = wireFieldAt(others, wi.x, wi.y);
  return [-wi.I * by, wi.I * bx];
}

/** The field at wire i made by all the other wires, the field that pushes it [T]. */
export function fieldAtWire(wires: readonly Wire[], i: number): Vec2 {
  const wi = wires[i];
  return wireFieldAt(
    wires.filter((_, k) => k !== i),
    wi.x,
    wi.y,
  );
}

