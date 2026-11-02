/**
 * A tilted orthographic view of 3D figure space on a flat canvas. The page is the x–y plane
 * (x right, y up) and z points out of it, toward the reader. View angle 0 looks straight at the
 * page, as every Bagrut drawing does; larger angles swing the camera to the right and up, so a
 * vector out of the page shows as a line running down-left.
 */

export type V3 = readonly [number, number, number];

export interface Camera {
  /** screen-right, screen-up and toward-the-reader unit vectors, in figure space */
  r: V3;
  u: V3;
  d: V3;
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The camera for a view angle in degrees: it swings right by yaw = 0.7·view and rises by
 * pitch = 0.8·view, so the page tilts back and a vector out of it runs down and to the left,
 * the way textbooks draw a third axis.
 */
export function camera(viewDeg: number): Camera {
  const a = (viewDeg * Math.PI) / 180;
  const yaw = 0.7 * a;
  const pitch = 0.8 * a;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  return {
    r: [cy, 0, -sy],
    u: [-sy * sp, cp, -cy * sp],
    d: [sy * cp, sp, cy * cp],
  };
}

/** Screen-plane coordinates (right, up) of a point, in world units. */
export const flat = (c: Camera, p: V3): [number, number] => [dot(p, c.r), dot(p, c.u)];

/** Distance toward the reader: larger is nearer. */
export const depth = (c: Camera, p: V3): number => dot(p, c.d);

export const scale3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
