import type { IncomingMessage, Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import type { Duplex } from 'node:stream';
import type { Connect, Plugin } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

/** PC 用ページ（role=pc）とスマホ（role=phone）の間でメッセージを中継する */
function attachRelay(httpServer: unknown, middlewares: Connect.Server) {
  if (!httpServer) return;
  const wss = new WebSocketServer({ noServer: true });
  const pcs = new Set<WebSocket>();
  const phones = new Set<WebSocket>();

  const broadcastPeers = () => {
    const msg = JSON.stringify({ t: 'peers', pcs: pcs.size, phones: phones.size });
    for (const c of [...pcs, ...phones]) if (c.readyState === WebSocket.OPEN) c.send(msg);
  };

  (httpServer as Server).on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/relay') return; // Vite の HMR などはそのまま通す
    wss.handleUpgrade(req, socket, head, (ws) => {
      const isPhone = url.searchParams.get('role') === 'phone';
      const mine = isPhone ? phones : pcs;
      const other = isPhone ? pcs : phones;
      mine.add(ws);
      broadcastPeers();
      ws.on('message', (data) => {
        const text = data.toString();
        for (const c of other) if (c.readyState === WebSocket.OPEN) c.send(text);
      });
      ws.on('close', () => {
        mine.delete(ws);
        broadcastPeers();
      });
    });
  });

  // スマホ接続用の URL を作るため、PC の LAN 側アドレスを返す
  middlewares.use('/relay-info', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ addresses: lanAddresses() }));
  });
}

/** IPv4 の LAN アドレス。Windows のモバイルホットスポット（192.168.137.x）を先頭にする */
export function lanAddresses(): string[] {
  const list = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
  // 0: ホットスポット / 1: 一般的な LAN / 2: VPN（100.64/10 など）・WSL・リンクローカル
  const rank = (a: string) => {
    if (a.startsWith('192.168.137.')) return 0;
    if (a.startsWith('192.168.') || a.startsWith('10.')) return 1;
    return 2;
  };
  return [...new Set(list)].sort((a, b) => rank(a) - rank(b));
}

export function relayPlugin(): Plugin {
  return {
    name: 'phone-relay',
    configureServer(server) {
      attachRelay(server.httpServer, server.middlewares);
    },
    configurePreviewServer(server) {
      attachRelay(server.httpServer, server.middlewares);
    },
  };
}
