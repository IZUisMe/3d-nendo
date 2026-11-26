import * as THREE from 'three';
import { config } from './config';
import { type FloorBehavior, StaticFloor } from './floor';
import { absCells, Grid } from './grid';
import type { InputState, RotateSrc } from './input/types';
import type { SessionLog } from './log';
import { type Cell, mod4, PART_DEFS, PART_TYPES, type PartType, rotatedCells } from './parts';
import { matchesTarget } from './task';
import { buildPartObject, cellCenterLocal, PART_COLOR, type World } from './world';

export interface Part {
  id: number;
  type: PartType;
  /** 90°単位の向き。床・運搬中はワールド基準、台の上では台のローカル基準 */
  rot: number;
  where: 'floor' | 'plate' | 'held';
  anchor: Cell | null;
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** 床に「無造作に」置くための向きのずれ（ラジアン） */
  yawJitter: number;
  /** はまったときの「ポン」演出の残り（1→0） */
  pop: number;
}

interface Target {
  anchor: Cell;
  valid: boolean;
  localRot: number;
}

const HOVER_EMISSIVE = 0x6a5500;
const CURSOR_IDLE = 0xffffff;
const CURSOR_HOVER = 0xffd400;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** 掴む・運ぶ・はめるの状態管理。入力は InputState だけを見る */
export class Game {
  parts: Part[] = [];
  readonly grid = new Grid();
  held: Part | null = null;
  plateSteps = 0;
  log: SessionLog | null = null;
  onComplete: (() => void) | null = null;
  /** 手応え（スマホの振動など）用の通知 */
  onFeedback: ((kind: 'hover' | 'grab' | 'place' | 'drop' | 'rotate') => void) | null = null;

  private hovered: Part | null = null;
  private prevGrab = false;
  private lostMs = 0;
  private target: Target | null = null;
  private raycaster = new THREE.Raycaster();
  private downRay = new THREE.Raycaster();
  private carryPlane = new THREE.Plane(UP.clone(), 0);
  private tmp = new THREE.Vector3();

  constructor(
    private world: World,
    private floor: FloorBehavior = new StaticFloor(),
  ) {}

  /** パーツをすべて床に散らかし直す */
  reset() {
    for (const p of this.parts) {
      p.group.removeFromParent();
      p.material.dispose();
    }
    this.parts = [];
    this.grid.clear();
    this.held = this.hovered = this.target = null;
    this.world.ghost.visible = false;
    this.plateSteps = 0;
    this.world.plate.rotation.y = 0;
    this.prevGrab = false;
    this.lostMs = 0;
    let id = 0;
    for (const type of PART_TYPES) {
      for (let i = 0; i < config.partsPerType; i++) {
        const material = new THREE.MeshStandardMaterial({ color: PART_COLOR, roughness: 0.7 });
        const { group, mesh } = buildPartObject(type, material);
        mesh.userData.partId = id;
        this.world.scene.add(group);
        this.parts.push({ id: id++, type, rot: 0, where: 'floor', anchor: null, group, mesh, material, yawJitter: 0, pop: 0 });
      }
    }
    this.floor.scatter(this.parts);
  }

  /** 掴んでいるパーツを縦軸まわりに 90°×steps 回す（正 = 上から見て反時計回り） */
  rotateHeld(steps: number, src: RotateSrc) {
    if (!this.held || steps === 0) return;
    this.held.rot += steps;
    for (let i = 0; i < Math.abs(steps); i++) this.log?.add('rotate', { src });
    this.onFeedback?.('rotate');
  }

  /** 組み立て台（ターンテーブル）を90°回す */
  rotatePlate(dir: 1 | -1) {
    this.plateSteps += dir;
    this.log?.add('turntable');
  }

  /** input が null のときは操作を受け付けず、アニメーションだけ進める */
  update(input: InputState | null, dtMs: number) {
    if (input) this.handleInput(input, dtMs);
    else {
      this.setHover(null);
      this.world.cursor.visible = this.world.shadow.visible = false;
    }
    this.animate(dtMs);
  }

  private handleInput(input: InputState, dtMs: number) {
    const w = this.world;
    if (input.rotateSteps) this.rotateHeld(input.rotateSteps, input.rotateSrc);

    const ndc = input.tracked ? input.ndc : null;
    if (!ndc) {
      // 見失った: 猶予の間は掴んだまま、超えたら落とす
      if (this.held) {
        this.lostMs += dtMs;
        if (this.lostMs > config.graceMs) this.release('lost');
      }
      this.setHover(null);
      w.cursor.visible = w.shadow.visible = false;
      return;
    }
    this.lostMs = 0;
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), w.camera);
    const pressed = input.grab && !this.prevGrab;
    const released = !input.grab && this.prevGrab;
    this.prevGrab = input.grab;

    if (!this.held) {
      const pick = this.pick(ndc);
      this.setHover(pick?.grabbable ? pick.part : null);
      this.placeCursor(pick?.point ?? this.surfacePoint());
      if (pressed) {
        this.log?.add('grab_attempt');
        if (pick?.grabbable) this.take(pick.part);
        else this.log?.add('grab_miss');
      }
      return;
    }
    if (released) this.release('normal');
    else this.carry();
  }

  private canGrab(p: Part) {
    return p.where === 'floor' || (p.where === 'plate' && this.grid.canLift(p.id));
  }

  private pick(ndc: { x: number; y: number }) {
    const meshes = this.parts.filter((p) => p.where !== 'held').map((p) => p.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (hit) {
      const part = this.parts[hit.object.userData.partId as number];
      return { part, grabbable: this.canGrab(part), point: hit.point };
    }
    // 掴み補助: レイが外れたら、画面上で一番近いパーツ（一定距離以内）
    const W = window.innerWidth;
    const H = window.innerHeight;
    let best: { part: Part; d: number; point: THREE.Vector3 } | null = null;
    for (const part of this.parts) {
      if (part.where === 'held' || !this.canGrab(part)) continue;
      const cells = PART_DEFS[part.type].cells;
      const c = new THREE.Vector3(
        cells.reduce((s, v) => s + v[0], 0) / cells.length,
        cells.reduce((s, v) => s + v[1], 0) / cells.length,
        cells.reduce((s, v) => s + v[2], 0) / cells.length,
      );
      const world = part.group.localToWorld(c);
      const sp = world.clone().project(this.world.camera);
      const d = Math.hypot(((sp.x - ndc.x) * W) / 2, ((sp.y - ndc.y) * H) / 2);
      if (d <= config.pickRadiusPx && (!best || d < best.d)) best = { part, d, point: world };
    }
    return best && { part: best.part, grabbable: true, point: best.point };
  }

  private surfacePoint(): THREE.Vector3 | null {
    const hit = this.raycaster.intersectObjects([this.world.plateBoard, this.world.floorMesh], false)[0];
    return hit?.point ?? null;
  }

  private take(part: Part) {
    const w = this.world;
    this.floor.release(part);
    if (part.where === 'plate') {
      const pos = part.group.getWorldPosition(new THREE.Vector3());
      this.grid.remove(part.id);
      // 台のローカルの向き → ワールドの向き（見た目が跳ねないよう現在の台の角度を使う）
      const yaw = (part.rot * Math.PI) / 2 + w.plate.rotation.y;
      part.rot += this.plateSteps;
      w.scene.add(part.group);
      part.group.position.copy(pos);
      part.group.rotation.set(0, yaw, 0);
      part.anchor = null;
    }
    part.yawJitter = 0;
    part.where = 'held';
    this.held = part;
    this.setHover(null);
    this.log?.add('grab_ok', { part: part.type });
    this.onFeedback?.('grab');
  }

  private carry() {
    const w = this.world;
    const held = this.held!;
    this.carryPlane.constant = -config.carryHeight;
    if (this.raycaster.ray.intersectPlane(this.carryPlane, this.tmp)) held.group.position.copy(this.tmp);

    // はまる予定の位置: レイが当たった面の外側のセルの列に、上から落とす
    const meshes = [w.plateBoard, ...this.parts.filter((p) => p.where === 'plate').map((p) => p.mesh)];
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit?.face) {
      this.target = null;
      w.ghost.visible = false;
    } else {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const cell = w.worldToCell(hit.point.clone().addScaledVector(n, 0.5));
      const localRot = mod4(held.rot - this.plateSteps);
      const r = this.grid.dropInColumn(rotatedCells(held.type, localRot), cell[0], cell[2]);
      this.target = { anchor: r.anchor, valid: r.valid, localRot };
      w.showGhost(held.type, localRot, r.anchor, r.valid);
    }
    w.cursor.visible = false;
    this.placeShadow(held.group.position);
  }

  private release(kind: 'normal' | 'lost') {
    const part = this.held!;
    const t = this.target;
    this.held = null;
    this.target = null;
    this.world.ghost.visible = false;
    if (kind === 'normal' && t?.valid) {
      this.place(part, t);
      return;
    }
    part.where = 'floor';
    this.floor.drop(part, part.group.position.clone());
    this.log?.add(kind === 'lost' ? 'lost_drop' : t ? 'place_fail' : 'floor_drop', { part: part.type });
    this.onFeedback?.('drop');
  }

  private place(part: Part, t: Target) {
    this.grid.add(part.id, absCells(rotatedCells(part.type, t.localRot), t.anchor));
    this.world.plate.add(part.group);
    part.group.position.copy(cellCenterLocal(t.anchor));
    part.group.rotation.set(0, (t.localRot * Math.PI) / 2, 0);
    part.rot = t.localRot;
    part.where = 'plate';
    part.anchor = t.anchor;
    part.pop = 1;
    this.log?.add('place_ok', { part: part.type });
    this.onFeedback?.('place');
    if (matchesTarget(this.grid.allCells())) this.onComplete?.();
  }

  private setHover(p: Part | null) {
    if (this.hovered === p) return;
    this.hovered?.material.emissive.setHex(0);
    p?.material.emissive.setHex(HOVER_EMISSIVE);
    this.hovered = p;
    if (p) this.onFeedback?.('hover');
    (this.world.cursor.material as THREE.MeshBasicMaterial).color.setHex(p ? CURSOR_HOVER : CURSOR_IDLE);
  }

  private placeCursor(point: THREE.Vector3 | null) {
    const w = this.world;
    w.cursor.visible = !!point;
    if (!point) {
      w.shadow.visible = false;
      return;
    }
    w.cursor.position.copy(point).addScaledVector(UP, 0.15);
    this.placeShadow(w.cursor.position);
  }

  /** 真下の面に影を落とす（奥行きの手がかり） */
  private placeShadow(from: THREE.Vector3) {
    const w = this.world;
    const meshes = [w.floorMesh, w.plateBoard, ...this.parts.filter((p) => p.where !== 'held').map((p) => p.mesh)];
    this.downRay.set(this.tmp.copy(from).addScaledVector(UP, 0.05), DOWN);
    const hit = this.downRay.intersectObjects(meshes, false)[0];
    w.shadow.visible = !!hit;
    if (hit) w.shadow.position.copy(hit.point).addScaledVector(UP, 0.02);
  }

  private animate(dtMs: number) {
    const k = 1 - Math.exp(-dtMs / 60);
    const plate = this.world.plate;
    plate.rotation.y += ((this.plateSteps * Math.PI) / 2 - plate.rotation.y) * k;
    for (const p of this.parts) {
      if (p.where !== 'plate') {
        const want = (p.rot * Math.PI) / 2 + p.yawJitter;
        p.group.rotation.y += (want - p.group.rotation.y) * k;
      }
      if (p.pop > 0) {
        p.pop = Math.max(0, p.pop - dtMs / 160);
        p.group.scale.setScalar(1 + 0.12 * p.pop);
      }
    }
    this.floor.update(dtMs);
  }
}
