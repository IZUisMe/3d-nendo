/** パーツ定義: 小さな立方体（セル）の組み合わせ。セル0がアンカー（基準点） */
export type Cell = [number, number, number];
export type PartType = 'cube' | 'bar' | 'L' | 'step' | 'convex';

export const PART_DEFS: Record<PartType, { label: string; cells: Cell[] }> = {
  cube: { label: '1×1', cells: [[0, 0, 0]] },
  bar: { label: '1×2', cells: [[0, 0, 0], [1, 0, 0]] },
  L: { label: 'L字', cells: [[0, 0, 0], [1, 0, 0], [0, 0, 1]] },
  step: { label: '段差', cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]] },
  convex: { label: '凸型', cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]] },
};

export const PART_TYPES = Object.keys(PART_DEFS) as PartType[];

export const mod4 = (n: number) => ((n % 4) + 4) % 4;

/**
 * 縦軸まわりに 90°×rot 回転。three.js の rotation.y = rot*π/2 と同じ向き
 * （上から見て反時計回り）: (x, y, z) → (z, y, -x)
 */
export function rotateCell(c: Cell, rot: number): Cell {
  let [x, y, z] = c;
  for (let i = 0; i < mod4(rot); i++) [x, z] = [z, -x];
  return [x + 0, y, z + 0]; // -0 を 0 に
}

export function rotatedCells(type: PartType, rot: number): Cell[] {
  return PART_DEFS[type].cells.map((c) => rotateCell(c, rot));
}
