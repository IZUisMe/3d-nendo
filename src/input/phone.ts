import { config } from '../config';
import { OneEuro } from './oneEuro';
import { phonePose } from './phonePose';
import { TwistRatchet, wrapDeg } from './twist';
import type { InputSource, InputState, RotateSrc } from './types';

/** これより長く傾きが届かなければ「見失った」とみなす */
const STALE_MS = 500;

export type HapticKind = 'hover' | 'grab' | 'place' | 'drop' | 'rotate';

/** スマホの傾きで指すポインター方式（PC 側の受信） */
export class PhoneSource implements InputSource {
  readonly name = 'phone' as const;
  phones = 0;
  onPeers: ((phones: number) => void) | null = null;

  private ws: WebSocket | null = null;
  private closed = false;
  private latest: { a: number; b: number; g: number } | null = null;
  private grab = false;
  private lastMsgAt = 0;
  private center: { yaw: number; pitch: number } | null = null;
  private steps = 0;
  private stepsSrc: RotateSrc = 'button';
  private ratchet = new TwistRatchet();
  private euroParams = () => ({ minCutoff: config.euroMinCutoff, beta: config.euroBeta });
  private fx = new OneEuro(this.euroParams);
  private fy = new OneEuro(this.euroParams);

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(`wss://${location.host}/relay?role=pc`);
    this.ws = ws;
    ws.onclose = () => {
      this.setPhones(0);
      setTimeout(() => this.connect(), 1000);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.t) {
        case 'peers':
          this.setPhones(msg.phones);
          break;
        case 's':
          this.latest = { a: msg.a, b: msg.b, g: msg.g };
          this.grab = !!msg.grab;
          this.lastMsgAt = performance.now();
          break;
        case 'cal':
          this.center = null; // 次の傾きを正面とみなす
          break;
        case 'rot':
          this.steps += msg.steps;
          this.stepsSrc = 'button';
          break;
      }
    };
  }

  private setPhones(n: number) {
    this.phones = n;
    this.onPeers?.(n);
  }

  /** スマホを振動させる（はまった・落とした など） */
  haptic(kind: HapticKind) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'haptic', kind }));
  }

  poll(nowMs: number): InputState {
    const fresh = this.latest !== null && nowMs - this.lastMsgAt < STALE_MS;
    let ndc: { x: number; y: number } | null = null;
    if (fresh) {
      const { yaw, pitch, roll } = phonePose(this.latest!.a, this.latest!.b, this.latest!.g);
      if (!this.center) {
        this.center = { yaw, pitch };
        this.fx.reset();
        this.fy.reset();
      }
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      const x = clamp(wrapDeg(yaw - this.center.yaw) / config.phoneRangeXDeg);
      const y = clamp((pitch - this.center.pitch) / config.phoneRangeYDeg);
      ndc = { x: this.fx.filter(x, nowMs), y: this.fy.filter(y, nowMs) };

      const twist = this.ratchet.update(this.grab, roll);
      if (twist) {
        this.steps += twist;
        this.stepsSrc = 'roll';
      }
    }
    const steps = this.steps;
    this.steps = 0;
    return { tracked: fresh, ndc, grab: this.grab, rotateSteps: steps, rotateSrc: this.stepsSrc };
  }

  dispose() {
    this.closed = true;
    this.ws?.close();
  }
}
