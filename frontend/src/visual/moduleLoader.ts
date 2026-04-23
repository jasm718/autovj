import type { VisualModuleEnvelope } from '../contract/visualContract'
import { validateVisualModuleEnvelope } from './moduleValidator'

export function prepareVisualModule(envelope: VisualModuleEnvelope): VisualModuleEnvelope {
  validateVisualModuleEnvelope(envelope)
  return envelope
}
