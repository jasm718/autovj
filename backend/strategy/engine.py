from backend.agent.schema import MusicWindowSummary, VisualModuleEnvelope


def create_demo_module(summary: MusicWindowSummary) -> VisualModuleEnvelope:
    speed = round(0.35 + summary.energy * 1.2, 3)
    pulse = round(0.2 + summary.bassEnergy * 0.5, 3)

    code = f"""
export function createVisualModule(api) {{
  const root = api.root
  const ring = api.createMesh({{
    geometry: 'torus',
    material: 'emissive',
    color: '#00e5ff',
    radius: 1.2,
    tube: 0.12,
    opacity: 0.9,
  }})
  const core = api.createMesh({{
    geometry: 'sphere',
    material: 'standard',
    color: '#ff3d81',
    radius: 0.45,
    opacity: 0.85,
  }})

  return {{
    init() {{
      root.add(ring)
      root.add(core)
      api.setCamera({{ mode: 'orbit', distance: 4, height: 1.2, speed: 0.25 }})
      api.setBloom(0.6)
    }},
    update(frame) {{
      const pulse = 1 + frame.audio.bassEnergy * {pulse} + frame.audio.beatStrength * 0.25
      ring.rotation.x += frame.delta * {speed}
      ring.rotation.y += frame.delta * ({speed} + frame.audio.highEnergy)
      ring.scale.setScalar(pulse)
      core.scale.setScalar(0.8 + frame.audio.energy * 0.6)
      core.material.setEmissiveIntensity(0.4 + frame.audio.highEnergy * 1.5)
      api.setRgbShift(frame.audio.beat ? 0.18 : 0.04)
    }},
    dispose() {{
      root.clear()
      api.setBloom(0)
      api.setRgbShift(0)
    }},
  }}
}}
""".strip()

    return VisualModuleEnvelope(
        type="visual_module",
        apiVersion="1",
        moduleId=f"demo-{summary.moodHint}-{summary.windowSeconds}s",
        targetLayer="foreground",
        duration=summary.windowSeconds,
        transitionSeconds=4,
        code=code,
    )
