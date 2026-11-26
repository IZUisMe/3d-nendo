import { describe, expect, it } from 'vitest';
import { phonePose } from '../src/input/phonePose';
import { TwistRatchet, wrapDeg } from '../src/input/twist';

const close = (a: number, b: number) => expect(Math.abs(wrapDeg(a - b))).toBeLessThan(1e-6);

describe('phonePose（画面を上にして上端を前に向けて持つ）', () => {
  it('水平に置いた状態は正面・ひねりなし', () => {
    const p = phonePose(0, 0, 0);
    close(p.yaw, 0);
    close(p.pitch, 0);
    close(p.roll, 0);
  });
  it('左に向ける（alpha が増える）と yaw が減る', () => {
    close(phonePose(30, 0, 0).yaw, -30);
  });
  it('上端を持ち上げる（beta が増える）と pitch が増える', () => {
    close(phonePose(0, 20, 0).pitch, 20);
  });
  it('右端を下げる（gamma が増える）と roll が増える', () => {
    close(phonePose(0, 0, 25).roll, 25);
  });
  it('上に向けたまま左右に向けても pitch は変わらない', () => {
    const p = phonePose(40, 20, 0);
    close(p.pitch, 20);
    close(p.yaw, -40);
  });
});

describe('TwistRatchet', () => {
  it('掴んだ瞬間の角度を基準に、しきい値を超えると1回だけ回る', () => {
    const r = new TwistRatchet();
    expect(r.update(true, 10)).toBe(0); // 基準 = 10°
    expect(r.update(true, 40)).toBe(0);
    expect(r.update(true, 70)).toBe(-1); // 時計回りに 60° → 上から見て時計回り
    expect(r.update(true, 90)).toBe(0); // 戻すまで次は回らない
    expect(r.update(true, 20)).toBe(0); // 基準付近に戻す → 再び回せる
    expect(r.update(true, -50)).toBe(1); // 反時計回り
  });
  it('離すと基準がリセットされる', () => {
    const r = new TwistRatchet();
    r.update(true, 0);
    r.update(false, 0);
    expect(r.update(true, 80)).toBe(0); // 新しい基準 = 80°
    expect(r.update(true, 80)).toBe(0);
  });
  it('-180/180 をまたいでも正しく判定する', () => {
    const r = new TwistRatchet();
    r.update(true, 170);
    expect(r.update(true, -130)).toBe(-1); // 170 → 230 相当（+60°）
  });
});
