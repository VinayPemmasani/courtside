import { findBlobs, heightAboveGround, readBall, sides, type Blob, type BallReading, type Handedness, type PoseFrame, type Stroke, type Vec3 } from '../core';
import type { FrameGrabber } from './grabber';

/** Width the frames are scaled to for the colour search: enough for a ball a few pixels across. */
const WORK_WIDTH = 720;
/** How far before contact to look for the bounce, s. */
const LOOK_BACK = 1.2;
/** Typical phone camera: focal length about 0.73 of the frame's long side (26 mm equivalent). */
const FOCAL = 0.73;

const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

/** Camera-to-player distance at a frame, from the torso's size on screen against its real length. */
function playerDepth(f: PoseFrame | undefined, vw: number, vh: number): number | undefined {
  const im = f?.image, w = f?.world;
  if (!im || !w) return undefined;
  const sa = { x: ((im[11].x + im[12].x) / 2) * vw, y: ((im[11].y + im[12].y) / 2) * vh };
  const ha = { x: ((im[23].x + im[24].x) / 2) * vw, y: ((im[23].y + im[24].y) / 2) * vh };
  const lImg = Math.hypot(sa.x - ha.x, sa.y - ha.y) / Math.max(vw, vh);
  const ws = mid(w[11], w[12]), wh = mid(w[23], w[24]);
  const lW = Math.hypot(ws.x - wh.x, ws.y - wh.y, ws.z - wh.z);
  if (lImg < 0.01 || lW < 0.2) return undefined;
  const d = (FOCAL * lW) / lImg;
  return d > 1 && d < 40 ? d : undefined;
}

/**
 * Reads the ball's flight around one stroke's contact from the video: yellow blobs in each frame
 * from about 1.2 s before contact, then readBall() for the bounce and the bounce stage.
 */
export async function readStrokeBall(opts: {
  grabber: FrameGrabber;
  frames: PoseFrame[];
  stroke: Stroke;
  hand: Handedness;
  fps: number;
  start: number;
}): Promise<BallReading | null> {
  const { grabber, frames, stroke, hand, fps, start } = opts;
  const { w: vw, h: vh } = await grabber.size();
  if (!vw || !vh) return null;
  const scale = Math.min(1, WORK_WIDTH / vw);
  const cw = Math.round(vw * scale), ch = Math.round(vh * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const c = stroke.contactFrame;
  const from = Math.max(0, c - Math.round(LOOK_BACK * fps));
  const to = Math.min(frames.length - 1, c + 4);
  const blobs = new Map<number, Blob[]>();
  for (let i = from; i <= to; i++) {
    const found = await grabber.at(start + i / fps + 1e-3, (v) => {
      ctx.drawImage(v, 0, 0, cw, ch);
      return findBlobs(ctx.getImageData(0, 0, cw, ch));
    });
    blobs.set(i, found);
  }
  const { dom } = sides(hand);
  const im = frames[c]?.image;
  const handPt = im ? { x: im[dom.wrist].x, y: im[dom.wrist].y } : null;
  const hs = [c - 1, c, c + 1].map((i) => { const w = frames[i]?.world; return w ? heightAboveGround(w, w[dom.wrist]) : undefined; }).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
  const height = hs.length ? hs[Math.floor(hs.length / 2)] : undefined;
  return readBall({ blobs, contact: c, from, fps, hand: handPt, height, playerDepth: playerDepth(frames[c], vw, vh) }) ?? null;
}
