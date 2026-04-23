export class ThreeLayer {
  private element: HTMLDivElement | null = null

  constructor(private readonly container: HTMLElement) {}

  mount(): void {
    if (this.element) {
      throw new Error('three layer is already mounted')
    }

    this.element = document.createElement('div')
    this.element.className = 'visual-layer foreground'
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
