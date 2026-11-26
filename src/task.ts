import { absCells, Grid } from './grid';
import { type Cell, type PartType, rotateCell, rotatedCells } from './parts';

/** お題: 見本と同じ形を5個のパーツで組む。この順に上から落とせば作れる */
export const TARGET_PIECES: { type: PartType; rot: number; anchor: Cell }[] = [
  { type: 'step', rot: 0, anchor: [0, 0, 0] },
  { type: 'L', rot: 0, anchor: [1, 0, 1] },
  { type: 'convex', rot: 0, anchor: [0, 1, 1] },
  { type: 'cube', rot: 0, anchor: [1, 1, 0] },
  { type: 'bar', rot: 1, anchor: [0, 2, 1] },
];

export function targetCells(): Cell[] {
  return TARGET_PIECES.flatMap((p) => absCells(rotatedCells(p.type, p.rot), p.anchor));
}

/** 位置をそろえた形の文字列表現 */
function shapeKey(cells: Cell[]): string {
  const min = [0, 1, 2].map((a) => Math.min(...cells.map((c) => c[a])));
  return cells
    .map((c) => `${c[0] - min[0]},${c[1] - min[1]},${c[2] - min[2]}`)
    .sort()
    .join('|');
}

/** 台の上の形が見本と一致するか（縦軸の回転・平行移動は無視） */
export function matchesTarget(cells: Cell[]): boolean {
  const target = targetCells();
  if (cells.length !== target.length) return false;
  const want = shapeKey(target);
  for (let r = 0; r < 4; r++) {
    if (shapeKey(cells.map((c) => rotateCell(c, r))) === want) return true;
  }
  return false;
}

/** お題が「上から落とす」ルールで実際に作れるかを確認する（テスト用） */
export function isTargetBuildable(): boolean {
  const grid = new Grid();
  return TARGET_PIECES.every((p, id) => {
    const offs = rotatedCells(p.type, p.rot);
    // 台の中央寄りに平行移動して試す
    const r = grid.dropInColumn(offs, p.anchor[0] + 1, p.anchor[2] + 2);
    const ok = r.valid && r.anchor[1] === p.anchor[1];
    grid.add(id, absCells(offs, r.anchor));
    return ok;
  });
}
