import { NUM_BUTTONS } from "./consts";

// Two keys per button so both arrows+ZX and WASD+JK players are covered.
const KEY_MAP: Record<string, number> = {
  ArrowLeft: 0, KeyA: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowUp: 2, KeyW: 2,
  ArrowDown: 3, KeyS: 3,
  KeyZ: 4, KeyJ: 4, Space: 4, Enter: 4,
  KeyX: 5, KeyK: 5,
  KeyC: 6, KeyU: 6,
  KeyV: 7, KeyI: 7,
};

// Standard Gamepad mapping: face buttons 0..3, d-pad 12..15.
const PAD_MAP: [number, number][] = [
  [14, 0], [15, 1], [12, 2], [13, 3], [0, 4], [1, 5], [2, 6], [3, 7],
];
const AXIS_DEAD = 0.5;

/**
 * Merges keyboard, gamepads and the on-screen touch pad into eight buttons.
 * Call update() once per game frame, before the cart's update().
 */
export class Input {
  private readonly keyDown = new Uint8Array(NUM_BUTTONS);
  private readonly touchDown = new Uint8Array(NUM_BUTTONS);
  /** Frames each button has been held; 0 = up. */
  private readonly held = new Uint32Array(NUM_BUTTONS);
  private readonly released = new Uint8Array(NUM_BUTTONS);
  private readonly keysHeld = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => {
      const b = KEY_MAP[e.code];
      if (b === undefined) return;
      e.preventDefault();
      this.keysHeld.add(e.code);
      this.keyDown[b] = 1;
    };
    const up = (e: KeyboardEvent) => {
      const b = KEY_MAP[e.code];
      if (b === undefined) return;
      this.keysHeld.delete(e.code);
      // Only release if no other key bound to this button is still down.
      this.keyDown[b] = [...this.keysHeld].some((k) => KEY_MAP[k] === b) ? 1 : 0;
    };
    const blur = () => {
      this.keysHeld.clear();
      this.keyDown.fill(0);
      this.touchDown.fill(0);
    };
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
    };
  }

  setTouch(button: number, down: boolean): void {
    this.touchDown[button] = down ? 1 : 0;
  }

  update(): void {
    const pad = new Uint8Array(NUM_BUTTONS);
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      for (const [gi, b] of PAD_MAP) if (gp.buttons[gi]?.pressed) pad[b] = 1;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (ax < -AXIS_DEAD) pad[0] = 1;
      if (ax > AXIS_DEAD) pad[1] = 1;
      if (ay < -AXIS_DEAD) pad[2] = 1;
      if (ay > AXIS_DEAD) pad[3] = 1;
    }
    for (let b = 0; b < NUM_BUTTONS; b++) {
      const down = this.keyDown[b] || this.touchDown[b] || pad[b];
      this.released[b] = !down && this.held[b]! > 0 ? 1 : 0;
      this.held[b] = down ? this.held[b]! + 1 : 0;
    }
  }

  btn(b: number): boolean {
    return (this.held[b] ?? 0) > 0;
  }

  /**
   * True on the frame the button went down. With hold and repeat (in frames),
   * also true every `repeat` frames once it has been held `hold` frames.
   */
  btnp(b: number, hold = 0, repeat = 0): boolean {
    const h = this.held[b] ?? 0;
    if (h === 1) return true;
    if (hold > 0 && repeat > 0 && h > hold) return (h - hold - 1) % repeat === 0;
    return false;
  }

  /** True on the frame the button was released. */
  btnr(b: number): boolean {
    return this.released[b] === 1;
  }
}
