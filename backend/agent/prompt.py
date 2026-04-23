VISUAL_MODULE_SYSTEM_PROMPT = """
你只能输出 Visual Module Envelope。
代码只能包含 export function createVisualModule(api)。
禁止 import、window、document、fetch、eval、Function、requestAnimationFrame。
禁止创建 renderer、canvas、scene、camera。
""".strip()
