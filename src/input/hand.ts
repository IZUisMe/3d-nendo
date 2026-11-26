import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { config } from '../config';
import { OneEuro } from './oneEuro';
import { TwistRatchet } from './twist';
import type { InputSource, InputState } from './types';

// MediaPipe の手の点の番号
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5; // 人差し指の付け根（カーソルの基準点）
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;

const BASE = import.meta.env.BASE_URL;

/** 手のトラッキング入力（内蔵カメラ・片手） */
export class HandSource implements InputSource {
  readonly name = 'hand' as const;

  /** 直近の検出1回にかかった時間（ミリ秒） */
  detectMs = 0;
  /** 現在のつまみ比率（調整パネルの表示用） */
  pinchRatio = 0;
  /** GPU で動いているか */
  delegate: 'GPU' | 'CPU' = 'GPU';
  showPreview = true;

  private lastVideoTime = -1;
  private landmarks: NormalizedLandmark[] | null = null;
  private pinched = false;
  private ratchet = new TwistRatchet();
  private pendingSteps = 0;
  private ndc: { x: number; y: number } | null = null;
  private euroParams = () => ({ minCutoff: config.euroMinCutoff, beta: config.euroBeta });
  private fx = new OneEuro(this.euroParams);
  private fy = new OneEuro(this.euroParams);
  private ctx: CanvasRenderingContext2D;

  private constructor(
    private landmarker: HandLandmarker,
    private video: HTMLVideoElement,
    private preview: HTMLCanvasElement,
  ) {
    this.ctx = preview.getContext('2d')!;
  }

  static async create(video: HTMLVideoElement, preview: HTMLCanvasElement): Promise<HandSource> {
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}mediapipe/wasm`);
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numHands: config.numHands,
      });
    let landmarker: HandLandmarker;
    let delegate: 'GPU' | 'CPU' = 'GPU';
    try {
      landmarker = await make('GPU');
    } catch (e) {
      console.warn('GPU で起動できなかったため CPU に切り替えます', e);
      landmarker = await make('CPU');
      delegate = 'CPU';
    }
    const src = new HandSource(landmarker, video, preview);
    src.delegate = delegate;
    return src;
  }

  setNumHands(n: number) {
    void this.landmarker.setOptions({ numHands: n });
  }

  poll(nowMs: number): InputState {
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const t0 = performance.now();
      const res = this.landmarker.detectForVideo(this.video, nowMs);
      this.detectMs = performance.now() - t0;
      this.landmarks = res.landmarks[0] ?? null;
      this.process(nowMs);
      this.drawPreview();
    }
    const steps = this.pendingSteps;
    this.pendingSteps = 0;
    return {
      tracked: this.landmarks !== null,
      ndc: this.landmarks ? this.ndc : null,
      // 見失っている間は直前の状態を保つ（猶予の判定はゲーム側）
      grab: this.pinched,
      rotateSteps: steps,
      rotateSrc: 'twist',
    };
  }

  private process(nowMs: number) {
    const lm = this.landmarks;
    if (!lm) {
      this.fx.reset();
      this.fy.reset();
      return;
    }
    const aspect = this.video.videoWidth / this.video.videoHeight || 4 / 3;
    // 鏡表示にそろえるため x を反転し、横は縦横比で補正した距離を使う
    const dist = (a: NormalizedLandmark, b: NormalizedLandmark) =>
      Math.hypot((a.x - b.x) * aspect, a.y - b.y);

    // カーソル: 人差し指の付け根。映像の中央 (1 - 2*margin) を画面全体に対応
    const m = config.mapMargin;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const u = clamp01((1 - lm[INDEX_MCP].x - m) / (1 - 2 * m));
    const v = clamp01((lm[INDEX_MCP].y - m) / (1 - 2 * m));
    this.ndc = { x: this.fx.filter(u * 2 - 1, nowMs), y: this.fy.filter(-(v * 2 - 1), nowMs) };

    // つまみ: 親指先と人差し指先の距離 ÷ 手のひらの大きさ（手首〜中指の付け根）
    const palm = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-6;
    this.pinchRatio = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / palm;
    if (!this.pinched && this.pinchRatio < config.pinchOn) this.pinched = true;
    else if (this.pinched && this.pinchRatio > config.pinchOff) this.pinched = false;

    // ひねり: 人差し指の付け根→小指の付け根の向き（画面上の角度、時計回りが正）
    const a = lm[INDEX_MCP];
    const b = lm[PINKY_MCP];
    const angle = (Math.atan2(b.y - a.y, -(b.x - a.x) * aspect) * 180) / Math.PI;
    this.pendingSteps += this.ratchet.update(this.pinched, angle);
  }

  private drawPreview() {
    const c = this.preview;
    c.style.display = this.showPreview ? 'block' : 'none';
    if (!this.showPreview) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, c.width, c.height);
    ctx.restore();

    // 対応範囲（中央80%）の枠
    const m = config.mapMargin;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(m * c.width, m * c.height, (1 - 2 * m) * c.width, (1 - 2 * m) * c.height);
    ctx.setLineDash([]);

    const lm = this.landmarks;
    if (!lm) {
      ctx.fillStyle = 'rgba(200,40,40,0.85)';
      ctx.fillRect(0, c.height - 22, c.width, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.fillText('手が見つかりません', 8, c.height - 6);
      return;
    }
    const px = (p: NormalizedLandmark) => [(1 - p.x) * c.width, p.y * c.height] as const;
    ctx.strokeStyle = this.pinched ? '#ffb020' : '#3ad1ff';
    ctx.lineWidth = 2;
    for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
      const [x1, y1] = px(lm[start]);
      const [x2, y2] = px(lm[end]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    const [cx, cy] = px(lm[INDEX_MCP]);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  dispose() {
    this.landmarker.close();
  }
}
