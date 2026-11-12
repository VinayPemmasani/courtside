import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseFrame } from '../core';

/** lite = fastest, full = default, heavy = most accurate (slowest; falls back to full if missing). */
export type ModelSize = 'full' | 'lite' | 'heavy';

let cached: { size: ModelSize; landmarker: PoseLandmarker } | null = null;

/**
 * MediaPipe's VIDEO mode keeps graph state between calls and rejects any
 * timestamp that is not strictly greater than the last one it saw. The
 * landmarker is cached and reused across videos (and across re-analysing the
 * same clip from an earlier start time), so timestamps derived from the
 * video position alone can go backwards. Keep one clock per landmarker that
 * only ever moves forward.
 */
let lastTimestampMs = -1;

export function nextTimestamp(lastMs: number, videoTimeSec: number, offsetMs: number): number {
  return Math.max(lastMs + 1, offsetMs + Math.round(videoTimeSec * 1000));
}

function dropLandmarker() {
  try { cached?.landmarker.close(); } catch { /* already broken */ }
  cached = null;
  lastTimestampMs = -1;
}

async function getLandmarker(size: ModelSize): Promise<PoseLandmarker> {
  if (cached?.size === size) return cached.landmarker;
  dropLandmarker();
  const base = import.meta.env.BASE_URL;
  const vision = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${base}models/pose_landmarker_${size}.task`, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let landmarker: PoseLandmarker;
  try {
    landmarker = await make('GPU');
  } catch {
    try {
      landmarker = await make('CPU');
    } catch (err) {
      // The heavy model is an optional download; use the full one when it is not there.
      if (size === 'heavy') return getLandmarker('full');
      throw err;
    }
  }
  cached = { size, landmarker };
  return landmarker;
}

export interface PoseRunOptions {
  fps: number;
  start: number;
  end: number;
  model: ModelSize;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Could not read the video at ' + t.toFixed(2) + 's')); };
    const cleanup = () => { video.removeEventListener('seeked', done); video.removeEventListener('error', fail); };
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = t;
  });
}

export function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('This video format could not be opened. Try MP4 (H.264) or MOV.'));
  });
}

/**
 * Run pose estimation over [start, end] of a video at `fps` samples per second.
 * Each sample seeks the video to an exact time, so results line up with playback frames.
 */
export async function runPose(url: string, opts: PoseRunOptions): Promise<PoseFrame[]> {
  const landmarker = await getLandmarker(opts.model);
  const video = await loadVideo(url);
  const end = Math.min(opts.end, video.duration);
  const total = Math.max(1, Math.floor((end - opts.start) * opts.fps) + 1);
  const frames: PoseFrame[] = [];
  // Continue this run's timeline after wherever the landmarker's clock left off.
  const offsetMs = lastTimestampMs + 1 - Math.round(opts.start * 1000);
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const t = opts.start + i / opts.fps;
    await seek(video, t);
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const ts = nextTimestamp(lastTimestampMs, t, offsetMs);
    lastTimestampMs = ts;
    let res;
    try {
      res = landmarker.detectForVideo(video, ts);
    } catch (err) {
      // A failed graph can stay wedged; start fresh next time.
      dropLandmarker();
      throw err;
    }
    const img = res.landmarks[0];
    const world = res.worldLandmarks[0];
    frames.push({
      t,
      image: img ? img.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })) : null,
      world: world ? world.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null,
    });
    if (i % 3 === 0) opts.onProgress?.(i + 1, total);
  }
  opts.onProgress?.(total, total);
  video.removeAttribute('src');
  video.load();
  return frames;
}
