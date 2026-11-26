import * as THREE from 'three';
import type { Part } from './game';
import { FLOOR_RECT, PLATE_RECT } from './world';

const REST_Y = 0.5; // 全パーツの一番下のセルの中心
const GRAVITY = 30;

/**
 * 床のパーツの振る舞い。後で物理演算（Rapier）版に差し替えられるよう、
 * 掴む・はめる処理からはこのインターフェースだけで呼ぶ。
 */
export interface FloorBehavior {
  /** 起動時に床へ散らかす */
  scatter(parts: Part[]): void;
  /** 指定位置から床へ落とす */
  drop(part: Part, from: THREE.Vector3): void;
  /** 掴まれたら呼ぶ（落下中なら止める） */
  release(part: Part): void;
  update(dtMs: number): void;
}

/** 物理演算なし版: ランダムに置き、離したら真下に落ちて止まるだけ */
export class StaticFloor implements FloorBehavior {
  private falling = new Map<Part, number>(); // 落下速度

  scatter(parts: Part[]) {
    const placed: THREE.Vector2[] = [];
    for (const p of parts) {
      let pos = new THREE.Vector2();
      for (let tries = 0; tries < 200; tries++) {
        pos.set(
          THREE.MathUtils.randFloat(FLOOR_RECT.minX, FLOOR_RECT.maxX - 2),
          THREE.MathUtils.randFloat(FLOOR_RECT.minZ, FLOOR_RECT.maxZ - 1),
        );
        if (placed.every((q) => q.distanceTo(pos) > 2.4)) break;
      }
      placed.push(pos.clone());
      p.rot = THREE.MathUtils.randInt(0, 3);
      p.yawJitter = THREE.MathUtils.randFloatSpread(0.7);
      p.group.position.set(pos.x, REST_Y, pos.y);
      p.group.rotation.set(0, (p.rot * Math.PI) / 2 + p.yawJitter, 0);
    }
  }

  drop(part: Part, from: THREE.Vector3) {
    let { x, z } = from;
    // 組み立て台の上には落とさない（一番近い辺の外へ出す）
    const r = PLATE_RECT;
    if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) {
      const d = [x - r.minX, r.maxX - x, z - r.minZ, r.maxZ - z];
      const i = d.indexOf(Math.min(...d));
      if (i === 0) x = r.minX;
      else if (i === 1) x = r.maxX;
      else if (i === 2) z = r.minZ;
      else z = r.maxZ;
    }
    part.yawJitter = THREE.MathUtils.randFloatSpread(0.5);
    part.group.position.set(x, Math.max(from.y, REST_Y), z);
    this.falling.set(part, 0);
  }

  release(part: Part) {
    this.falling.delete(part);
  }

  update(dtMs: number) {
    const dt = dtMs / 1000;
    for (const [part, v] of this.falling) {
      const nv = v + GRAVITY * dt;
      const pos = part.group.position;
      pos.y -= nv * dt;
      if (pos.y <= REST_Y) {
        pos.y = REST_Y;
        this.falling.delete(part);
      } else {
        this.falling.set(part, nv);
      }
    }
  }
}
