import { loadVideo, primeVideo, seek, withTimeout } from '../pose/poseRunner';

/** A tiny, nearly invisible video kept on the page: iPhones neither load nor seek videos that are off the page. */
function onPageVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  Object.assign(v.style, { position: 'fixed', left: '0', bottom: '0', width: '2px', height: '2px', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
  document.body.appendChild(v);
  return v;
}

/**
 * A private video element for rendering stills (thumbnails, exports, ball reading) without
 * disturbing the main player. Requests are served one at a time.
 */
export class FrameGrabber {
  private el: HTMLVideoElement | null = null;
  private video: Promise<HTMLVideoElement>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(url: string) {
    this.el = typeof document !== 'undefined' ? onPageVideo() : null;
    if (this.el) this.el.src = url;
    this.video = loadVideo(url, this.el).then(async (v) => { await primeVideo(v).catch(() => undefined); return v; });
  }

  /** Seek to `t` seconds, then run `use` with the video showing that frame. */
  at<T>(t: number, use: (v: HTMLVideoElement) => T | Promise<T>): Promise<T> {
    const job = this.queue.then(async () => {
      const v = await this.video;
      if (Math.abs(v.currentTime - t) > 1e-4 || v.readyState < 2) {
        // Never hang the queue: after a stuck seek, use whatever frame is showing.
        await withTimeout(seek(v, t), 4000, 'seek').catch(() => undefined);
      }
      return use(v);
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  async size() {
    const v = await this.video;
    return { w: v.videoWidth, h: v.videoHeight };
  }

  async dispose() {
    const v = await this.video.catch(() => null);
    if (v) { v.removeAttribute('src'); v.load(); }
    this.el?.remove();
  }
}
