import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake MediaPipe landmarker that enforces the real graph's rule: every
// detectForVideo timestamp must be strictly greater than the previous one.
const seen: number[] = [];
let instances = 0;
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  PoseLandmarker: {
    createFromOptions: async () => {
      instances++;
      let last = -1;
      return {
        detectForVideo: (_v: unknown, ts: number) => {
          if (ts <= last) {
            throw new Error(`INVALID_ARGUMENT: Packet timestamp mismatch. Current minimum expected timestamp is ${last + 1} but received ${ts}.`);
          }
          last = ts;
          seen.push(ts);
          return { landmarks: [], worldLandmarks: [] };
        },
        close: () => {},
      };
    },
  },
}));

// Minimal <video> stand-in: fires loadeddata on src, seeked on currentTime.
class FakeVideo {
  duration = 40;
  muted = false; playsInline = false; preload = '';
  onloadeddata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private l: Record<string, Set<() => void>> = {};
  set src(_u: string) { queueMicrotask(() => this.onloadeddata?.()); }
  set currentTime(_t: number) { queueMicrotask(() => this.l.seeked?.forEach((f) => f())); }
  addEventListener(n: string, f: () => void) { (this.l[n] ??= new Set()).add(f); }
  removeEventListener(n: string, f: () => void) { this.l[n]?.delete(f); }
  removeAttribute() {}
  setAttribute() {}
  load() { queueMicrotask(() => this.l.loadedmetadata?.forEach((f) => f())); }
}
(globalThis as any).document = { createElement: () => new FakeVideo() };

const { runPose, nextTimestamp } = await import('../poseRunner');

describe('pose timestamps', () => {
  beforeEach(() => { seen.length = 0; });

  it('keeps increasing when a second, shorter video is analysed after a longer one', async () => {
    // First clip ends at 33.2 s, the case from the bug report.
    await runPose('a.mp4', { fps: 10, start: 30, end: 33.2, model: 'lite' });
    await runPose('b.mp4', { fps: 10, start: 0, end: 2, model: 'lite' });
    expect(instances).toBe(1); // landmarker is still reused
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('handles re-analysing the same clip from an earlier start', async () => {
    await runPose('a.mp4', { fps: 30, start: 5, end: 6, model: 'lite' });
    await runPose('a.mp4', { fps: 30, start: 0, end: 1, model: 'lite' });
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('keeps real frame spacing within a run', () => {
    expect(nextTimestamp(999, 0.1, 1000)).toBe(1100);
    expect(nextTimestamp(1100, 0.1004, 1000)).toBe(1101); // rounding collision still advances
  });
});
