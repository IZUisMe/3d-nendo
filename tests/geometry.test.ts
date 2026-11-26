import { describe, expect, it } from 'vitest';
import { PART_TYPES } from '../src/parts';
import { partGeometry } from '../src/world';

describe('partGeometry', () => {
  it('全種類の形状を1つにまとめられる', () => {
    for (const t of PART_TYPES) {
      const g = partGeometry(t);
      expect(g.solid.getAttribute('position').count).toBeGreaterThan(0);
      expect(g.edges.getAttribute('position').count).toBeGreaterThan(0);
    }
  });
});
