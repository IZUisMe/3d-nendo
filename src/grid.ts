import { type Cell } from './parts';

export const GRID_W = 6;
export const GRID_D = 6;
export const GRID_H = 6;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

export interface DropResult {
  anchor: Cell;
  valid: boolean;
}

/** 組み立て台のマス目（台のローカル座標・整数） */
export class Grid {
  private occ = new Map<string, number>();
  private byPart = new Map<number, Cell[]>();

  clear() {
    this.occ.clear();
    this.byPart.clear();
  }

  isOccupied(x: number, y: number, z: number) {
    return this.occ.has(key(x, y, z));
  }

  inXZ(x: number, z: number) {
    return x >= 0 && x < GRID_W && z >= 0 && z < GRID_D;
  }

  add(partId: number, cells: Cell[]) {
    for (const [x, y, z] of cells) this.occ.set(key(x, y, z), partId);
    this.byPart.set(partId, cells);
  }

  remove(partId: number) {
    for (const [x, y, z] of this.byPart.get(partId) ?? []) this.occ.delete(key(x, y, z));
    this.byPart.delete(partId);
  }

  /** 上に別のパーツが載っていなければ掴める */
  canLift(partId: number) {
    for (const [x, y, z] of this.byPart.get(partId) ?? []) {
      const above = this.occ.get(key(x, y + 1, z));
      if (above !== undefined && above !== partId) return false;
    }
    return true;
  }

  /**
   * 列 (i, k) の上からパーツを落とし、一番上の空いている位置で止める。
   * 落とせば必ず「下か台に接する」ので、支えの判定は不要。
   * 台からはみ出す・高さ上限を超える場合は valid=false。
   */
  dropInColumn(offsets: Cell[], i: number, k: number): DropResult {
    const fits = (y: number) =>
      offsets.every(([dx, dy, dz]) => y + dy >= 0 && !this.isOccupied(i + dx, y + dy, k + dz));
    let y = GRID_H;
    while (fits(y - 1)) y--;
    const valid = offsets.every(([dx, dy, dz]) => this.inXZ(i + dx, k + dz) && y + dy < GRID_H);
    return { anchor: [i, y, k], valid };
  }

  allCells(): Cell[] {
    return [...this.byPart.values()].flat();
  }
}

export function absCells(offsets: Cell[], anchor: Cell): Cell[] {
  return offsets.map(([dx, dy, dz]) => [anchor[0] + dx, anchor[1] + dy, anchor[2] + dz]);
}
