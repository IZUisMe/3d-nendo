import './style.css';
import { getSharedCamera } from './camera';
import { config, type ConfigKey } from './config';
import { Game } from './game';
import { HandSource } from './input/hand';
import { MouseSource } from './input/mouse';
import { PhoneSource } from './input/phone';
import type { InputSource } from './input/types';
import QRCode from 'qrcode';
import { SessionLog } from './log';
import { World } from './world';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const canvas = $<HTMLCanvasElement>('#scene');
const preview = $<HTMLCanvasElement>('#preview');
const hud = $('#hud');
const world = new World(canvas);
const game = new Game(world);
game.reset();

const mouse = new MouseSource(canvas);
const phone = new PhoneSource();
let hand: HandSource | null = null;
/** 実験中のみ入力を受け付ける */
let source: InputSource | null = null;
let log: SessionLog | null = null;

// スマホ操作中は、ゲームの出来事をスマホの振動で返す
game.onFeedback = (kind) => {
  if (source === phone) phone.haptic(kind);
};

// ---------- スマホ接続（QRコード） ----------
const phonePanel = $('#phone-panel');
const phoneStatus = $('#phone-status');
const phoneUrl = $<HTMLSelectElement>('#phone-url');
const qr = $<HTMLImageElement>('#qr');

phone.onPeers = (n) => {
  phoneStatus.textContent = n > 0 ? `スマホ接続済み（${n}台）` : 'スマホ未接続';
  phoneStatus.className = n > 0 ? 'badge ok' : 'badge';
};

async function setupPhoneLink() {
  let addresses: string[] = [];
  try {
    addresses = (await (await fetch('/relay-info')).json()).addresses;
  } catch {
    /* 取得できなければ現在のホスト名だけ使う */
  }
  const hosts = addresses.length ? addresses : [location.hostname];
  phoneUrl.innerHTML = hosts
    .map((h) => `https://${h}:${location.port}/phone.html`)
    .map((u) => `<option value="${u}">${u}</option>`)
    .join('');
  const draw = () => QRCode.toDataURL(phoneUrl.value, { width: 168, margin: 1 }).then((d) => (qr.src = d));
  phoneUrl.addEventListener('change', draw);
  await draw();
}
void setupPhoneLink();

// ---------- 実験の開始 ----------
const startModal = $('#start');
const startStatus = $('#start-status');
const startForm = $<HTMLFormElement>('#start-form');

startForm.addEventListener('change', () => {
  phonePanel.hidden = new FormData(startForm).get('mode') !== 'phone';
});

startForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = startForm;
  const data = new FormData(form);
  const mode = data.get('mode') as 'hand' | 'mouse' | 'phone';
  if (mode === 'phone' && phone.phones === 0) {
    startStatus.className = 'status';
    startStatus.textContent = 'スマホが接続されていません。QRコードを読み取ってください。';
    return;
  }
  const pid = String(data.get('pid') ?? '').trim();
  const submit = form.querySelector('button[type=submit]') as HTMLButtonElement;

  if (mode === 'hand' && !hand) {
    submit.disabled = true;
    startStatus.className = 'status ok';
    startStatus.textContent = 'カメラと手の検出モデルを読み込み中…';
    try {
      const video = await getSharedCamera();
      hand = await HandSource.create(video, preview);
    } catch (err) {
      startStatus.className = 'status';
      startStatus.textContent = `起動できませんでした: ${(err as Error).message}（カメラの許可を確認してください）`;
      submit.disabled = false;
      return;
    }
    submit.disabled = false;
    startStatus.textContent = '';
  }

  startStatus.textContent = '';
  source = mode === 'hand' ? hand : mode === 'phone' ? phone : mouse;
  preview.style.display = mode === 'hand' && hand?.showPreview ? 'block' : 'none';
  game.reset();
  log = new SessionLog(pid, mode, environment());
  game.log = log;
  startModal.hidden = true;
});

function environment() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu: world.gpuName(),
    cores: nav.hardwareConcurrency ?? '',
    memoryGB: nav.deviceMemory ?? '',
    delegate: hand?.delegate ?? '',
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
  };
}

// ---------- 終了・アンケート・書き出し ----------
const surveyModal = $('#survey');
const btnJson = $<HTMLButtonElement>('#btn-json');
const btnCsv = $<HTMLButtonElement>('#btn-csv');

for (const el of document.querySelectorAll<HTMLElement>('.scale')) {
  const name = el.dataset.name!;
  el.innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<label><input type="radio" name="${name}" value="${n}" />${n}</label>`)
    .join('');
}

function endSession(completed: boolean) {
  if (!log || source === null) return;
  log.finish(completed);
  source = null;
  const s = log.summary();
  $('#survey-title').textContent = completed ? '完成！おつかれさまでした' : '中断しました';
  $('#survey-summary').textContent = [
    `時間          ${s.durationSec} 秒`,
    `掴む成功率    ${(s.grabSuccessRate * 100).toFixed(0)}%（${s.grabOk}/${s.grabAttempts}）`,
    `途中で落とした ${s.lostDrops} 回`,
    `はめ損ね      ${s.placeFail} 回`,
    `fps           平均 ${s.fpsAvg} / 最低 ${s.fpsMin}`,
    s.mode === 'hand' ? `手の検出      平均 ${s.detectMsAvg} ms` : '',
  ]
    .filter(Boolean)
    .join('\n');
  ($<HTMLFormElement>('#survey-form')).reset();
  btnJson.disabled = btnCsv.disabled = true;
  surveyModal.hidden = false;
}

game.onComplete = () => endSession(true);

$<HTMLFormElement>('#survey-form').addEventListener('change', () => {
  const data = new FormData($<HTMLFormElement>('#survey-form'));
  const fatigue = Number(data.get('fatigue'));
  const frustration = Number(data.get('frustration'));
  if (log && fatigue && frustration) {
    log.survey = { fatigue, frustration };
    btnJson.disabled = btnCsv.disabled = false;
  }
});

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

btnJson.addEventListener('click', () => log && download(`${log.fileBase()}.json`, log.toJSON(), 'application/json'));
// Excel で文字化けしないよう BOM 付き
btnCsv.addEventListener('click', () => log && download(`${log.fileBase()}.csv`, `﻿${log.toCSV()}`, 'text/csv'));
$('#btn-next').addEventListener('click', () => {
  surveyModal.hidden = true;
  startModal.hidden = false;
  game.reset();
});

// ---------- 調整パネル ----------
const SLIDERS: [ConfigKey, string, number, number, number][] = [
  ['pinchOn', 'つまむ判定（掴む）', 0.05, 0.6, 0.01],
  ['pinchOff', 'つまむ判定（離す）', 0.1, 0.9, 0.01],
  ['euroMinCutoff', '揺れ止め（静止時）', 0.05, 5, 0.05],
  ['euroBeta', '追従（速い動き）', 0, 5, 0.05],
  ['graceMs', '見失い猶予 (ms)', 0, 1000, 10],
  ['mapMargin', '映像の端の切り捨て', 0, 0.3, 0.01],
  ['twistStepDeg', 'ひねり角度 (°)', 20, 90, 1],
  ['twistRearmDeg', 'ひねり戻し角度 (°)', 5, 40, 1],
  ['pickRadiusPx', '掴み補助 (px)', 0, 120, 1],
  ['cameraDistance', 'カメラ距離', 10, 30, 0.5],
  ['numHands', '検出する手の数', 1, 2, 1],
  ['phoneRangeXDeg', 'スマホ 左右の角度 (°)', 8, 60, 1],
  ['phoneRangeYDeg', 'スマホ 上下の角度 (°)', 6, 45, 1],
];

const rows = $('#tuning-rows');
for (const [key, label, min, max, step] of SLIDERS) {
  const row = document.createElement('label');
  row.innerHTML = `<span>${label}</span><output>${config[key]}</output>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${config[key]}" />`;
  const input = row.querySelector('input')!;
  const out = row.querySelector('output')!;
  input.addEventListener('input', () => {
    config[key] = Number(input.value);
    out.textContent = input.value;
    if (key === 'cameraDistance') world.setFixedCamera();
    if (key === 'numHands') hand?.setNumHands(config.numHands);
  });
  rows.append(row);
}
$('#btn-rescatter').addEventListener('click', () => game.reset());

// ---------- キー操作 ----------
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
  switch (e.key.toLowerCase()) {
    case 'r':
      game.rotateHeld(-1, 'key'); // 上から見て時計回り
      break;
    case 'q':
      game.rotatePlate(1);
      break;
    case 'e':
      game.rotatePlate(-1);
      break;
    case 'h':
      if (hand) {
        hand.showPreview = !hand.showPreview;
        preview.style.display = hand.showPreview ? 'block' : 'none';
      }
      break;
    case 't':
      $('#tuning').hidden = !$('#tuning').hidden;
      break;
    case 'd':
      world.toggleFreeCamera();
      break;
    case 'escape':
      endSession(false);
      break;
  }
});

// ---------- メインループ ----------
let last = performance.now();
let frames = 0;
let fpsT = last;
let fps = 0;
let detectSum = 0;
let detectN = 0;

function frame(now: number) {
  const dt = Math.min(now - last, 100);
  last = now;

  const input = source ? source.poll(now) : null;
  if (source === hand && hand) {
    detectSum += hand.detectMs;
    detectN++;
  }
  game.update(input, dt);
  world.render(dt);

  frames++;
  if (now - fpsT >= 1000) {
    fps = (frames * 1000) / (now - fpsT);
    frames = 0;
    fpsT = now;
    const detectAvg = detectN ? detectSum / detectN : 0;
    detectSum = detectN = 0;
    if (log && source) {
      log.fpsSamples.push(Math.round(fps));
      if (source === hand) log.detectMsSamples.push(+detectAvg.toFixed(1));
    }
    $('#tuning-live').textContent = hand ? `つまみ比率 ${hand.pinchRatio.toFixed(2)}` : '';
    updateHud(detectAvg);
  }
  requestAnimationFrame(frame);
}

function updateHud(detectAvg: number) {
  const lines = [`fps ${fps.toFixed(0).padStart(3)}`];
  if (source === hand && hand) lines.push(`検出 ${detectAvg.toFixed(1)} ms (${hand.delegate})`);
  if (source === phone) lines.push(phone.phones > 0 ? 'スマホ 接続中' : 'スマホ 切断');
  if (log && source) {
    const s = log.summary();
    lines.push(`時間 ${s.durationSec.toFixed(0)} 秒`, `掴む ${s.grabOk}/${s.grabAttempts}`);
  }
  hud.textContent = lines.join('\n');
}

requestAnimationFrame(frame);
