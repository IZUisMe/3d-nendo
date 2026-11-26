/**
 * DeviceOrientation（alpha, beta, gamma）から、スマホの上端が向いている方向を求める。
 * W3C 仕様の回転行列 R = Rz(alpha)·Rx(beta)·Ry(gamma) を使う。
 * - yaw: 左右の向き（右に向けると増える）
 * - pitch: 上下の向き（上に向けると増える）
 * - roll: 向けた軸まわりのひねり（後ろから見て時計回り＝右端を下げると増える）
 */
export function phonePose(alpha: number, beta: number, gamma: number) {
  const r = Math.PI / 180;
  const cX = Math.cos(beta * r);
  const sX = Math.sin(beta * r);
  const cY = Math.cos(gamma * r);
  const sY = Math.sin(gamma * r);
  const cZ = Math.cos(alpha * r);
  const sZ = Math.sin(alpha * r);
  // 端末の Y 軸（上端の方向）のワールド座標（x: 東, y: 北, z: 上）
  const yx = -cX * sZ;
  const yy = cZ * cX;
  const yz = sX;
  // 端末の X 軸（右端）の上下成分と、Z 軸（画面の法線）の上下成分
  const xz = -cX * sY;
  const zz = cX * cY;
  return {
    yaw: (Math.atan2(yx, yy) * 180) / Math.PI,
    pitch: (Math.asin(Math.max(-1, Math.min(1, yz))) * 180) / Math.PI,
    roll: (Math.atan2(-xz, zz) * 180) / Math.PI,
  };
}
