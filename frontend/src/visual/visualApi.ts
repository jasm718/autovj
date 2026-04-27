import P5 from 'p5'
import * as THREE from 'three'

import { assertKnownModel, type ModelName } from './foreground/modelRegistry'

export type GeometryType = 'sphere' | 'box' | 'torus' | 'plane' | 'cone' | 'cylinder'
export type MaterialType = 'basic' | 'standard' | 'emissive' | 'wireframe'
export type CameraMode = 'static' | 'orbit' | 'push_pull'

type TransformTarget = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}

type SafeMaterialTarget = {
  color?: THREE.Color
  emissive?: THREE.Color
  emissiveIntensity?: number
  opacity?: number
}

type CameraConfig = {
  mode: CameraMode
  distance: number
  height: number
  speed: number
}

type EffectState = {
  bloom: number
  rgbShift: number
  afterimage: number
}

type VisualApiLimits = {
  maxMeshes: number
  maxParticleSystems: number
  maxParticlesPerSystem: number
  maxLights: number
}

type VisualApiCounters = {
  meshes: number
  particleSystems: number
  lights: number
}

export type VisualApiResources = {
  counters: VisualApiCounters
  dispose(): void
}

export type SafeColor = {
  set(value: string): void
  toHexString(): string
}

type SafeBaseNode<TObject extends THREE.Object3D> = {
  readonly object3d: TObject
  readonly position: THREE.Vector3
  readonly rotation: THREE.Euler
  readonly scale: THREE.Vector3
  visible: boolean
  add(child: SafeObject3D): void
  remove(child: SafeObject3D): void
  clear(): void
  lookAt(x: number, y: number, z: number): void
  setPosition(x: number, y: number, z: number): void
  setRotation(x: number, y: number, z: number): void
  setScale(x: number, y?: number, z?: number): void
}

export type SafeGroup = SafeBaseNode<THREE.Group>

export type SafeMesh = SafeBaseNode<THREE.Mesh> & {
  readonly material: {
    setColor(value: string): void
    setOpacity(value: number): void
    setEmissiveIntensity(value: number): void
  }
}

export type SafeParticles = SafeBaseNode<THREE.Points> & {
  readonly material: {
    setColor(value: string): void
    setOpacity(value: number): void
    setSize(value: number): void
  }
}

export type SafeLight = SafeBaseNode<THREE.Light> & {
  setIntensity(value: number): void
  setColor(value: string): void
}

export type SafeObject3D = SafeGroup | SafeMesh | SafeParticles | SafeLight

export type VisualApiV1 = {
  root: SafeGroup
  createGroup(input?: { name?: string }): SafeGroup
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
  }): SafeMesh
  createParticles(input: {
    count: number
    color: string
    size: number
    spread: number
    opacity?: number
  }): SafeParticles
  getModel(name: ModelName): SafeObject3D
  createLight(input: {
    type: 'point' | 'directional'
    color: string
    intensity: number
    x?: number
    y?: number
    z?: number
  }): SafeLight
  setCamera(input: { mode: CameraMode; distance?: number; height?: number; speed?: number }): void
  setBloom(value: number): void
  setRgbShift(value: number): void
  setAfterimage(value: number): void
  color(value: string): SafeColor
  lerp(a: number, b: number, t: number): number
  clamp(value: number, min: number, max: number): number
  sin(value: number): number
  cos(value: number): number
  noise(x: number, y?: number, z?: number): number
}

export type VisualApiContext = {
  root: THREE.Group
  modelTemplates: Record<ModelName, THREE.Object3D>
  defaultCamera: CameraConfig
  defaultEffects?: Partial<EffectState>
  limits?: Partial<VisualApiLimits>
}

const DEFAULT_LIMITS: VisualApiLimits = {
  maxMeshes: 40,
  maxParticleSystems: 2,
  maxParticlesPerSystem: 3000,
  maxLights: 4,
}

const DEFAULT_EFFECTS: EffectState = {
  bloom: 0,
  rgbShift: 0,
  afterimage: 0,
}

const noiseGenerator = new P5(() => {})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function setTransformScale(target: TransformTarget, x: number, y?: number, z?: number): void {
  const nextY = y ?? x
  const nextZ = z ?? x
  target.scale.set(x, nextY, nextZ)
}

function applyOpacity(material: THREE.Material, opacity: number): void {
  const target = material as THREE.Material & { opacity?: number; transparent?: boolean }
  if ('transparent' in target) {
    target.transparent = true
  }
  if ('opacity' in target) {
    target.opacity = clamp(opacity, 0, 1)
  }
}

function createSafeColor(color: THREE.Color): SafeColor {
  return {
    set(value: string) {
      color.set(value)
    },
    toHexString() {
      return `#${color.getHexString()}`
    },
  }
}

function createBaseNode<TObject extends THREE.Object3D>(object3d: TObject): SafeBaseNode<TObject> {
  return {
    object3d,
    position: object3d.position,
    rotation: object3d.rotation,
    scale: object3d.scale,
    get visible() {
      return object3d.visible
    },
    set visible(value: boolean) {
      object3d.visible = value
    },
    add(child: SafeObject3D) {
      object3d.add(child.object3d)
    },
    remove(child: SafeObject3D) {
      object3d.remove(child.object3d)
    },
    clear() {
      object3d.clear()
    },
    lookAt(x: number, y: number, z: number) {
      object3d.lookAt(x, y, z)
    },
    setPosition(x: number, y: number, z: number) {
      object3d.position.set(x, y, z)
    },
    setRotation(x: number, y: number, z: number) {
      object3d.rotation.set(x, y, z)
    },
    setScale(x: number, y?: number, z?: number) {
      setTransformScale(object3d, x, y, z)
    },
  }
}

function createSafeGroup(group: THREE.Group): SafeGroup {
  return createBaseNode(group)
}

function createSafeMesh(mesh: THREE.Mesh): SafeMesh {
  const base = createBaseNode(mesh)
  const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial

  return {
    ...base,
    material: {
      setColor(value: string) {
        if ('color' in material) {
          material.color.set(value)
        }
      },
      setOpacity(value: number) {
        applyOpacity(material, value)
      },
      setEmissiveIntensity(value: number) {
        if ('emissiveIntensity' in material) {
          material.emissiveIntensity = value
        }
      },
    },
  }
}

function createSafeParticles(points: THREE.Points): SafeParticles {
  const base = createBaseNode(points)
  const material = points.material as THREE.PointsMaterial

  return {
    ...base,
    material: {
      setColor(value: string) {
        material.color.set(value)
      },
      setOpacity(value: number) {
        applyOpacity(material, value)
      },
      setSize(value: number) {
        material.size = Math.max(0.001, value)
      },
    },
  }
}

function createSafeLight(light: THREE.Light): SafeLight {
  const base = createBaseNode(light)

  return {
    ...base,
    setIntensity(value: number) {
      light.intensity = Math.max(0, value)
    },
    setColor(value: string) {
      light.color.set(value)
    },
  }
}

function createGeometry(input: Parameters<VisualApiV1['createMesh']>[0]): THREE.BufferGeometry {
  switch (input.geometry) {
    case 'sphere':
      return new THREE.SphereGeometry(input.radius ?? 0.5, input.segments ?? 32, input.segments ?? 24)
    case 'box':
      return new THREE.BoxGeometry(input.width ?? 1, input.height ?? 1, input.depth ?? 1)
    case 'torus':
      return new THREE.TorusGeometry(input.radius ?? 1, input.tube ?? 0.2, Math.max(12, input.segments ?? 24), 72)
    case 'plane':
      return new THREE.PlaneGeometry(input.width ?? 1.6, input.height ?? 1.6, input.segments ?? 1, input.segments ?? 1)
    case 'cone':
      return new THREE.ConeGeometry(input.radius ?? 0.5, input.height ?? 1.2, input.segments ?? 24)
    case 'cylinder':
      return new THREE.CylinderGeometry(input.radius ?? 0.45, input.radius ?? 0.45, input.height ?? 1.4, input.segments ?? 24)
  }
}

function createMaterial(input: Parameters<VisualApiV1['createMesh']>[0]): THREE.Material {
  const opacity = clamp(input.opacity ?? 1, 0, 1)
  const common = {
    color: input.color,
    transparent: opacity < 1,
    opacity,
  }

  switch (input.material) {
    case 'basic':
      return new THREE.MeshBasicMaterial(common)
    case 'standard':
      return new THREE.MeshStandardMaterial({
        ...common,
        metalness: 0.25,
        roughness: 0.45,
      })
    case 'emissive':
      return new THREE.MeshStandardMaterial({
        ...common,
        emissive: input.color,
        emissiveIntensity: 1.2,
        metalness: 0.18,
        roughness: 0.3,
      })
    case 'wireframe':
      return new THREE.MeshBasicMaterial({
        ...common,
        wireframe: true,
      })
  }
}

function createParticlesObject(input: Parameters<VisualApiV1['createParticles']>[0]): THREE.Points {
  const count = Math.floor(input.count)
  const positions = new Float32Array(count * 3)

  for (let index = 0; index < count; index += 1) {
    const stride = index * 3
    positions[stride] = (Math.random() - 0.5) * input.spread
    positions[stride + 1] = (Math.random() - 0.5) * input.spread
    positions[stride + 2] = (Math.random() - 0.5) * input.spread
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: input.color,
    size: input.size,
    transparent: true,
    opacity: clamp(input.opacity ?? 1, 0, 1),
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  return new THREE.Points(geometry, material)
}

function createLightObject(input: Parameters<VisualApiV1['createLight']>[0]): THREE.Light {
  const light =
    input.type === 'point'
      ? new THREE.PointLight(input.color, input.intensity, 18, 1.5)
      : new THREE.DirectionalLight(input.color, input.intensity)

  light.position.set(input.x ?? 0, input.y ?? 1.5, input.z ?? 0)
  return light
}

function disposeTrackedObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line) {
      node.geometry.dispose()
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      materials.forEach((material) => {
        material.dispose()
      })
    }
  })
}

export function createVisualApi(context: VisualApiContext): {
  api: VisualApiV1
  resources: VisualApiResources
  camera: CameraConfig
  effects: EffectState
} {
  const limits: VisualApiLimits = {
    ...DEFAULT_LIMITS,
    ...context.limits,
  }

  const counters: VisualApiCounters = {
    meshes: 0,
    particleSystems: 0,
    lights: 0,
  }

  const trackedObjects = new Set<THREE.Object3D>()
  const camera: CameraConfig = { ...context.defaultCamera }
  const effects: EffectState = {
    ...DEFAULT_EFFECTS,
    ...context.defaultEffects,
  }

  function registerObject(object: THREE.Object3D): void {
    trackedObjects.add(object)
  }

  function assertLimit(kind: keyof VisualApiCounters, nextValue: number, maxValue: number): void {
    if (nextValue > maxValue) {
      throw new Error(`visual module exceeded ${kind} limit`)
    }
  }

  const api: VisualApiV1 = {
    root: createSafeGroup(context.root),
    createGroup(input = {}) {
      const group = new THREE.Group()
      group.name = input.name ?? 'group'
      registerObject(group)
      return createSafeGroup(group)
    },
    createMesh(input) {
      counters.meshes += 1
      assertLimit('meshes', counters.meshes, limits.maxMeshes)

      const mesh = new THREE.Mesh(createGeometry(input), createMaterial(input))
      mesh.castShadow = false
      mesh.receiveShadow = false
      registerObject(mesh)
      return createSafeMesh(mesh)
    },
    createParticles(input) {
      if (input.count > limits.maxParticlesPerSystem) {
        throw new Error('visual module exceeded particles-per-system limit')
      }

      counters.particleSystems += 1
      assertLimit('particleSystems', counters.particleSystems, limits.maxParticleSystems)

      const particles = createParticlesObject(input)
      registerObject(particles)
      return createSafeParticles(particles)
    },
    getModel(name) {
      assertKnownModel(name)
      const template = context.modelTemplates[name]
      if (!template) {
        throw new Error(`missing model template: ${name}`)
      }

      const clone = template.clone(true)
      registerObject(clone)
      return createSafeGroup(clone as THREE.Group)
    },
    createLight(input) {
      counters.lights += 1
      assertLimit('lights', counters.lights, limits.maxLights)

      const light = createLightObject(input)
      registerObject(light)
      return createSafeLight(light)
    },
    setCamera(input) {
      camera.mode = input.mode
      if (input.distance !== undefined) {
        camera.distance = input.distance
      }
      if (input.height !== undefined) {
        camera.height = input.height
      }
      if (input.speed !== undefined) {
        camera.speed = input.speed
      }
    },
    setBloom(value) {
      effects.bloom = clamp(value, 0, 2)
    },
    setRgbShift(value) {
      effects.rgbShift = clamp(value, 0, 1)
    },
    setAfterimage(value) {
      effects.afterimage = clamp(value, 0, 1)
    },
    color(value) {
      return createSafeColor(new THREE.Color(value))
    },
    lerp(a, b, t) {
      return THREE.MathUtils.lerp(a, b, t)
    },
    clamp(value, min, max) {
      return clamp(value, min, max)
    },
    sin(value) {
      return Math.sin(value)
    },
    cos(value) {
      return Math.cos(value)
    },
    noise(x, y = 0, z = 0) {
      return noiseGenerator.noise(x, y, z)
    },
  }

  return {
    api,
    resources: {
      counters,
      dispose() {
        trackedObjects.forEach((object) => {
          object.removeFromParent()
          disposeTrackedObject(object)
        })
        trackedObjects.clear()
      },
    },
    camera,
    effects,
  }
}
