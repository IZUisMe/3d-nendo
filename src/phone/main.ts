import './phone.css';

/**
 * スマホ側コントローラー: 傾きと「押している間掴む」状態を PC に送るだけ。
 * カーソルの計算や回転の判定は PC 側（src/input/phone.ts）で行う。
 */
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const conn = $('#conn');
const sensor = $('#sensor');
const pad = $('#pad');

let ws: WebSocket | null = null;
let orient: { a: number; b: number; g: number } | null = null;
let grab = false;

function connect() {
  ws = new WebSocket(`wss://${location.host}/relay?role=phone`);
  ws.onopen = () => setConn('PC を待っています', '');
  ws.onclose = () => {
    setConn('切断（再接続中…）', 'warn');
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'peers') setConn(msg.pcs > 0 ? 'PC に接続済み' : 'PC を待っています', msg.pcs > 0 ? 'ok' : '');
    if (msg.t === 'haptic') vibrate(msg.kind);
  };
}

function setConn(text: string, cls: string) {
  conn.textContent = text;
  conn.className = `badge ${cls}`;
}

const PATTERNS: Record<string, number | number[]> = {
  hover: 8,
  grab: 20,
  place: 45, // カチッ
  drop: [15, 40, 15],
  rotate: 12,
};

function vibrate(kind: string) {
  navigator.vibrate?.(PATTERNS[kind] ?? 10);
}

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

window.addEventListener('deviceorientation', (e) => {
  if (e.alpha === null || e.beta === null || e.gamma === null) return;
  orient = { a: e.alpha, b: e.beta, g: e.gamma };
});

// 毎フレーム、最新の傾きと掴み状態を送る
function loop() {
  if (orient) send({ t: 's', ...orient, grab });
  requestAnimationFrame(loop);
}

function setGrab(on: boolean) {
  if (grab === on) return;
  grab = on;
  pad.classList.toggle('on', on);
  send({ t: 's', ...(orient ?? { a: 0, b: 0, g: 0 }), grab });
}

pad.addEventListener('pointerdown', (e) => {
  pad.setPointerCapture(e.pointerId);
  setGrab(true);
});
pad.addEventListener('pointerup', () => setGrab(false));
pad.addEventListener('pointercancel', () => setGrab(false));
pad.addEventListener('contextmenu', (e) => e.preventDefault());

$('#calib').addEventListener('click', () => {
  send({ t: 'cal' });
  vibrate('grab');
});
// ↺ = 上から見て反時計回り（+1）、↻ = 時計回り（-1）
$('#rot-l').addEventListener('click', () => send({ t: 'rot', steps: 1 }));
$('#rot-r').addEventListener('click', () => send({ t: 'rot', steps: -1 }));

$('#begin').addEventListener('click', async () => {
  $('#intro').hidden = true;
  vibrate('grab'); // ユーザー操作の中で一度鳴らして、以降の振動を許可させる
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen');
  } catch {
    /* 画面スリープ防止が使えなくても続行 */
  }
  send({ t: 'cal' });
  setTimeout(() => {
    if (!orient) {
      sensor.hidden = false;
      sensor.textContent = window.isSecureContext
        ? '傾きセンサーが使えません'
        : '傾きセンサーには HTTPS が必要です';
    }
  }, 1500);
});

connect();
requestAnimationFrame(loop);
