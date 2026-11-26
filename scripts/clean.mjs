// dist/ を削除する。
// Node 24 の再帰的な fs.rmSync / fs.cpSync は、日本語を含むパス（例: 八塚3D）で
// Windows 上でクラッシュする（0xC0000409）ため、1ファイルずつ消す。
// Vite も既存の dist/ を消すときに同じ関数を使うので、ビルド前にここで消しておく。
import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

function removeTree(p) {
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) removeTree(join(p, f));
    rmdirSync(p);
  } else {
    unlinkSync(p);
  }
}

removeTree(process.argv[2] ?? 'dist');
