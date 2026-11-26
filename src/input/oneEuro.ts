/** One Euro フィルター: 静止時の揺れは強く抑え、速い動きには遅れずに追従する */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(private params: () => { minCutoff: number; beta: number }) {}

  reset() {
    this.x = null;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.dx = 0;
      this.t = tMs;
      return value;
    }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3);
    this.t = tMs;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const { minCutoff, beta } = this.params();
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(1.0) * (rawDx - this.dx);
    const cutoff = minCutoff + beta * Math.abs(this.dx);
    this.x += alpha(cutoff) * (value - this.x);
    return this.x;
  }
}
