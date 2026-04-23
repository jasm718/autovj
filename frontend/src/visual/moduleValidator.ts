import type { VisualModuleEnvelope } from '../contract/visualContract'

const FORBIDDEN_TOKENS = [
  'import',
  'export default',
  'class',
  'async',
  'await',
  'Promise',
  'fetch',
  'eval',
  'Function',
  'window',
  'document',
  'globalThis',
  'self',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'WebSocket',
  'Worker',
  'localStorage',
  'sessionStorage',
  'XMLHttpRequest',
  'THREE.WebGLRenderer',
]

export function validateVisualModuleEnvelope(envelope: VisualModuleEnvelope): void {
  if (envelope.type !== 'visual_module') {
    throw new Error(`unsupported envelope type: ${envelope.type}`)
  }

  if (envelope.apiVersion !== '1') {
    throw new Error(`unsupported visual api version: ${envelope.apiVersion}`)
  }

  if (envelope.targetLayer !== 'foreground') {
    throw new Error(`unsupported target layer: ${envelope.targetLayer}`)
  }

  if (!envelope.code.includes('export function createVisualModule(api)')) {
    throw new Error('visual module must export createVisualModule(api)')
  }

  for (const token of FORBIDDEN_TOKENS) {
    if (envelope.code.includes(token)) {
      throw new Error(`visual module contains forbidden token: ${token}`)
    }
  }
}
