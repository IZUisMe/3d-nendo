/** 実験中に調整する値（調整パネル＝Tキーから変更できる） */
export const config = {
  /** つまみ判定: 親指先-人差し指先の距離 ÷ 手のひらの大きさ。これ未満で掴む */
  pinchOn: 0.25,
  /** これを超えたら離す */
  pinchOff: 0.4,
  /** One Euro フィルター: 静止時の揺れ止めの強さ（小さいほど強い） */
  euroMinCutoff: 1.2,
  /** One Euro フィルター: 速い動きへの追従（大きいほど遅れが減る） */
  euroBeta: 0.8,
  /** 掴み中に手を見失っても掴んだままにする猶予（ミリ秒） */
  graceMs: 300,
  /** カメラ映像の端を何割捨てるか（0.1 = 中央80%を画面全体に対応） */
  mapMargin: 0.1,
  /** 手首をこの角度以上ひねると90°回る */
  twistStepDeg: 50,
  /** ひねりをこの角度未満に戻すと次の回転が可能になる */
  twistRearmDeg: 20,
  /** 検出する手の数 */
  numHands: 1,
  /** レイが外れたとき、画面上でこの距離以内の一番近いパーツを掴む（px） */
  pickRadiusPx: 40,
  /** カメラの距離（小さいほどマスが大きく見える） */
  cameraDistance: 17,
  /** 運んでいるパーツの高さ */
  carryHeight: 2.2,
  /** スマホ: 左右にこの角度向けると画面の端に届く */
  phoneRangeXDeg: 25,
  /** スマホ: 上下にこの角度向けると画面の端に届く */
  phoneRangeYDeg: 18,
  /** 種類ごとのパーツ数（5種類 × この数が床に置かれる） */
  partsPerType: 4,
};

export type ConfigKey = keyof typeof config;
