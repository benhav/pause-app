export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Damp (smooth approach) for framerate-uavhengig smoothing.
 * lambda ~ 12..20 føles "snappy"
 */
export function damp(current: number, target: number, lambda: number, dt: number) {
  const t = 1 - Math.exp(-lambda * dt);
  return lerp(current, target, t);
}

export function wrapDeg(deg: number) {
  let d = deg % 360;
  if (d < -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}