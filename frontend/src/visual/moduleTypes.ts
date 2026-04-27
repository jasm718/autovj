import * as THREE from 'three'

import type { VisualFrame } from '../contract/visualContract'
import type { CameraMode } from './visualApi'
import type { SafeP5BackgroundApi } from './background/p5Layer'

export type RuntimeCameraRig = {
  mode: CameraMode
  distance: number
  height: number
  speed: number
  lookAtY: number
}

export type RuntimeEffectState = {
  bloom: number
  rgbShift: number
  afterimage: number
}

export type VisualModuleLifecycle = {
  init?(): void
  drawBackground?(frame: VisualFrame, bg: SafeP5BackgroundApi): void
  update(frame: VisualFrame): void
  dispose?(): void
}

export type VisualModuleProgram = {
  id: string
  duration: number
  transitionSeconds: number
  source: 'remote'
  create(root: THREE.Group): VisualModuleInstance
}

export type VisualModuleInstance = {
  id: string
  duration: number
  transitionSeconds: number
  root: THREE.Group
  camera: RuntimeCameraRig
  effects: RuntimeEffectState
  init?(): void
  drawBackground?(frame: VisualFrame, bg: SafeP5BackgroundApi): void
  update(frame: VisualFrame): void
  dispose(): void
}
