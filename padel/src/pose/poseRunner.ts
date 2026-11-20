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
export function seek(video: HTMLVideoElement, t: number): Promise<void> {
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

/** iPhone / iPad (including iPadOS that reports itself as a Mac). */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

class SeekStuck extends Error {}

type Detect = (t: number, mediaTime: number) => PoseFrame;

/**
 * Read frames by playing the clip through (muted, slowed down) and catching each presented frame,
 * instead of seeking frame by frame. iOS often never completes a seek on a paused video, but it
 * always plays. Grid slots that no presented frame landed on take the nearest frame that did.
 */
async function readByPlayback(
  video: HTMLVideoElement, from: number, end: number, fps: number, slots: (PoseFrame | null)[], first: number,
  detect: Detect, opts: PoseRunOptions,
): Promise<void> {
  const total = slots.length;
  const start = opts.start;
  const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, m: { mediaTime: number }) => void) => number }).requestVideoFrameCallback?.bind(video);
  video.muted = true;
  video.playsInline = true;
  video.pause();
  video.playbackRate = 0.4;
  video.currentTime = Math.max(0, from - 0.05);
  await new Promise<void>((resolve, reject) => {
    let done = false;
    let lastProgress = performance.now();
    let lastMedia = -1;
    let filled = 0;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearInterval(watch);
      video.removeEventListener('ended', onEnded);
      video.pause();
      if (err) reject(err); else resolve();
    };
    const onEnded = () => finish();
    const take = (mediaTime: number) => {
      if (done) return;
      if (opts.signal?.aborted) { finish(new DOMException('Cancelled', 'AbortError')); return; }
      if (mediaTime > lastMedia + 1e-4) { lastMedia = mediaTime; lastProgress = performance.now(); }
      const k = Math.round((mediaTime - start) * fps);
      if (k >= first && k < total && !slots[k]) {
        try { slots[k] = detect(start + k / fps, mediaTime); } catch (e) { finish(e as Error); return; }
        filled++;
        if (filled % 3 === 0) opts.onProgress?.(Math.min(total, k + 1), total);
      }
      if (mediaTime >= end - 0.5 / fps) finish();
    };
    const onFrame = (_now: number, m: { mediaTime: number }) => { take(m.mediaTime); if (!done) rvfc!(onFrame); };
    const onRaf = () => { take(video.currentTime); if (!done) requestAnimationFrame(onRaf); };
    video.addEventListener('ended', onEnded);
    // Nothing new for a while: the clip stopped playing.
    const watch = setInterval(() => {
      if (video.paused && !done && video.readyState >= 2) video.play().catch(() => {});
      if (performance.now() - lastProgress > 12000) {
        finish(filled > 0 ? undefined : new Error('The video would not play on this device. Try again, or export it from Photos as "Most Compatible" (H.264).'));
      }
    }, 500);
    if (rvfc) rvfc(onFrame); else requestAnimationFrame(onRaf);
    const p = video.play();
    if (p) p.catch((e) => finish(new Error('The video would not play on this device (' + (e?.name ?? 'blocked') + '). Tap Analyse again.')));
  });
  video.playbackRate = 1;
}

/**
 * Run pose estimation over [start, end] of a video at `fps` samples per second.
 * Each sample seeks the video to an exact time, so results line up with playback frames. When
 * seeking does not work (iPhone), the clip is played through and frames are caught as they show.
 */
export async function runPose(url: string, opts: PoseRunOptions): Promise<PoseFrame[]> {
  opts.onStage?.('Loading the pose model…');
  const landmarker = await withTimeout(getLandmarker(opts.model), 90000, 'The pose model did not load. Check your connection and try again, or pick the Fast model.');
  opts.onStage?.('Opening the video…');
  const own = !opts.video;
  const video = await loadVideo(url, opts.video);
  await primeVideo(video).catch(() => { /* playback below loads it */ });
  opts.onStage?.('Tracking the player…');
  const end = Math.min(opts.end, Number.isFinite(video.duration) ? video.duration : opts.end);
  const total = Math.max(1, Math.floor((end - opts.start) * opts.fps) + 1);
  const slots: (PoseFrame | null)[] = new Array(total).fill(null);
  // Continue this run's timeline after wherever the landmarker's clock left off.
  const offsetMs = lastTimestampMs + 1 - Math.round(opts.start * 1000);
  const detect: Detect = (t, mediaTime) => {
    const ts = nextTimestamp(lastTimestampMs, mediaTime, offsetMs);
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
    return {
      t,
      image: img ? img.map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })) : null,
      world: world ? world.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null,
    };
  };

  let i = 0;
  if (!isAppleMobile()) {
    try {
      for (; i < total; i++) {
        if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        const t = opts.start + i / opts.fps;
        await withTimeout(seek(video, t), i === 0 ? 5000 : 8000, 'seek').catch((e) => { throw e instanceof DOMException ? e : new SeekStuck(); });
        if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        slots[i] = detect(t, t);
        if (i % 3 === 0) opts.onProgress?.(i + 1, total);
      }
    } catch (e) {
      if (!(e instanceof SeekStuck)) throw e;
    }
  }
  if (i < total) {
    opts.onStage?.('Tracking the player (playing the clip through)…');
    try { video.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
    await readByPlayback(video, opts.start + i / opts.fps, end, opts.fps, slots, i, detect, opts);
  }
  // Fill slots no frame landed on with the nearest one that did.
  const have = slots.map((f, k) => (f ? k : -1)).filter((k) => k >= 0);
  if (!have.length) throw new Error('No frames could be read from this video on this device. Try exporting it from Photos as "Most Compatible" (H.264).');
  const frames: PoseFrame[] = slots.map((f, k) => {
    if (f) return f;
    let best = have[0];
    for (const h of have) if (Math.abs(h - k) < Math.abs(best - k)) best = h;
    return { ...slots[best]!, t: opts.start + k / opts.fps };
  });
  opts.onProgress?.(total, total);
  if (own) {
    video.removeAttribute('src');
    video.load();
  } else {
    video.pause();
    try { video.currentTime = opts.start; } catch { /* ignore */ }
  }
  return frames;
}
