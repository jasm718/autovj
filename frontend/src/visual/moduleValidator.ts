import { Parser } from 'acorn'
import { ancestor, simple } from 'acorn-walk'
import type { ForStatement, Identifier, MemberExpression, NewExpression, Node, Program } from 'acorn'

import type { VisualModuleEnvelope } from '../contract/visualContract'

type AcornNode = Node & {
  type: string
  [key: string]: unknown
}

type FunctionNode = AcornNode & {
  id?: AcornNode | null
  params?: AcornNode[]
}

const CODE_MAX_LENGTH = 12_000
const MAX_LOOP_DEPTH = 2
const ALLOWED_TOP_LEVEL_NODES = new Set(['ExportNamedDeclaration'])
const FORBIDDEN_IDENTIFIER_NAMES = new Set([
  'window',
  'document',
  'globalThis',
  'self',
  'fetch',
  'eval',
  'Function',
  'Promise',
  'WebSocket',
  'Worker',
  'localStorage',
  'sessionStorage',
  'XMLHttpRequest',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
])
const FORBIDDEN_MEMBER_PATTERNS = new Set(['THREE.WebGLRenderer'])
const FORBIDDEN_NEW_NAMES = new Set(['Function', 'Promise', 'WebSocket', 'Worker', 'XMLHttpRequest'])

const parser = Parser.extend()

function isNode(value: unknown): value is AcornNode {
  return typeof value === 'object' && value !== null && 'type' in value
}

function toAcornNode<T extends Node>(node: T): AcornNode {
  return node as unknown as AcornNode
}

function parseModuleAst(code: string): AcornNode {
  return parser.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }) as unknown as AcornNode
}

function getIdentifierName(node: AcornNode | null | undefined): string | null {
  if (!node) {
    return null
  }

  if (node.type === 'Identifier') {
    return typeof node.name === 'string' ? node.name : null
  }

  return null
}

function getMemberExpressionPath(node: AcornNode): string | null {
  if (node.type === 'Identifier') {
    return typeof node.name === 'string' ? node.name : null
  }

  if (node.type !== 'MemberExpression') {
    return null
  }

  if (node.computed) {
    return null
  }

  const objectPath = isNode(node.object) ? getMemberExpressionPath(node.object) : null
  const propertyName = isNode(node.property) ? getIdentifierName(node.property) : null

  if (!objectPath || !propertyName) {
    return null
  }

  return `${objectPath}.${propertyName}`
}

function getLoopFixedUpperBound(node: AcornNode): number | null {
  if (node.type !== 'ForStatement') {
    return null
  }

  if (!isNode(node.test) || node.test.type !== 'BinaryExpression') {
    return null
  }

  const operator = typeof node.test.operator === 'string' ? node.test.operator : null
  if (operator !== '<' && operator !== '<=') {
    return null
  }

  const right = isNode(node.test.right) ? node.test.right : null
  if (!right || right.type !== 'Literal' || typeof right.value !== 'number') {
    return null
  }

  return operator === '<=' ? right.value + 1 : right.value
}

export function validateVisualModuleEnvelope(envelope: VisualModuleEnvelope): void {
  if (envelope.type !== 'visual_module') {
    throw new Error(`unsupported envelope type: ${envelope.type}`)
  }

  if (envelope.apiVersion !== '1') {
    throw new Error(`unsupported visual api version: ${envelope.apiVersion}`)
  }

  if (envelope.targetLayer !== 'canvas') {
    throw new Error(`unsupported target layer: ${envelope.targetLayer}`)
  }

  if (!envelope.moduleId.trim()) {
    throw new Error('visual module must include a non-empty moduleId')
  }

  if (envelope.duration < 1 || envelope.duration > 300) {
    throw new Error(`visual module duration is out of range: ${envelope.duration}`)
  }

  if (envelope.transitionSeconds < 0 || envelope.transitionSeconds > 30) {
    throw new Error(`visual module transitionSeconds is out of range: ${envelope.transitionSeconds}`)
  }

  if (!envelope.code.trim()) {
    throw new Error('visual module code is empty')
  }

  if (envelope.code.length > CODE_MAX_LENGTH) {
    throw new Error(`visual module code exceeds ${CODE_MAX_LENGTH} characters`)
  }

  validateVisualModuleCode(envelope.code)
}

export function validateVisualModuleCode(code: string): void {
  const ast = parseModuleAst(code) as Program & AcornNode
  const body = Array.isArray(ast.body) ? (ast.body as AcornNode[]) : []

  if (body.length !== 1 || !ALLOWED_TOP_LEVEL_NODES.has(body[0]?.type ?? '')) {
    throw new Error('visual module must only export createVisualModule(api)')
  }

  const exportNode = body[0]
  const declaration = isNode(exportNode.declaration) ? exportNode.declaration : null

  if (!declaration || declaration.type !== 'FunctionDeclaration') {
    throw new Error('visual module must export a function declaration')
  }

  const functionNode = declaration as FunctionNode
  if (getIdentifierName(functionNode.id ?? null) !== 'createVisualModule') {
    throw new Error('visual module must export createVisualModule(api)')
  }

  const params = Array.isArray(functionNode.params) ? functionNode.params : []
  if (params.length !== 1 || getIdentifierName(params[0] as AcornNode) !== 'api') {
    throw new Error('createVisualModule must accept exactly one api parameter')
  }

  if (!code.includes('drawBackground(frame, bg)')) {
    throw new Error('visual module lifecycle must include drawBackground(frame, bg)')
  }

  simple(ast, {
    ImportDeclaration() {
      throw new Error('visual module cannot import modules')
    },
    ExportDefaultDeclaration() {
      throw new Error('visual module cannot use export default')
    },
    ClassDeclaration() {
      throw new Error('visual module cannot declare classes')
    },
    ClassExpression() {
      throw new Error('visual module cannot declare classes')
    },
    AwaitExpression() {
      throw new Error('visual module cannot use await')
    },
    YieldExpression() {
      throw new Error('visual module cannot use generators')
    },
    WhileStatement() {
      throw new Error('visual module cannot use while loops')
    },
    DoWhileStatement() {
      throw new Error('visual module cannot use do...while loops')
    },
    ForInStatement() {
      throw new Error('visual module cannot use for...in loops')
    },
    ForOfStatement() {
      throw new Error('visual module cannot use for...of loops')
    },
    ImportExpression() {
      throw new Error('visual module cannot use dynamic imports')
    },
    Identifier(node: Identifier) {
      const name = getIdentifierName(toAcornNode(node))
      if (name && FORBIDDEN_IDENTIFIER_NAMES.has(name)) {
        throw new Error(`visual module contains forbidden identifier: ${name}`)
      }
    },
    MemberExpression(node: MemberExpression) {
      const path = getMemberExpressionPath(toAcornNode(node))
      if (path && FORBIDDEN_MEMBER_PATTERNS.has(path)) {
        throw new Error(`visual module contains forbidden member access: ${path}`)
      }
    },
    NewExpression(node: NewExpression) {
      const callee = isNode(node.callee) ? node.callee : null
      const calleeName = callee ? getIdentifierName(callee) ?? getMemberExpressionPath(callee) : null
      if (calleeName && FORBIDDEN_NEW_NAMES.has(calleeName)) {
        throw new Error(`visual module cannot instantiate ${calleeName}`)
      }
    },
  })

  ancestor(ast, {
    ForStatement(node: ForStatement, _state, ancestors: Node[]) {
      const fixedUpperBound = getLoopFixedUpperBound(toAcornNode(node))
      if (fixedUpperBound === null) {
        throw new Error('visual module for loops must use a fixed numeric upper bound')
      }

      if (fixedUpperBound > 3000) {
        throw new Error('visual module for loop upper bound is too large')
      }

      const loopDepth = ancestors.filter((ancestorNode) => {
        return (
          ancestorNode.type === 'ForStatement' ||
          ancestorNode.type === 'WhileStatement' ||
          ancestorNode.type === 'DoWhileStatement' ||
          ancestorNode.type === 'ForInStatement' ||
          ancestorNode.type === 'ForOfStatement'
        )
      }).length

      if (loopDepth > MAX_LOOP_DEPTH) {
        throw new Error(`visual module loop nesting exceeds ${MAX_LOOP_DEPTH} levels`)
      }
    },
  })
}
