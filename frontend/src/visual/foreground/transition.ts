export function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}
