import P5 from 'p5'

import type { VisualFrame } from '../../contract/visualContract'

type SafeBlendMode = 'blend' | 'add' | 'screen' | 'multiply' | 'lightest'

type SafeBackgroundSize = {
  width: number
  height: number
}

export type SafeP5BackgroundApi = {
  readonly width: number
  readonly height: number
  clear(alpha?: number): void
  background(color: string, alpha?: number): void
  fill(color: string, alpha?: number): void
  noFill(): void
  stroke(color: string, alpha?: number): void
  noStroke(): void
  strokeWeight(value: number): void
  blendMode(mode: SafeBlendMode): void
  push(): void
  pop(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  scale(x: number, y?: number): void
  circle(x: number, y: number, diameter: number): void
  ellipse(x: number, y: number, width: number, height: number): void
  rect(x: number, y: number, width: number, height: number, radius?: number): void
  line(x1: number, y1: number, x2: number, y2: number): void
  beginShape(): void
  vertex(x: number, y: number): void
  endShape(close?: boolean): void
  text(value: string, x: number, y: number): void
  textSize(size: number): void
  textAlign(horizontal: 'left' | 'center' | 'right', vertical?: 'top' | 'center' | 'bottom'): void
  noise(x: number, y?: number, z?: number): number
  sin(value: number): number
  cos(value: number): number
  map(value: number, start1: number, stop1: number, start2: number, stop2: number): number
  clamp(value: number, min: number, max: number): number
}

type BackgroundRenderer = (frame: VisualFrame, bg: SafeP5BackgroundApi) => void

const DEFAULT_RENDERER: BackgroundRenderer = (_frame, bg) => {
  bg.clear(255)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toAlpha(alpha?: number): number | undefined {
  if (alpha === undefined) {
    return undefined
  }

  if (alpha <= 1) {
    return clamp(alpha * 255, 0, 255)
  }

  return clamp(alpha, 0, 255)
}

function parseColor(color: string): { r: number; g: number; b: number } {
  const hex = color.trim()

  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const normalized = hex
      .slice(1)
      .split('')
      .map((chunk) => chunk + chunk)
      .join('')
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    }
  }

  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    }
  }

  const rgbMatch = hex.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
  if (rgbMatch) {
    return {
      r: clamp(Number.parseInt(rgbMatch[1] ?? '0', 10), 0, 255),
      g: clamp(Number.parseInt(rgbMatch[2] ?? '0', 10), 0, 255),
      b: clamp(Number.parseInt(rgbMatch[3] ?? '0', 10), 0, 255),
    }
  }

  return {
    r: 255,
    g: 255,
    b: 255,
  }
}

function toBlendMode(mode: SafeBlendMode): 'source-over' | 'lighter' | 'screen' | 'multiply' | 'lighten' {
  switch (mode) {
    case 'add':
      return 'lighter'
    case 'screen':
      return 'screen'
    case 'multiply':
      return 'multiply'
    case 'lightest':
      return 'lighten'
    case 'blend':
    default:
      return 'source-over'
  }
}

function toTextAlignHorizontal(value: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  return value
}

function toTextAlignVertical(value: 'top' | 'center' | 'bottom'): 'top' | 'center' | 'bottom' {
  switch (value) {
    case 'top':
      return 'top'
    case 'bottom':
      return 'bottom'
    case 'center':
    default:
      return 'center'
  }
}

function createBackgroundApi(p: P5, size: SafeBackgroundSize): SafeP5BackgroundApi {
  return {
    get width() {
      return size.width
    },
    get height() {
      return size.height
    },
    clear(alpha = 0) {
      p.clear(0, 0, 0, clamp(alpha, 0, 255))
    },
    background(color, alpha) {
      const parsed = parseColor(color)
      if (alpha === undefined) {
        p.background(color)
        return
      }

      p.background(parsed.r, parsed.g, parsed.b, toAlpha(alpha))
    },
    fill(color, alpha) {
      const parsed = parseColor(color)
      if (alpha === undefined) {
        p.fill(color)
        return
      }

      p.fill(parsed.r, parsed.g, parsed.b, toAlpha(alpha))
    },
    noFill() {
      p.noFill()
    },
    stroke(color, alpha) {
      const parsed = parseColor(color)
      if (alpha === undefined) {
        p.stroke(color)
        return
      }

      p.stroke(parsed.r, parsed.g, parsed.b, toAlpha(alpha))
    },
    noStroke() {
      p.noStroke()
    },
    strokeWeight(value) {
      p.strokeWeight(Math.max(0, value))
    },
    blendMode(mode) {
      p.blendMode(toBlendMode(mode))
    },
    push() {
      p.push()
    },
    pop() {
      p.pop()
    },
    translate(x, y) {
      p.translate(x, y)
    },
    rotate(angle) {
      p.rotate(angle)
    },
    scale(x, y) {
      p.scale(x, y ?? x)
    },
    circle(x, y, diameter) {
      p.circle(x, y, Math.max(0, diameter))
    },
    ellipse(x, y, width, height) {
      p.ellipse(x, y, Math.max(0, width), Math.max(0, height))
    },
    rect(x, y, width, height, radius = 0) {
      p.rect(x, y, Math.max(0, width), Math.max(0, height), Math.max(0, radius))
    },
    line(x1, y1, x2, y2) {
      p.line(x1, y1, x2, y2)
    },
    beginShape() {
      p.beginShape()
    },
    vertex(x, y) {
      p.vertex(x, y)
    },
    endShape(close = false) {
      p.endShape(close ? p.CLOSE : undefined)
    },
    text(value, x, y) {
      p.text(value, x, y)
    },
    textSize(sizeValue) {
      p.textSize(Math.max(1, sizeValue))
    },
    textAlign(horizontal, vertical = 'center') {
      p.textAlign(toTextAlignHorizontal(horizontal), toTextAlignVertical(vertical))
    },
    noise(x, y = 0, z = 0) {
      return p.noise(x, y, z)
    },
    sin(value) {
      return Math.sin(value)
    },
    cos(value) {
      return Math.cos(value)
    },
    map(value, start1, stop1, start2, stop2) {
      return p.map(value, start1, stop1, start2, stop2)
    },
    clamp(value, min, max) {
      return clamp(value, min, max)
    },
  }
}

export class P5Layer {
  private element: HTMLDivElement | null = null
  private instance: P5 | null = null
  private width = 1
  private height = 1
  private frame: VisualFrame = {
    time: 0,
    delta: 0,
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
      width: 1,
      height: 1,
      aspect: 1,
    },
  }
  private renderer: BackgroundRenderer = DEFAULT_RENDERER

  constructor(private readonly container: HTMLElement) {}

  mount(): void {
    if (this.element) {
      throw new Error('p5 layer is already mounted')
    }

    this.element = document.createElement('div')
    this.element.className = 'visual-layer background'
    this.container.appendChild(this.element)

    this.instance = new P5((p) => {
      p.setup = () => {
        const canvas = p.createCanvas(this.width, this.height)
        canvas.parent(this.element!)
        p.noLoop()
        p.pixelDensity(1)
        p.textFont('monospace')
      }

      p.draw = () => {
        const bg = createBackgroundApi(p, {
          width: this.width,
          height: this.height,
        })

        this.renderer(this.frame, bg)
      }
    }, this.element)
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    this.frame = {
      ...this.frame,
      viewport: {
        width: this.width,
        height: this.height,
        aspect: this.width / this.height,
      },
    }

    if (this.instance) {
      this.instance.resizeCanvas(this.width, this.height)
      this.instance.redraw()
    }
  }

  setRenderer(renderer?: BackgroundRenderer): void {
    this.renderer = renderer ?? DEFAULT_RENDERER
    this.instance?.redraw()
  }

  render(frame: VisualFrame): void {
    this.frame = frame
    this.instance?.redraw()
  }

  unmount(): void {
    if (this.instance) {
      this.instance.remove()
      this.instance = null
    }

    if (!this.element) {
      return
    }

    this.element.remove()
    this.element = null
  }
}
