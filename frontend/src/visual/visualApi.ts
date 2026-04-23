export type GeometryType = 'sphere' | 'box' | 'torus' | 'plane' | 'cone' | 'cylinder'
export type MaterialType = 'basic' | 'standard' | 'emissive' | 'wireframe'
export type CameraMode = 'static' | 'orbit' | 'push_pull'

export type VisualApiV1 = {
  root: unknown
  createGroup(input?: { name?: string }): unknown
  createMesh(input: {
    geometry: GeometryType
    material: MaterialType
    color: string
    opacity?: number
    size?: number
    radius?: number
    tube?: number
    width?: number
    height?: number
    depth?: number
    segments?: number
  }): unknown
  createParticles(input: {
    count: number
    color: string
    size: number
    spread: number
    opacity?: number
  }): unknown
  createLight(input: {
    type: 'point' | 'directional'
    color: string
    intensity: number
    x?: number
    y?: number
    z?: number
  }): unknown
  setCamera(input: { mode: CameraMode; distance?: number; height?: number; speed?: number }): void
  setBloom(value: number): void
  setRgbShift(value: number): void
  setAfterimage(value: number): void
  lerp(a: number, b: number, t: number): number
  clamp(value: number, min: number, max: number): number
  sin(value: number): number
  cos(value: number): number
  noise(x: number, y?: number, z?: number): number
}
