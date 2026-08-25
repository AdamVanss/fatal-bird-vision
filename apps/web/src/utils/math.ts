export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function withinCylinder(
  dx: number,
  dy: number,
  dz: number,
  radius: number,
  depth: number,
): boolean {
  return Math.abs(dz) < depth && Math.sqrt(dx * dx + dy * dy) < radius;
}