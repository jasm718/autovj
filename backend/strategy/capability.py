GEOMETRIES = ("sphere", "box", "torus", "plane", "cone", "cylinder")
MATERIALS = ("basic", "standard", "emissive", "wireframe")
MODELS = ("orb.glb", "torus-knot.glb", "mask.glb")

FORBIDDEN_CODE_TOKENS = (
    "import",
    "export default",
    "class",
    "async",
    "await",
    "Promise",
    "fetch",
    "eval",
    "Function",
    "window",
    "document",
    "globalThis",
    "self",
    "requestAnimationFrame",
    "setTimeout",
    "setInterval",
    "WebSocket",
    "Worker",
    "localStorage",
    "sessionStorage",
    "XMLHttpRequest",
    "THREE.WebGLRenderer",
)
