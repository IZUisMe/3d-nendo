import type { InputSource, InputState } from './types';

/** 比較用のマウス操作: 左ボタンを押している間だけ掴む。ホイールで90°回す */
export class MouseSource implements InputSource {
  readonly name = 'mouse' as const;
  private ndc: { x: number; y: number } | null = null;
  private down = false;
  private steps = 0;
  private wheelCooldown = 0;
  private abort = new AbortController();

  constructor(private el: HTMLElement) {
    const opts = { signal: this.abort.signal };
    el.addEventListener('pointermove', (e) => this.move(e), opts);
    el.addEventListener('pointerleave', () => (this.ndc = null), opts);
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        this.move(e);
        this.down = true;
      },
      opts,
    );
    window.addEventListener('pointerup', (e) => e.button === 0 && (this.down = false), opts);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        // トラックパッドの連続イベントで回りすぎないよう間引く
        const now = performance.now();
        if (now < this.wheelCooldown || Math.abs(e.deltaY) < 1) return;
        this.wheelCooldown = now + 180;
        this.steps += e.deltaY > 0 ? -1 : 1;
      },
      { ...opts, passive: false },
    );
  }

  private move(e: PointerEvent) {
    const r = this.el.getBoundingClientRect();
    this.ndc = {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -((e.clientY - r.top) / r.height) * 2 + 1,
    };
  }

  poll(): InputState {
    const steps = this.steps;
    this.steps = 0;
    return { tracked: this.ndc !== null, ndc: this.ndc, grab: this.down, rotateSteps: steps, rotateSrc: 'wheel' };
  }

  dispose() {
    this.abort.abort();
  }
}
