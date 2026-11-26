// MediaPipe の WASM と手検出モデルを public/ に用意する（npm install 時に自動実行）
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe/wasm');
const modelDst = join(root, 'public/models/hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  for (const f of readdirSync(wasmSrc)) copyFileSync(join(wasmSrc, f), join(wasmDst, f));
  console.log('[setup-assets] WASM をコピーしました');
}

if (!existsSync(modelDst)) {
  mkdirSync(dirname(modelDst), { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`[setup-assets] モデルのダウンロードに失敗: ${res.status}`);
    process.exit(1);
  }
  writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()));
  console.log('[setup-assets] 手検出モデルをダウンロードしました');
}
