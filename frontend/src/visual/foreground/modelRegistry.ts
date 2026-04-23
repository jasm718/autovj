export const MODEL_REGISTRY = ['orb.glb', 'torus-knot.glb', 'mask.glb'] as const

export type ModelName = (typeof MODEL_REGISTRY)[number]

export function assertKnownModel(name: string): asserts name is ModelName {
  if (!MODEL_REGISTRY.includes(name as ModelName)) {
    throw new Error(`unknown model: ${name}`)
  }
}
