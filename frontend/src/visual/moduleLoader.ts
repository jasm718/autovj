import * as THREE from 'three'

import type { VisualFrame, VisualModuleEnvelope } from '../contract/visualContract'
import { createDefaultModelTemplates } from './foreground/defaultModels'
import type { RuntimeEffectState, RuntimeCameraRig, VisualModuleLifecycle, VisualModuleProgram } from './moduleTypes'
import { validateVisualModuleEnvelope } from './moduleValidator'
import { createVisualApi, type VisualApiV1 } from './visualApi'

const DEFAULT_CAMERA: RuntimeCameraRig = {
  mode: 'orbit',
  distance: 6,
  height: 1.8,
  speed: 0.18,
  lookAtY: 0,
}

const DEFAULT_EFFECTS: RuntimeEffectState = {
  bloom: 0,
  rgbShift: 0,
  afterimage: 0,
}

export function prepareVisualModule(envelope: VisualModuleEnvelope): VisualModuleEnvelope {
  validateVisualModuleEnvelope(envelope)
  return envelope
}

function assertValidLifecycle(value: unknown): asserts value is VisualModuleLifecycle {
  if (typeof value !== 'object' || value === null) {
    throw new Error('createVisualModule(api) must return a lifecycle object')
  }

  const lifecycle = value as Record<string, unknown>

  if ('init' in lifecycle && lifecycle.init !== undefined && typeof lifecycle.init !== 'function') {
    throw new Error('visual module lifecycle.init must be a function')
  }

  if (typeof lifecycle.drawBackground !== 'function') {
    throw new Error('visual module lifecycle.drawBackground must be a function')
  }

  if (typeof lifecycle.update !== 'function') {
    throw new Error('visual module lifecycle.update must be a function')
  }

  if ('dispose' in lifecycle && lifecycle.dispose !== undefined && typeof lifecycle.dispose !== 'function') {
    throw new Error('visual module lifecycle.dispose must be a function')
  }
}

function instantiateProgram(
  id: string,
  duration: number,
  transitionSeconds: number,
  root: THREE.Group,
  createFactory: (api: VisualApiV1) => unknown,
): ReturnType<VisualModuleProgram['create']> {
  const visual = createVisualApi({
    root,
    modelTemplates: createDefaultModelTemplates(),
    defaultCamera: DEFAULT_CAMERA,
    defaultEffects: DEFAULT_EFFECTS,
  })

  try {
    const lifecycleValue = createFactory(visual.api)
    assertValidLifecycle(lifecycleValue)
    const lifecycle = lifecycleValue as VisualModuleLifecycle & {
      drawBackground(frame: VisualFrame, bg: Parameters<NonNullable<VisualModuleLifecycle['drawBackground']>>[1]): void
    }

    return {
      id,
      duration,
      transitionSeconds,
      root,
      camera: visual.camera as RuntimeCameraRig,
      effects: visual.effects as RuntimeEffectState,
      update(frame: VisualFrame) {
        lifecycle.update(frame)
      },
      drawBackground(frame, bg) {
        lifecycle.drawBackground(frame, bg)
      },
      dispose() {
        lifecycle.dispose?.()
        visual.resources.dispose()
      },
      init() {
        lifecycle.init?.()
      },
    }
  } catch (error) {
    visual.resources.dispose()
    throw error
  }
}

export function compileVisualModuleEnvelope(envelope: VisualModuleEnvelope): VisualModuleProgram {
  const prepared = prepareVisualModule(envelope)
  const executableCode = prepared.code.replace(
    /export\s+function\s+createVisualModule\s*\(\s*api\s*\)/,
    'function createVisualModule(api)',
  )

  let createFactory: unknown

  try {
    createFactory = new Function(
      `"use strict";\n${executableCode}\nreturn createVisualModule;`,
    )()
  } catch (error) {
    throw new Error(
      `failed to compile visual module ${prepared.moduleId}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (typeof createFactory !== 'function') {
    throw new Error(`compiled visual module ${prepared.moduleId} did not return a factory function`)
  }

  return {
    id: prepared.moduleId,
    duration: prepared.duration,
    transitionSeconds: prepared.transitionSeconds,
    source: 'remote',
    create(root: THREE.Group) {
      return instantiateProgram(
        prepared.moduleId,
        prepared.duration,
        prepared.transitionSeconds,
        root,
        createFactory as (api: VisualApiV1) => unknown,
      )
    },
  }
}
