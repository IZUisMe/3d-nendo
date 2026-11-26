import { config } from '../config';

/** 角度差を -180〜180 に収める */
export const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * ラチェット式のひねり判定（手・スマホ共通）。
 * 掴んだ瞬間の角度を基準に、一定角度ひねると 90° 回り、基準付近に戻すまで次は回らない。
 * angle は「時計回りが正」の角度。時計回り → 上から見て時計回り（-1）を返す。
 */
export class TwistRatchet {
  private base = 0;
  private armed = true;
  private active = false;

  update(holding: boolean, angleDeg: number): number {
    if (!holding) {
      this.active = false;
      return 0;
    }
    if (!this.active) {
      this.active = true;
      this.base = angleDeg;
      this.armed = true;
      return 0;
    }
    const d = wrapDeg(angleDeg - this.base);
    if (this.armed && Math.abs(d) > config.twistStepDeg) {
      this.armed = false;
      return d > 0 ? -1 : 1;
    }
    if (!this.armed && Math.abs(d) < config.twistRearmDeg) this.armed = true;
    return 0;
  }
}
