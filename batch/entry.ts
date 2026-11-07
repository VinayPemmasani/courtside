// Headless batch entry: pose + core analysis for one clip, returns derived stats only (no video).
import { runPose } from '../src/pose/poseRunner';
import { analyze, DEFAULT_RULES, type Handedness } from '../src/core';

(window as any).runClip = async (url: string, o: { sampleFps: number; slowmo: number; hand: Handedness; start?: number; end?: number }) => {
  const frames = await runPose(url, { fps: o.sampleFps, start: o.start ?? 0, end: o.end ?? 1e9, model: 'full' });
  // A slow-motion clip covers 1/slowmo real seconds per clip second, so real fps is higher.
  const realFps = o.sampleFps * o.slowmo;
  const { strokes } = analyze({ frames, fps: realFps, hand: o.hand, rules: DEFAULT_RULES });
  return {
    framesSampled: frames.length, framesWithPose: frames.filter((f) => f.world).length, realFps,
    strokes: strokes.map((s) => ({
      type: s.type, spin: s.spin ?? null,
      shot: s.spin ? `${s.type}-${s.spin}` : s.type,
      clipTime: frames[s.contactFrame]?.t,
      peakWristSpeed: s.peakSpeed,
      phaseTimingMs: Object.fromEntries(s.phases.map((p) => [p.id, Math.round(((p.frame - s.contactFrame) / realFps) * 1000)])),
      metrics: s.metrics,
      rules: s.keyPoints.map((k) => ({ rule: k.ruleId, phase: k.phaseId, status: k.status, metric: k.metric, value: k.value })),
    })),
  };
};
(window as any).batchReady = true;
