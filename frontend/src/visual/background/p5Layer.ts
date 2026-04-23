export class P5Layer {
  private element: HTMLDivElement | null = null

  constructor(private readonly container: HTMLElement) {}

  mount(): void {
    if (this.element) {
      throw new Error('p5 layer is already mounted')
    }

    this.element = document.createElement('div')
    this.element.className = 'visual-layer background'
    this.container.appendChild(this.element)
  }

  unmount(): void {
    if (!this.element) {
      return
    }

    this.element.remove()
    this.element = null
  }
}
