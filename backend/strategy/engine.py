from uuid import uuid4

from backend.agent.schema import MusicWindowSummary, VisualModuleEnvelope


def _module_id(prefix: str, summary: MusicWindowSummary) -> str:
    mood = "".join(character if character.isalnum() else "-" for character in summary.moodHint.lower()).strip("-")
    return f"{prefix}-{mood or 'music'}-{uuid4().hex[:8]}"


def create_demo_module(summary: MusicWindowSummary) -> VisualModuleEnvelope:
    speed = round(0.16 + summary.energy * 0.38, 3)
    pulse = round(0.1 + summary.bassEnergy * 0.18, 3)
    spark_drift = round(0.08 + summary.midEnergy * 0.2, 3)
    bloom = round(0.16 + summary.energy * 0.24, 3)
    background_drift = round(0.03 + summary.energy * 0.05, 3)
    background_pulse = round(0.03 + summary.bassEnergy * 0.06, 3)

    code = f"""
export function createVisualModule(api) {{
  const root = api.root
  const backgroundState = {{
    wash: 0.18,
    sweep: 0,
    haloScale: 0.86,
  }}
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
  const spark = api.createMesh({{
    geometry: 'cone',
    material: 'wireframe',
    color: '#ffe45e',
    radius: 0.72,
    height: 1.8,
    opacity: 0.38,
  }})
  const light = api.createLight({{
    type: 'point',
    color: '#00e5ff',
    intensity: 2.2,
    x: 0,
    y: 2.2,
    z: 3.5,
  }})

  return {{
    init() {{
      root.add(ring)
      root.add(core)
      root.add(spark)
      root.add(light)
      api.setCamera({{ mode: 'orbit', distance: 4, height: 1.2, speed: 0.25 }})
      api.setBloom({bloom})
    }},
    drawBackground(frame, bg) {{
      const centerX = bg.width * 0.5
      const centerY = bg.height * 0.5
      const haloSize = bg.width * backgroundState.haloScale

      bg.background('#05070d', 1)
      bg.noStroke()
      bg.fill('#09111f', 0.94)
      bg.rect(0, 0, bg.width, bg.height)

      bg.fill('#0b1830', 0.12 + backgroundState.wash * 0.12)
      bg.rect(0, 0, bg.width * 0.24, bg.height)
      bg.rect(bg.width * 0.76, 0, bg.width * 0.24, bg.height)

      bg.stroke('#00e5ff', 0.05 + backgroundState.wash * 0.08)
      bg.strokeWeight(1)
      for (let i = 0; i < 6; i += 1) {{
        const lineY = ((i / 6) * bg.height + backgroundState.sweep * bg.height) % bg.height
        bg.line(0, lineY, bg.width, lineY)
      }}

      bg.noStroke()
      bg.fill('#ff3d81', 0.05 + frame.audio.bassEnergy * {background_pulse})
      bg.circle(centerX, centerY, haloSize)
      bg.fill('#00e5ff', 0.03 + frame.audio.highEnergy * 0.04)
      bg.circle(centerX, centerY, haloSize * 0.58)
    }},
    update(frame) {{
      backgroundState.wash = api.lerp(backgroundState.wash, 0.18 + frame.audio.energy * 0.32, frame.delta * 1.4)
      backgroundState.sweep = (backgroundState.sweep + frame.delta * ({background_drift} + frame.audio.energy * 0.025)) % 1
      backgroundState.haloScale = api.lerp(backgroundState.haloScale, 0.72 + frame.audio.bassEnergy * 0.18 + frame.audio.beatStrength * 0.05, frame.delta * 1.8)

      const pulse = 1 + frame.audio.bassEnergy * {pulse} + frame.audio.beatStrength * 0.08
      ring.rotation.x += frame.delta * {speed}
      ring.rotation.y += frame.delta * ({speed} + frame.audio.highEnergy * 0.14)
      ring.scale.setScalar(pulse)
      core.rotation.y += frame.delta * 0.18
      core.scale.setScalar(0.86 + backgroundState.wash * 0.2 + frame.audio.beatStrength * 0.04)
      core.material.setEmissiveIntensity(0.35 + backgroundState.wash * 0.8 + frame.audio.highEnergy * 0.28)
      spark.rotation.y -= frame.delta * ({spark_drift} + frame.audio.midEnergy * 0.14)
      spark.rotation.z = api.sin(frame.time * 0.45) * 0.18
      spark.scale.setScalar(0.78 + frame.audio.highEnergy * 0.12 + frame.audio.beatStrength * 0.08)
      light.setIntensity(1.15 + backgroundState.wash * 1.1 + frame.audio.beatStrength * 0.25)
      api.setRgbShift(frame.audio.beat ? 0.06 : 0.015)
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
        moduleId=_module_id("agent", summary),
        targetLayer="canvas",
        duration=summary.windowSeconds,
        transitionSeconds=4,
        code=code,
        source="fallback",
    )
