import type { RotateSrc } from './input/types';

export type LogEventType =
  | 'grab_attempt'
  | 'grab_ok'
  | 'grab_miss'
  | 'place_ok'
  | 'place_fail'
  | 'floor_drop'
  | 'lost_drop'
  | 'rotate'
  | 'turntable'
  | 'complete'
  | 'abort';

export interface LogEvent {
  t: number; // 開始からの経過ミリ秒
  type: LogEventType;
  src?: RotateSrc;
  part?: string;
}

/** 1回の実験の記録 */
export class SessionLog {
  readonly startedAt = new Date().toISOString();
  private t0 = performance.now();
  events: LogEvent[] = [];
  fpsSamples: number[] = [];
  detectMsSamples: number[] = [];
  durationMs: number | null = null;
  completed = false;
  survey: { fatigue: number; frustration: number } | null = null;

  constructor(
    readonly participant: string,
    readonly mode: 'hand' | 'mouse' | 'phone',
    readonly env: Record<string, string | number>,
  ) {}

  get elapsedMs() {
    return this.durationMs ?? performance.now() - this.t0;
  }

  add(type: LogEventType, extra: Omit<LogEvent, 't' | 'type'> = {}) {
    if (this.durationMs !== null) return;
    this.events.push({ t: Math.round(performance.now() - this.t0), type, ...extra });
  }

  finish(completed: boolean) {
    if (this.durationMs !== null) return;
    this.add(completed ? 'complete' : 'abort');
    this.completed = completed;
    this.durationMs = performance.now() - this.t0;
  }

  count(type: LogEventType, src?: RotateSrc) {
    return this.events.filter((e) => e.type === type && (src === undefined || e.src === src)).length;
  }

  summary() {
    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const attempts = this.count('grab_attempt');
    const ok = this.count('grab_ok');
    return {
      participant: this.participant,
      mode: this.mode,
      startedAt: this.startedAt,
      completed: this.completed,
      durationSec: +(this.elapsedMs / 1000).toFixed(1),
      grabAttempts: attempts,
      grabOk: ok,
      grabSuccessRate: attempts ? +(ok / attempts).toFixed(3) : 0,
      lostDrops: this.count('lost_drop'),
      placeOk: this.count('place_ok'),
      placeFail: this.count('place_fail'),
      floorDrops: this.count('floor_drop'),
      rotateTwist: this.count('rotate', 'twist'),
      rotateKey: this.count('rotate', 'key'),
      rotateWheel: this.count('rotate', 'wheel'),
      rotateRoll: this.count('rotate', 'roll'),
      rotateButton: this.count('rotate', 'button'),
      turntable: this.count('turntable'),
      fpsAvg: +avg(this.fpsSamples).toFixed(1),
      fpsMin: this.fpsSamples.length ? Math.min(...this.fpsSamples) : 0,
      detectMsAvg: +avg(this.detectMsSamples).toFixed(1),
      fatigue: this.survey?.fatigue ?? '',
      frustration: this.survey?.frustration ?? '',
      ...this.env,
    };
  }

  toJSON() {
    return JSON.stringify(
      { summary: this.summary(), events: this.events, fpsSamples: this.fpsSamples, detectMsSamples: this.detectMsSamples },
      null,
      2,
    );
  }

  toCSV() {
    const s = this.summary();
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    return `${Object.keys(s).map(esc).join(',')}\n${Object.values(s).map(esc).join(',')}\n`;
  }

  fileBase() {
    const stamp = this.startedAt.replace(/[:.]/g, '-');
    return `lego_${this.participant || 'anon'}_${this.mode}_${stamp}`;
  }
}
