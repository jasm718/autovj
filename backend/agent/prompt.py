from backend.agent.schema import MusicWindowSummary
from backend.strategy.capability import FORBIDDEN_CODE_TOKENS, GEOMETRIES, MATERIALS, MODELS


CREATIVE_DIRECTIONS: tuple[dict[str, str], ...] = (
    {
        "name": "moire-grid",
        "prompt": "参考优秀 p5.js 作品里常见的 moire / grid / lattice 语言：全屏网格、条纹叠加、边缘扫描线、克制霓虹配色、缓慢视差。",
    },
    {
        "name": "flow-field-ribbons",
        "prompt": "参考优秀 p5.js 作品里的 flow field / ribbon 语言：成片弧线、轮廓流动、缓慢漂移、边缘延展、局部高频点缀。",
    },
    {
        "name": "geometric-quilt",
        "prompt": "参考优秀 p5.js 作品里的几何拼贴与分区构图：tile、cell、band、mask、对角分割、明确的版面节奏。",
    },
    {
        "name": "cut-paper-bands",
        "prompt": "参考优秀 p5.js 作品里的 cut-paper / poster layering 语言：大色块、边缘框带、层叠矩形、慢呼吸脉冲。",
    },
    {
        "name": "topographic-waves",
        "prompt": "参考优秀 p5.js 作品里的地形线与波纹语言：层层等高线、缓慢扫描、线性纵深、节制发光。",
    },
    {
        "name": "particle-constellation",
        "prompt": "参考优秀 p5.js 作品里的粒子星图与辐射连线语言：稀疏粒子、局部连线、边缘星雾、中心克制。",
    },
)

MOOD_DIRECTION_PRIORITY: dict[str, tuple[str, ...]] = {
    "ambient": ("topographic-waves", "flow-field-ribbons", "particle-constellation"),
    "dreamy": ("flow-field-ribbons", "topographic-waves", "cut-paper-bands"),
    "steady": ("moire-grid", "geometric-quilt", "topographic-waves"),
    "groove": ("geometric-quilt", "cut-paper-bands", "moire-grid"),
    "shimmer": ("particle-constellation", "moire-grid", "flow-field-ribbons"),
    "intense": ("moire-grid", "particle-constellation", "cut-paper-bands"),
}


VISUAL_MODULE_SYSTEM_PROMPT = """
你是 AutoVJ 的后端视觉模块 agent。

你必须只输出一个 JSON 对象，JSON 必须符合 Visual Module Envelope v1：
{
  "type": "visual_module",
  "apiVersion": "1",
  "moduleId": "unique-id",
  "targetLayer": "canvas",
  "duration": 30,
  "transitionSeconds": 4,
  "code": "export function createVisualModule(api) { ... }"
}

硬性边界：
- 生成完整 canvas 视觉模块：可以同时控制 three.js 前景对象和 p5 背景绘制，但不能生成页面、DOM、canvas 或 renderer。
- code 只能包含一个 `export function createVisualModule(api)`。
- lifecycle 必须返回 `{ init() {}, drawBackground(frame, bg) {}, update(frame) {}, dispose() {} }`，`drawBackground` 不能省略。
- 只能使用传入的 `api`，不要访问 window、document、globalThis、self。
- 不要 import，不要 fetch，不要 eval，不要 Function，不要 Promise，不要 async/await。
- 不要 requestAnimationFrame、setTimeout、setInterval、WebSocket、Worker。
- 不要 while、do...while、for...of、for...in。
- 不要自定义 shader，不要创建 THREE.WebGLRenderer。
- 每个模块最多 40 mesh、2 个 particle system、每个 particle system 最多 3000 粒子、最多 4 个 light。
- 不输出 Markdown，不输出解释文本，不输出代码块围栏。

可用 Visual API v1：
- api.root
- api.createGroup({ name })
- api.createMesh({ geometry, material, color, opacity, size, radius, tube, width, height, depth, segments })
- api.createParticles({ count, color, size, spread, opacity })
- api.getModel(name)
- api.createLight({ type, color, intensity, x, y, z })
- api.setCamera({ mode, distance, height, speed })
- api.setBloom(value)
- api.setRgbShift(value)
- api.setAfterimage(value)
- api.lerp(a, b, t), api.clamp(value, min, max), api.sin(value), api.cos(value), api.noise(x, y, z)

可用背景 bg API：
- bg.width, bg.height
- bg.clear(alpha), bg.background(color, alpha)
- bg.fill(color, alpha), bg.noFill()
- bg.stroke(color, alpha), bg.noStroke(), bg.strokeWeight(value)
- bg.blendMode(mode)
- bg.push(), bg.pop(), bg.translate(x, y), bg.rotate(angle), bg.scale(x, y)
- bg.circle(x, y, d), bg.ellipse(x, y, w, h), bg.rect(x, y, w, h, radius), bg.line(x1, y1, x2, y2)
- bg.beginShape(), bg.vertex(x, y), bg.endShape(close)
- bg.text(value, x, y), bg.textSize(size), bg.textAlign(horizontal, vertical)
- bg.noise(x, y, z), bg.sin(v), bg.cos(v), bg.map(v, a1, b1, a2, b2), bg.clamp(v, min, max)
- alpha 优先使用 `0-1` 小数，例如 `0.08`、`0.35`、`0.9`。

视觉目标：
- 根据音乐摘要生成一个 20-45 秒可循环更新的整画布 VJ 模块。
- 这个版本里不要依赖任何预设背景元素；你必须实现 drawBackground，并自己决定背景结构、位置、运动和层次。
- 背景必须是真正“全屏”的，不要只在中心附近画一个小图形。背景至少要覆盖整个画布，并且让四个边角也能看到明显的视觉语言。
- 主体构图必须默认居中：主要 three.js 对象围绕世界原点 `(0, 0, 0)` 组织，屏幕视觉重心位于中间 40% 区域。
- 音乐进入强拍时，背景和主体都要有肉眼可见的大动作，而不是只有很轻微的缩放或颜色变化。
- bassEnergy 强时强调脉冲、缩放、低频几何或大面积背景运动。
- highEnergy 强时强调闪烁、细线、粒子、背景纹理或 RGB shift。
- beatDensity 高时让 drawBackground(frame, bg) 和 update(frame) 都对 frame.audio.beatStrength 有清晰反应。
- 背景主运动优先跟随 energy、bassEnergy 这类慢变化；如果要平滑，优先在模块内部用 `api.lerp` 维护缓慢状态。
- 不要让整张背景直接跟着 highEnergy 每帧抖动、闪烁或频闪；highEnergy 更适合局部细节、边缘纹理和小面积 accent。
- 主体持续旋转默认保持中低速，尤其是居中的球体、环体或 core orb；beatStrength 应该更像短促 accent，而不是长期把旋转速度推到很高。
- 尽量参考 p5.js 社区里优秀 generative art 作品的语言：强构图、整屏边缘利用、分层网格或流场、moire、scanline、topographic line、poster-like bands、克制但有辨识度的配色。
- 这种参考是借鉴“视觉语言和构图方法”，不是复制任何单一作品；每次都应当给出新的形态家族和背景母题。
- 模块必须能在前端 runtime 中安全预热、crossfade 和 dispose。
- three.js 主体默认围绕世界原点 `(0, 0, 0)` 构图，视觉重心应该位于屏幕中心附近，不要把主要物体放到边角。
- 非必要不要把对象整体平移到大于 `|x| > 1.5` 或 `|y| > 1.2` 的位置。

重要：
- 优先生成简单但完整、画面存在感强的整画布模块。
- 最好只用 1-4 个 mesh、0-1 个 light，加一个明确的 drawBackground。
- 不要使用 getModel、复杂循环或大量对象。
- drawBackground 必须先画底色，再画 2-4 组覆盖整屏的层次，例如全屏条纹、四角光带、大圆环、扫描线、网格、放射线中的任意组合。
- 背景不要只画中心圆；要有至少一组元素延伸到接近画布边缘。
- 背景代码里至少包含一种“边缘主导”元素：横向扫描线、纵向条纹、四角光带、对角线、全屏网格、或覆盖左右边缘的大矩形带状层。
- update(frame) 里要让主体有明显节拍动作，例如 0.15-0.45 范围的缩放脉冲、0.2-1.2 范围的位移摆动、或清晰的旋转加速度。
- 避免连续两次输出几乎同一种“中心 orb + ring + halo background”结构；主动切换 geometry 组合、背景母题和画面分区方式。
- 代码务必严格匹配前端 contract，否则模块会被拒绝。
""".strip()


def choose_creative_direction(summary: MusicWindowSummary, recent_modules: list[str] | None = None) -> dict[str, str]:
    recent_modules = recent_modules or []
    recent_directions = {
        module.split("direction=", 1)[1].split(";", 1)[0].strip()
        for module in recent_modules
        if "direction=" in module
    }
    recent_directions.discard("")

    directions_by_name = {direction["name"]: direction for direction in CREATIVE_DIRECTIONS}
    preferred_names = MOOD_DIRECTION_PRIORITY.get(
        summary.moodHint,
        tuple(direction["name"] for direction in CREATIVE_DIRECTIONS),
    )

    for name in preferred_names:
        if name not in recent_directions:
            return directions_by_name[name]

    for direction in CREATIVE_DIRECTIONS:
        if direction["name"] not in recent_directions:
            return direction

    return directions_by_name[preferred_names[0]]


def build_visual_module_user_prompt(
    summary: MusicWindowSummary,
    recent_modules: list[str] | None = None,
    creative_direction: dict[str, str] | None = None,
) -> str:
    recent_modules = recent_modules or []
    creative_direction = creative_direction or choose_creative_direction(summary, recent_modules)
    recent_modules_section = "\n".join(f"- {module}" for module in recent_modules) if recent_modules else "- 无，优先建立一个新鲜的第一版形态。"

    return f"""
根据下面的音乐窗口摘要生成一个新的 Visual Module Envelope。
这次请优先生成“最小可用、能通过校验、且真正控制整张画布”的模块。

音乐窗口摘要：
- windowSeconds: {summary.windowSeconds}
- bpm: {summary.bpm:.2f}
- energy: {summary.energy:.3f}
- bassEnergy: {summary.bassEnergy:.3f}
- midEnergy: {summary.midEnergy:.3f}
- highEnergy: {summary.highEnergy:.3f}
- beatDensity: {summary.beatDensity:.3f}
- moodHint: {summary.moodHint}

可用 geometry: {", ".join(GEOMETRIES)}
可用 material: {", ".join(MATERIALS)}
可用 model: {", ".join(MODELS)}
禁止 token: {", ".join(FORBIDDEN_CODE_TOKENS)}

本次创作方向：
- name: {creative_direction["name"]}
- guidance: {creative_direction["prompt"]}

参考倾向：
- 把 p5.js 社区里优秀 generative art 作品的语言当作灵感来源：layering、grid / moire、flow field、scanline、band、contour、edge framing、slow pulse。
- 参考的是视觉方法，不是复刻任何具体作品；要保留 AutoVJ 的实时、整屏、音乐响应特征。

最近模块摘要：
{recent_modules_section}

输出要求：
- 只输出 JSON 对象。
- moduleId 必须唯一，并体现 mood 或音乐特征。
- duration 使用 {summary.windowSeconds}。
- transitionSeconds 建议 3-5。
- code 字符串内必须是完整 JavaScript 模块入口。
- targetLayer 必须是 canvas。
- 只允许使用这些 API 名称：api.root, api.createGroup, api.createMesh, api.createParticles, api.createLight, api.setCamera, api.setBloom, api.setRgbShift, api.setAfterimage, api.sin, api.cos, api.clamp, api.lerp, api.noise，以及 bg 上暴露的方法。
- 必须避免依赖任何“默认背景存在”的前提；背景内容必须由 drawBackground 决定。
- 优先生成一个简单背景 + 1-3 个 three.js 对象的小模块。
- 背景必须覆盖整屏，不允许只在中心附近画一个小区域。
- 主体默认位于屏幕中心附近，不允许把主视觉放在右下角、左下角或其他边角。
- drawBackground 里必须包含至少一个全屏底层和至少一个覆盖到边缘的动态层。
- drawBackground 里必须包含至少一个“边缘主导”层，保证左右边缘或上下边缘不是空的。
- 强拍时背景和主体都必须有清晰可见的变化。
- 避免重复最近已经用过的主 geometry、主背景母题和构图骨架；如果最近用了 sphere/torus/orb，就优先尝试 box/plane/cone/cylinder 或完全不同的背景组织方法。
- 本次必须响应上面的 creative direction，不要再次退回默认的中心 orb demo 语言。
- 如果主体使用球体、环体或中心 orb，基础自转保持偏慢到中速，不要做持续高速自转。
- 背景的大层次优先做缓慢漂移、呼吸、扫描或低频脉冲，不要把高频能量直接映射成整屏跳动。
- 不要使用 while / do...while / for...of / for...in。
- 如果要循环，最多使用简单 `for (let i = 0; i < N; i += 1)`，并且 N 尽量小于 64。
- 主视觉主体默认放在世界原点附近，保证屏幕中心构图。
- 返回值必须严格是：
  export function createVisualModule(api) {{
    return {{
      init() {{}},
      drawBackground(frame, bg) {{}},
      update(frame) {{}},
      dispose() {{}},
    }}
  }}
""".strip()
