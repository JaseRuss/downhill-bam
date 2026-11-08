/** Keyboard + mouse. "pressed" is true for one frame after the key goes down. */
export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private clickedFlag = false;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.clickedFlag = true;
    });
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  pressed(...codes: string[]) {
    return codes.some((c) => this.pressedSet.has(c));
  }

  /** Space or left click this frame. */
  action() {
    return this.clickedFlag || this.pressedSet.has('Space') || this.pressedSet.has('Enter');
  }

  get steer() {
    return (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  endFrame() {
    this.pressedSet.clear();
    this.clickedFlag = false;
  }
}
