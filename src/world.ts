import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from './config';
import { GRID_D, GRID_W } from './grid';
import { type Cell, PART_DEFS, type PartType } from './parts';
import { TARGET_PIECES } from './task';

export const PLATE_CENTER = new THREE.Vector3(0, 0, 3.5);
export const PLATE_TOP = 0.15;
/** 床のパーツを散らかす範囲（組み立て台の奥） */
export const FLOOR_RECT = { minX: -9, maxX: 9, minZ: -8, maxZ: -1 };
/** 床に落とすときに避ける範囲（組み立て台 + 余白） */
export const PLATE_RECT = {
  minX: PLATE_CENTER.x - GRID_W / 2 - 0.8,
  maxX: PLATE_CENTER.x + GRID_W / 2 + 0.8,
  minZ: PLATE_CENTER.z - GRID_D / 2 - 0.8,
  maxZ: PLATE_CENTER.z + GRID_D / 2 + 0.8,
};

export const PART_COLOR = 0x9aa0a6;
const LOOK_AT = new THREE.Vector3(0, 0, 0.5);
const VIEW_DIR = new THREE.Vector3(0, 11, 13).normalize();

const geomCache = new Map<PartType, { solid: THREE.BufferGeometry; edges: THREE.BufferGeometry }>();

/** パーツ形状: セルごとの箱 + 上面のポッチ（見た目だけ）を1つにまとめる */
export function partGeometry(type: PartType) {
  const cached = geomCache.get(type);
  if (cached) return cached;
  const cells = PART_DEFS[type].cells;
  const has = new Set(cells.map((c) => c.join(',')));
  const solids: THREE.BufferGeometry[] = [];
  const edges: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of cells) {
    const box = new THREE.BoxGeometry(0.94, 0.94, 0.94).translate(x, y, z);
    solids.push(box);
    edges.push(new THREE.EdgesGeometry(box));
    if (!has.has(`${x},${y + 1},${z}`)) {
      solids.push(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12).translate(x, y + 0.53, z));
    }
  }
  const g = { solid: mergeGeometries(solids)!, edges: mergeGeometries(edges)! };
  geomCache.set(type, g);
  return g;
}

const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x4a4f55 });

export function buildPartObject(type: PartType, material: THREE.Material) {
  const { solid, edges } = partGeometry(type);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(solid, material);
  group.add(mesh, new THREE.LineSegments(edges, edgeMaterial));
  return { group, mesh };
}

export function cellCenterLocal(c: Cell) {
  return new THREE.Vector3(c[0] - GRID_W / 2 + 0.5, c[1] + 0.5, c[2] - GRID_D / 2 + 0.5);
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  /** 組み立て台（ターンテーブル）。台の上のパーツはこの子になる */
  readonly plate = new THREE.Group();
  readonly plateBoard: THREE.Mesh;
  readonly floorMesh: THREE.Mesh;
  readonly cursor: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly ghost: THREE.Mesh;
  readonly ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
  private controls: OrbitControls;
  freeCamera = false;

  private targetScene = new THREE.Scene();
  private targetCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private targetGroup = new THREE.Group();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.scene.background = new THREE.Color(0xe9e4da);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 12, 7);
    this.scene.add(sun);

    // 床
    this.floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd9cfbd, roughness: 1 }),
    );
    this.scene.add(this.floorMesh);

    // 組み立て台（上面がローカル y=0）
    this.plate.position.set(PLATE_CENTER.x, PLATE_TOP, PLATE_CENTER.z);
    this.plateBoard = new THREE.Mesh(
      new THREE.BoxGeometry(GRID_W, PLATE_TOP, GRID_D).translate(0, -PLATE_TOP / 2, 0),
      new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.9 }),
    );
    const grid = new THREE.GridHelper(GRID_W, GRID_W, 0xb8b0a2, 0xb8b0a2);
    grid.position.y = 0.003;
    // 正面がわかる目印
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(GRID_W, 0.05, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x6aa8ff }),
    );
    front.position.set(0, -0.05, GRID_D / 2 + 0.06);
    this.plate.add(this.plateBoard, grid, front);
    this.scene.add(this.plate);

    // カーソルと影
    this.cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    this.cursor.renderOrder = 10;
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.scene.add(this.cursor, this.shadow);

    // ゴースト（はまる予定の位置）
    this.ghost = new THREE.Mesh(undefined, this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    this.plate.add(this.ghost);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enabled = false;
    this.setFixedCamera();
    this.buildTargetView();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setFixedCamera() {
    this.camera.position.copy(VIEW_DIR).multiplyScalar(config.cameraDistance).add(LOOK_AT);
    this.camera.lookAt(LOOK_AT);
    this.controls.target.copy(LOOK_AT);
  }

  /** 開発者用の自由視点（Dキー） */
  toggleFreeCamera() {
    this.freeCamera = !this.freeCamera;
    this.controls.enabled = this.freeCamera;
    if (!this.freeCamera) this.setFixedCamera();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 台のローカル座標でのセル番号（ワールド座標から） */
  worldToCell(p: THREE.Vector3): Cell {
    const l = this.plate.worldToLocal(p.clone());
    return [Math.floor(l.x + GRID_W / 2), Math.floor(l.y), Math.floor(l.z + GRID_D / 2)];
  }

  showGhost(type: PartType, localRot: number, anchor: Cell, valid: boolean) {
    this.ghost.geometry = partGeometry(type).solid;
    this.ghost.position.copy(cellCenterLocal(anchor));
    this.ghost.rotation.set(0, (localRot * Math.PI) / 2, 0);
    this.ghostMat.color.set(valid ? 0x2ecc71 : 0xe74c3c);
    this.ghost.visible = true;
  }

  private buildTargetView() {
    this.targetScene.background = new THREE.Color(0xf6f3ee);
    this.targetScene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.8));
    const l = new THREE.DirectionalLight(0xffffff, 1.4);
    l.position.set(4, 8, 6);
    this.targetScene.add(l);
    const mat = new THREE.MeshStandardMaterial({ color: PART_COLOR, roughness: 0.7 });
    const inner = new THREE.Group();
    for (const p of TARGET_PIECES) {
      const { group } = buildPartObject(p.type, mat);
      group.position.set(...p.anchor);
      group.rotation.y = (p.rot * Math.PI) / 2;
      inner.add(group);
    }
    // 形の中心を回転の中心にする
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    this.targetGroup.add(inner);
    this.targetScene.add(this.targetGroup);
    this.targetCamera.position.set(0, 5.5, 7);
    this.targetCamera.lookAt(0, 1, 0);
  }

  render(dtMs: number) {
    if (this.freeCamera) this.controls.update();
    const r = this.renderer;
    const w = window.innerWidth;
    const h = window.innerHeight;
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
    r.render(this.scene, this.camera);

    // 見本（右上）
    this.targetGroup.rotation.y += dtMs * 0.0006;
    const s = Math.min(220, Math.floor(w * 0.22));
    const x = w - s - 12;
    const y = h - s - 12;
    r.setScissorTest(true);
    r.setScissor(x, y, s, s);
    r.setViewport(x, y, s, s);
    this.targetCamera.aspect = 1;
    this.targetCamera.updateProjectionMatrix();
    r.render(this.targetScene, this.targetCamera);
    r.setScissorTest(false);
  }

  gpuName(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  }
}
