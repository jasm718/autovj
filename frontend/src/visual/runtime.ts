import { P5Layer } from './background/p5Layer'
import { ThreeLayer } from './foreground/threeLayer'

export class VisualRuntime {
  private readonly background: P5Layer
  private readonly foreground: ThreeLayer

  constructor(private readonly container: HTMLElement) {
    this.background = new P5Layer(container)
    this.foreground = new ThreeLayer(container)
  }

  mount(): void {
    this.background.mount()
    this.foreground.mount()
  }

  unmount(): void {
    this.foreground.unmount()
    this.background.unmount()
  }
}
