/**
 * Physical constants, in the values the Bagrut formula sheet (5 units) gives students.
 * Every number a student computes in the course is computed with these, so the course
 * never disagrees with the exam by a rounding step.
 */

/** Coulomb constant k [N·m²/C²], as on the formula sheet. */
export const K = 9e9;

/**
 * Vacuum permittivity derived from K, so that k = 1/(4πε₀) holds exactly inside the engine.
 * Shown to students as 8.85·10⁻¹² (the sheet's value); the two differ by 0.1%, below any
 * tolerance the course grades with. Gauss's law tests depend on this internal consistency.
 */
export const EPS0 = 1 / (4 * Math.PI * K);

/** ε₀ as printed for students [C²/(N·m²)]. */
export const EPS0_DISPLAY = 8.85e-12;

/** Elementary charge [C]. */
export const E_CHARGE = 1.6e-19;

/** Electron mass [kg]. */
export const M_ELECTRON = 9.1e-31;

/** Proton mass [kg]. */
export const M_PROTON = 1.67e-27;

/** Vacuum permeability [T·m/A]. */
export const MU0 = 4 * Math.PI * 1e-7;

/** Free-fall acceleration [m/s²]; the exam instructs g = 10. */
export const G = 10;

/** Gravitational constant [N·m²/kg²], for the Coulomb–gravity comparison. */
export const G_NEWTON = 6.67e-11;

/**
 * Speed of light in vacuum [m/s], the formula sheet's 3·10⁸. With EPS0 = 1/(4πK) and MU0 = 4π·10⁻⁷ the engine's
 * 1/√(μ₀ε₀) = √(4πK/μ₀) is exactly this value (chapter 6: waves, displacement current, relativity).
 */
export const C_LIGHT = 3e8;
