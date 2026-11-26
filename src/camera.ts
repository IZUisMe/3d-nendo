/**
 * カメラ映像を1か所で取得して共有する。
 * 手の検出と、将来の「白い紙」検出が同じ映像を使えるようにするため。
 */
let video: HTMLVideoElement | null = null;

export async function getSharedCamera(): Promise<HTMLVideoElement> {
  if (video) return video;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  const v = document.createElement('video');
  v.srcObject = stream;
  v.muted = true;
  v.playsInline = true;
  await v.play();
  video = v;
  return v;
}
