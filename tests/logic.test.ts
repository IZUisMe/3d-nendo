import { describe, expect, it } from 'vitest';
import { absCells, Grid, GRID_H } from '../src/grid';
import { type Cell, rotateCell, rotatedCells } from '../src/parts';
import { isTargetBuildable, matchesTarget, TARGET_PIECES, targetCells } from '../src/task';

describe('rotateCell', () => {
  it('three.js の rotation.y と同じ向きに回る', () => {
    // rotation.y = +90° で (1,0,0) は (0,0,-1) に移る
    expect(rotateCell([1, 0, 0], 1)).toEqual([0, 0, -1]);
    expect(rotateCell([0, 0, 1], 1)).toEqual([1, 0, 0]);
    expect(rotateCell([1, 2, 3], 4)).toEqual([1, 2, 3]);
    expect(rotateCell([1, 0, 0], -1)).toEqual([0, 0, 1]);
  });
});

describe('Grid.dropInColumn', () => {
  it('空の台では一番下まで落ちる', () => {
    const g = new Grid();
    expect(g.dropInColumn(rotatedCells('cube', 0), 2, 2)).toEqual({ anchor: [2, 0, 2], valid: true });
  });
  it('一番上の空いている位置に積まれる', () => {
    const g = new Grid();
    g.add(1, [[2, 0, 2], [2, 1, 2]]);
    expect(g.dropInColumn(rotatedCells('cube', 0), 2, 2).anchor).toEqual([2, 2, 2]);
  });
  it('一部だけ下に支えがあっても、そこで止まる', () => {
    const g = new Grid();
    g.add(1, [[3, 0, 0]]);
    expect(g.dropInColumn(rotatedCells('bar', 0), 2, 0).anchor).toEqual([2, 1, 0]);
  });
  it('台からはみ出すと無効', () => {
    const g = new Grid();
    expect(g.dropInColumn(rotatedCells('bar', 0), 5, 0).valid).toBe(false);
  });
  it('高さ上限を超えると無効', () => {
    const g = new Grid();
    g.add(1, Array.from({ length: GRID_H }, (_, y): Cell => [0, y, 0]));
    expect(g.dropInColumn(rotatedCells('cube', 0), 0, 0).valid).toBe(false);
  });
});

describe('Grid.canLift', () => {
  it('上に載っていると掴めない', () => {
    const g = new Grid();
    g.add(1, [[0, 0, 0]]);
    g.add(2, [[0, 1, 0]]);
    expect(g.canLift(1)).toBe(false);
    expect(g.canLift(2)).toBe(true);
  });
});

describe('お題', () => {
  it('5個のパーツで構成される', () => {
    expect(TARGET_PIECES).toHaveLength(5);
  });
  it('上から落とすルールで作れる', () => {
    expect(isTargetBuildable()).toBe(true);
  });
  it('回転・平行移動しても一致と判定される', () => {
    const moved = targetCells()
      .map((c) => rotateCell(c, 3))
      .map(([x, y, z]): Cell => [x + 2, y, z + 5]);
    expect(matchesTarget(moved)).toBe(true);
  });
  it('1マス違えば不一致', () => {
    const cells = targetCells();
    cells[0] = [9, 9, 9];
    expect(matchesTarget(cells)).toBe(false);
    expect(matchesTarget(absCells([[0, 0, 0]], [0, 0, 0]))).toBe(false);
  });
});
