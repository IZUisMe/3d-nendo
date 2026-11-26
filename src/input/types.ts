/** twist: 手首のひねり / roll: スマホのひねり / button: スマホの回転ボタン */
export type RotateSrc = 'twist' | 'roll' | 'key' | 'wheel' | 'button';

/**
 * 入力方式（手・マウス・将来のスマホ）共通の出力。
 * ゲーム側はこの形だけを見るので、入力方式を差し替えても本体は変わらない。
 */
export interface InputState {
  /** 手やポインターを検出できているか */
  tracked: boolean;
  /** 指している画面上の位置（-1〜1の正規化座標）。見失ったら null */
  ndc: { x: number; y: number } | null;
  /** 掴んでいるか */
  grab: boolean;
  /** このフレームで発生した回転（90°単位、正 = 上から見て反時計回り） */
  rotateSteps: number;
  rotateSrc: RotateSrc;
}

export interface InputSource {
  readonly name: 'mouse' | 'hand' | 'phone';
  poll(nowMs: number): InputState;
  dispose(): void;
}
