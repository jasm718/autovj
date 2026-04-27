import * as THREE from 'three'

import type { VisualFrame } from '../../contract/visualContract'
import type { RuntimeTick } from '../runtimeTypes'
import type { RuntimeCameraRig, VisualModuleInstance, VisualModuleProgram } from '../moduleTypes'
import { smoothstep } from './transition'
import type { SafeP5BackgroundApi } from '../background/p5Layer'

type ModuleSlot = {
  module: VisualModuleInstance
  startedAt: number
}

type PendingProgram = {
  program: VisualModuleProgram
  enqueuedAt: number
}

type CameraPose = {
  position: THREE.Vector3
  lookAt: THREE.Vector3
  near: number
  far: number
}

type ModuleFraming = {
  center: THREE.Vector3
  radius: number
  fitDistance: number
}

export type ThreeLayerState = {
  activeModuleId: string | null
  nextModuleId: string | null
  transitioning: boolean
  backgroundRenderer: ((frame: VisualFrame, bg: SafeP5BackgroundApi) => void) | null
}

const DEFAULT_CAMERA_DISTANCE = 6
const DEFAULT_FRAMING: ModuleFraming = {
  center: new THREE.Vector3(0, 0, 0),
  radius: 1,
  fitDistance: DEFAULT_CAMERA_DISTANCE,
}

export class ThreeLayer {
  private element: HTMLDivElement | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private activeSlot: ModuleSlot | null = null
  private nextSlot: ModuleSlot | null = null
  private pendingProgram: PendingProgram | null = null
  private width = 1
  private height = 1

  constructor(private readonly container: HTMLElement) {}

  mount(): void {
    if (this.element) {
      throw new Error('three layer is already mounted')
    }

    this.element = document.createElement('div')
    this.element.className = 'visual-layer foreground'
    this.container.appendChild(this.element)

    this.scene = new THREE.Scene()

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    this.camera.position.set(0, 1.8, 6)

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.element.appendChild(this.renderer.domElement)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))

    if (this.camera) {
      this.camera.aspect = this.width / this.height
      this.camera.updateProjectionMatrix()
    }

    this.renderer?.setSize(this.width, this.height, false)
  }

  render(tick: RuntimeTick): ThreeLayerState {
    if (!this.scene || !this.camera || !this.renderer) {
      throw new Error('three layer must be mounted before render')
    }

    this.ensureActiveModule(tick.time)
    this.maybeQueueAutomaticTransition(tick.time)

    if (this.activeSlot) {
      const activeAlpha = this.nextSlot ? 1 - this.getTransitionProgress(tick.time, this.nextSlot) : 1
      this.applySlotFrame(this.activeSlot, tick, activeAlpha, false)
    }

    if (this.nextSlot) {
      const nextAlpha = this.getTransitionProgress(tick.time, this.nextSlot)
      this.applySlotFrame(this.nextSlot, tick, nextAlpha, true)

      if (nextAlpha >= 0.999) {
        this.promoteNextSlot()
      }
    }

    this.updateCamera(tick)
    this.renderer.render(this.scene, this.camera)

    return {
      activeModuleId: this.activeSlot?.module.id ?? null,
      nextModuleId: this.nextSlot?.module.id ?? null,
      transitioning: this.nextSlot !== null,
      backgroundRenderer: this.resolveBackgroundRenderer(),
    }
  }

  queueProgram(program: VisualModuleProgram, now = performance.now() / 1000): boolean {
    if (!this.scene) {
      throw new Error('three layer must be mounted before queueing a module')
    }

    if (!this.activeSlot) {
      const slot = this.createSlot(now, program)
      this.activeSlot = slot
      this.applyFade(slot.module.root, 1)
      this.pendingProgram = null
      return true
    }

    if (this.nextSlot) {
      this.pendingProgram = {
        program,
        enqueuedAt: now,
      }
      return true
    }

    this.nextSlot = this.createSlot(now, program)
    this.pendingProgram = null
    return true
  }

  unmount(): void {
    this.disposeSlot(this.activeSlot)
    this.disposeSlot(this.nextSlot)
    this.activeSlot = null
    this.nextSlot = null

    if (this.renderer) {
      this.renderer.dispose()
      this.renderer.domElement.remove()
      this.renderer = null
    }

    this.scene = null
    this.camera = null

    if (this.element) {
      this.element.remove()
      this.element = null
    }
  }

  private ensureActiveModule(now: number): void {
    void now
  }

  private maybeQueueAutomaticTransition(now: number): void {
    if (!this.activeSlot || this.nextSlot) {
      return
    }

    if (this.pendingProgram) {
      try {
        this.nextSlot = this.createSlot(this.pendingProgram.enqueuedAt, this.pendingProgram.program)
      } catch (error) {
        console.error(error)
      }
      this.pendingProgram = null
      return
    }

  }

  private createSlot(now: number, programOverride?: VisualModuleProgram): ModuleSlot {
    if (!this.scene) {
      throw new Error('scene is unavailable')
    }

    if (!programOverride) {
      throw new Error('missing visual module program')
    }
    const program = programOverride

    const root = new THREE.Group()
    this.scene.add(root)

    try {
      const module = program.create(root)
      this.applyFade(root, 0)

      module.init?.()
      module.update({
        time: now,
        delta: 1 / 120,
        progress: 0,
        audio: {
          energy: 0,
          bassEnergy: 0,
          midEnergy: 0,
          highEnergy: 0,
          beat: false,
          beatStrength: 0,
          bpm: 0,
        },
        transition: {
          in: 0,
          out: 0,
        },
        viewport: {
          width: this.width,
          height: this.height,
          aspect: this.width / this.height,
        },
      })

      return {
        module,
        startedAt: now,
      }
    } catch (error) {
      root.removeFromParent()
      root.clear()
      throw new Error(`failed to warm up visual module ${program.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private getTransitionProgress(now: number, slot: ModuleSlot): number {
    return smoothstep((now - slot.startedAt) / slot.module.transitionSeconds)
  }

  private applySlotFrame(slot: ModuleSlot, tick: RuntimeTick, alpha: number, isIncoming: boolean): void {
    const age = Math.max(0, tick.time - slot.startedAt)
    const transitionIn = isIncoming ? alpha : Math.min(1, age / Math.max(slot.module.transitionSeconds, 0.001))
    const transitionOut = isIncoming ? 0 : this.nextSlot ? 1 - alpha : 0

    const frame: VisualFrame = {
      time: tick.time,
      delta: tick.delta,
      progress: Math.min(1, age / Math.max(slot.module.duration, 0.001)),
      audio: tick.audio,
      transition: {
        in: transitionIn,
        out: transitionOut,
      },
      viewport: {
        width: this.width,
        height: this.height,
        aspect: this.width / this.height,
      },
    }

    slot.module.update(frame)
    this.applyFade(slot.module.root, alpha)
  }

  private updateCamera(tick: RuntimeTick): void {
    if (!this.camera || !this.activeSlot) {
      return
    }

    const mix = this.nextSlot ? this.getTransitionProgress(tick.time, this.nextSlot) : 0
    const activePose = this.resolveCameraPose(this.activeSlot, Math.max(0, tick.time - this.activeSlot.startedAt))
    const nextPose = this.nextSlot
      ? this.resolveCameraPose(this.nextSlot, Math.max(0, tick.time - this.nextSlot.startedAt))
      : activePose

    this.camera.position.copy(activePose.position).lerp(nextPose.position, mix)
    const lookAt = activePose.lookAt.clone().lerp(nextPose.lookAt, mix)
    this.camera.near = THREE.MathUtils.lerp(activePose.near, nextPose.near, mix)
    this.camera.far = THREE.MathUtils.lerp(activePose.far, nextPose.far, mix)
    this.camera.updateProjectionMatrix()
    this.camera.lookAt(lookAt)
  }

  private promoteNextSlot(): void {
    this.disposeSlot(this.activeSlot)
    this.activeSlot = this.nextSlot
    this.nextSlot = null

    if (this.activeSlot) {
      this.activeSlot.startedAt = performance.now() / 1000
      this.applyFade(this.activeSlot.module.root, 1)
    }
  }

  private disposeSlot(slot: ModuleSlot | null): void {
    if (!slot) {
      return
    }

    slot.module.dispose()
    slot.module.root.removeFromParent()
  }

  private applyFade(root: THREE.Object3D, alpha: number): void {
    root.visible = alpha > 0.002

    root.traverse((object) => {
      if (object instanceof THREE.Light) {
        const baseIntensity = (object.userData.baseIntensity as number | undefined) ?? object.intensity
        object.userData.baseIntensity = baseIntensity
        object.intensity = baseIntensity * alpha
      }

      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]

        materials.forEach((material) => {
          const typedMaterial = material as THREE.Material & { opacity?: number; transparent?: boolean }
          const baseOpacity = (typedMaterial.userData.baseOpacity as number | undefined) ?? (typedMaterial.opacity ?? 1)
          typedMaterial.userData.baseOpacity = baseOpacity
          if ('transparent' in typedMaterial) {
            typedMaterial.transparent = true
          }
          if ('opacity' in typedMaterial) {
            typedMaterial.opacity = baseOpacity * alpha
          }
        })
      }
    })
  }

  private resolveBackgroundRenderer(): ((frame: VisualFrame, bg: SafeP5BackgroundApi) => void) | null {
    const incoming = this.nextSlot?.module
    if (incoming?.drawBackground) {
      return incoming.drawBackground.bind(incoming)
    }

    const active = this.activeSlot?.module
    if (active?.drawBackground) {
      return active.drawBackground.bind(active)
    }

    return null
  }

  private resolveModuleFraming(root: THREE.Group): ModuleFraming {
    if (!this.camera) {
      return DEFAULT_FRAMING
    }

    root.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(root)
    if (bounds.isEmpty()) {
      return DEFAULT_FRAMING
    }

    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const aspect = Math.max(0.001, this.width / this.height)
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
    const halfWidth = Math.max(size.x * 0.5, 0.35)
    const halfHeight = Math.max(size.y * 0.5, 0.35)
    const halfDepth = Math.max(size.z * 0.5, 0.2)
    const fitDistance = Math.max(
      halfHeight / Math.tan(verticalFov / 2),
      halfWidth / Math.tan(horizontalFov / 2),
    ) + halfDepth * 1.5 + 0.8
    const radius = Math.max(size.length() * 0.5, 0.8)

    return {
      center,
      radius,
      fitDistance,
    }
  }

  private resolveCameraPose(slot: ModuleSlot, age: number): CameraPose {
    const rig = slot.module.camera
    const framing = this.resolveModuleFraming(slot.module.root)
    const lookAt = framing.center.clone().add(new THREE.Vector3(0, rig.lookAtY, 0))
    const distanceScale = THREE.MathUtils.clamp(rig.distance / DEFAULT_CAMERA_DISTANCE, 0.75, 2.5)
    const baseDistance = Math.max(framing.fitDistance * distanceScale, framing.radius * 1.8)
    const heightRatio = THREE.MathUtils.clamp(rig.height / Math.max(rig.distance, 0.001), -1.2, 1.2)

    const createPose = (distance: number, x = 0): CameraPose => {
      const safeDistance = Math.max(distance, framing.radius * 1.4)
      const position = new THREE.Vector3(
        x,
        safeDistance * heightRatio,
        Math.sqrt((safeDistance * safeDistance) - (x * x)),
      ).add(framing.center)
      const near = Math.max(0.05, safeDistance * 0.08)
      const far = Math.max(near + 10, safeDistance + framing.radius * 8)

      return {
        position,
        lookAt,
        near,
        far,
      }
    }

    switch (rig.mode) {
      case 'static':
        return createPose(baseDistance)
      case 'push_pull':
        return createPose(
          baseDistance + Math.sin(age * rig.speed) * Math.max(0.2, baseDistance * 0.14),
        )
      case 'orbit':
      default: {
        const angle = age * rig.speed
        const orbitX = Math.sin(angle) * baseDistance * 0.42
        return createPose(baseDistance, orbitX)
      }
    }
  }
}
