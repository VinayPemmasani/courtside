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
  /** What is happening before frames start (loading the model, opening the video). */
  onStage?: (stage: string) => void;
  signal?: AbortSignal;
  /** A video element already on the page showing this clip (more reliable on phones). */
  video?: HTMLVideoElement | null;
}

/**
 * Seek and wait until the frame at `t` can be drawn. Phones sometimes skip the `seeked` event (or
 * fire it before a frame is decoded), so this also polls: done once the video is no longer seeking,
 * sits at `t`, and has frame data.
 */
function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let poll: ReturnType<typeof setInterval> | 0 = 0;
    const ready = () => !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - t) < 0.05;
    const check = () => { if (ready()) { cleanup(); resolve(); } };
    const fail = () => { cleanup(); reject(new Error('Could not read the video at ' + t.toFixed(2) + 's')); };
    const cleanup = () => {
      clearInterval(poll);
      for (const e of ['seeked', 'canplay', 'loadeddata', 'timeupdate']) video.removeEventListener(e, check);
      video.removeEventListener('error', fail);
    };
    for (const e of ['seeked', 'canplay', 'loadeddata', 'timeupdate']) video.addEventListener(e, check);
    video.addEventListener('error', fail);
    poll = setInterval(check, 50);
    if (Math.abs(video.currentTime - t) >= 1e-3 || video.seeking) video.currentTime = t;
    check();
  });
}

/**
 * Make sure the video has decoded data. iOS loads only metadata until a video has played, and then
 * never finishes a seek: a muted, inline play() (allowed without a tap) followed by pause() fixes it.
 */
export async function primeVideo(video: HTMLVideoElement) {
  if (video.readyState >= 2) return;
  video.muted = true;
  video.playsInline = true;
  try { await video.play(); } catch { /* not allowed: the waits below still run */ }
  video.pause();
  if (video.readyState >= 2) return;
  await withTimeout(new Promise<void>((resolve) => {
    const ok = () => { video.removeEventListener('loadeddata', ok); video.removeEventListener('canplay', ok); resolve(); };
    video.addEventListener('loadeddata', ok);
    video.addEventListener('canplay', ok);
    video.load();
  }), 15000, 'The video did not load on this device. Try again, or export it from Photos as "Most Compatible" (H.264).');
}

/** Reject if `p` has not settled within `ms`, with a message the player can act on. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

/**
 * Open a video for frame-accurate reading. Phones (iOS Safari in particular) often never fire
 * `loadeddata` for a video that is not on the page, so metadata is enough here: every frame is
 * read after a seek anyway. An element already on the page can be passed in and is used as is.
 */
export function loadVideo(url: string, existing?: HTMLVideoElement | null): Promise<HTMLVideoElement> {
  if (existing && existing.readyState >= 1) { existing.pause(); return Promise.resolve(existing); }
  return withTimeout(new Promise((resolve, reject) => {
    const v = existing ?? document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    const ok = () => resolve(v);
    v.addEventListener('loadedmetadata', ok, { once: true });
    v.addEventListener('loadeddata', ok, { once: true });
    v.onerror = () => reject(new Error('This video format could not be opened. Try MP4 (H.264) or MOV.'));
    if (!existing) v.src = url;
    v.load();
  }), 20000, 'The video did not open on this device. Try again, or export it from Photos as "Most Compatible" (H.264).');
}

/**
 * Run pose estimation over [start, end] of a video at `fps` samples per second.
 * Each sample seeks the video to an exact time, so results line up with playback frames.
 */
export async function runPose(url: string, opts: PoseRunOptions): Promise<PoseFrame[]> {
  opts.onStage?.('Loading the pose model…');
  const landmarker = await withTimeout(getLandmarker(opts.model), 90000, 'The pose model did not load. Check your connection and try again, or pick the Fast model.');
  opts.onStage?.('Opening the video…');
  const own = !opts.video;
  const video = await loadVideo(url, opts.video);
  await primeVideo(video);
  opts.onStage?.('Tracking the player…');
  const end = Math.min(opts.end, video.duration);
  const total = Math.max(1, Math.floor((end - opts.start) * opts.fps) + 1);
  const frames: PoseFrame[] = [];
  // Continue this run's timeline after wherever the landmarker's clock left off.
  const offsetMs = lastTimestampMs + 1 - Math.round(opts.start * 1000);
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const t = opts.start + i / opts.fps;
    await withTimeout(seek(video, t), 15000, `The video could not be read at ${t.toFixed(2)} s on this device.`);
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
  if (own) {
    video.removeAttribute('src');
    video.load();
  }
  return frames;
}
