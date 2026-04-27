import * as THREE from 'three'

import type { ModelName } from './modelRegistry'

function createOrbTemplate(): THREE.Object3D {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.52, 1),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#8fe5ff',
      emissiveIntensity: 1.1,
      metalness: 0.2,
      roughness: 0.3,
    }),
  )
  group.add(core)
  return group
}

function createTorusKnotTemplate(): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.8, 0.22, 128, 24),
    new THREE.MeshStandardMaterial({
      color: '#ffe45e',
      emissive: '#ff3d81',
      emissiveIntensity: 0.6,
      metalness: 0.24,
      roughness: 0.34,
    }),
  )
}

function createMaskTemplate(): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 32, 24, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: '#f4f7fb',
      emissive: '#9be7ff',
      emissiveIntensity: 0.35,
      metalness: 0.06,
      roughness: 0.72,
      side: THREE.DoubleSide,
    }),
  )
}

export function createDefaultModelTemplates(): Record<ModelName, THREE.Object3D> {
  return {
    'orb.glb': createOrbTemplate(),
    'torus-knot.glb': createTorusKnotTemplate(),
    'mask.glb': createMaskTemplate(),
  }
}
