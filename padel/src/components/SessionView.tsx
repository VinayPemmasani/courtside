import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import {
  checkSetup, proOverlay, rankPros, type ProRef, forwardSwingEnd, forwardSwingStart, formatMetric, METRIC_INFO, movePhase, strokeForBounce, type Lines, type Vec2, newId, prepare, retypeStroke, shareAt, strokeAt, topFix, weightTransfer,
  type AnchorJoint, type Callout, type KeyPoint, type Phase, type Stroke, type StrokeType,
} from '../core';
import { STROKE_LABEL, STROKE_TYPES, fmtStamp, fmtTime } from '../labels';
import { SESSION_KINDS, store, TAGS, type Player, type Session, type SessionKind } from '../storage/db';
import { placeBounces, sessionBundle, sessionCsv } from '../storage/share';
import { saveFile, slug } from '../render/files';
import { drawCourtOverlay, fromCanvas } from '../render/court';
import { CourtPanel } from './CourtPanel';
import { SetupBadge } from './FilmingGuide';
import { ContactReading, FocusCard, PowerSequence } from './Insights';
import { topicFor } from '../drills/catalog';
import { ProComparePanel } from './ProCompare';
import { StrikeCardsBar, StrikePanel } from './StrikeLab';
import { exportStrikeImage, exportStrikeImages, exportStrikePdf, exportStrikeVideo, renderStrikeCard, strikeCardInput } from '../render/strikeCards';
import { BreakdownPanel } from './Breakdown';
import { BREAKDOWN_SLOW, breakdownInput, exportBreakdownVideo, holdMs, renderBreakdown } from '../render/breakdown';
import { readStrokeBall } from '../render/balltrack';
import { analyseStrike, applyRules, courtMap, strikeApplies, strikeCards, strokeBreakdown, strokeStage } from '../core';
import { loadProRefs } from '../storage/pros';
import { drawBallTrack, drawCallouts, drawProSkeleton, drawSkeleton, drawTrail, drawVideo, fullCrop, type LabelBox, type View } from '../render/overlay';
import { FrameGrabber } from '../render/grabber';
import { canExportVideo, exportCarousel, exportPdf, exportVideo, renderCard, type CardContext } from '../render/export';
import { exportStudioVideo, phaseHeadline } from '../render/reel';
import { StudioScene } from '../render/scene3d';
import { loadStudioFonts, renderStudio } from '../render/studio';

const ANCHORS: { id: AnchorJoint; label: string }[] = [
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'domShoulder', label: 'Hitting shoulder' },
  { id: 'domElbow', label: 'Hitting elbow' },
  { id: 'domWrist', label: 'Hitting hand' },
  { id: 'nonDomWrist', label: 'Other hand' },
  { id: 'hips', label: 'Hips' },
  { id: 'knee', label: 'Knee' },
  { id: 'head', label: 'Head' },
];

/**
 * iPhones load only a video's metadata until it has played, so frames never reach the canvas.
 * A muted inline play() and pause() (allowed without a tap) makes it load frames; then `then` runs.
 */
function primeForPhone(v: HTMLVideoElement, then: () => void) {
  if (v.readyState >= 2) { then(); return; }
  v.muted = true;
  const p = v.play();
  if (!p) { v.pause(); then(); return; }
  p.then(() => { v.pause(); then(); }, () => then());
}

export function SessionView({ id }: { id: string }) {
  const { go, rules } = useApp();
  const [session, setSession] = useState<Session>();
  const [player, setPlayer] = useState<Player>();
  const [url, setUrl] = useState<string>();
  const [strokeId, setStrokeId] = useState<string>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [coach, setCoach] = useState(false);
  const [selCallout, setSelCallout] = useState<string>();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [studio, setStudio] = useState(false);
  const [studioView, setStudioView] = useState<'footage' | 'coach'>('footage');
  const [figure, setFigure] = useState<'mannequin' | 'athlete'>('mannequin');
  const [placement, setPlacement] = useState(false);
  const [proMode, setProMode] = useState(false);
  const [strikeMode, setStrikeMode] = useState(false);
  const [bdMode, setBdMode] = useState(false);
  const [bdStep, setBdStep] = useState(0);
  const [bdPlaying, setBdPlaying] = useState(false);
  const bdClock = useRef({ start: 0, step: 0, playing: false });
  /** Strike lab 3D card on show (null = the video), and its slow-motion run-in clock. */
  const [cardK, setCardK] = useState<number | null>(null);
  const cardClock = useRef({ start: 0, playing: false });
  const [ballBusy, setBallBusy] = useState<string | null>(null);
  const ballRun = useRef(0);
  const [proRefs, setProRefs] = useState<ProRef[] | null>(null);
  const [proKey, setProKey] = useState<string>();
  const [corners, setCorners] = useState<Vec2[] | null>(null);
  const [selBounce, setSelBounce] = useState<string>();
  const viewRef = useRef<View>();
  const studioScene = useRef<StudioScene>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<LabelBox[]>([]);
  const drag = useRef<{ id: string; offX: number; offY: number; ax: number; ay: number } | null>(null);
  const playUntil = useRef<number | null>(null);
  const thenPlay = useRef<(() => void) | null>(null);
  const grabber = useRef<FrameGrabber>();

  useEffect(() => {
    let objectUrl: string | undefined;
    let dead = false;
    (async () => {
      const s = await store.session(id);
      if (!s) return;
      const ps = await store.players();
      setPlayer(ps.find((p) => p.id === s.playerId));
      setSession(s);
      setStrokeId(s.strokes[0]?.id);
      // On a second device the video may still need to come down from the cloud.
      const blob = await store.video(id);
      if (blob && !dead) {
        objectUrl = URL.createObjectURL(blob);
        grabber.current = new FrameGrabber(objectUrl);
        setUrl(objectUrl);
      }
    })();
    return () => {
      dead = true;
      grabber.current?.dispose();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const prepared = useMemo(() => (session && player ? prepare(session.frames, session.fps, player.hand) : null), [session?.frames, player]);
  const stroke = session?.strokes.find((s) => s.id === strokeId);
  const placed = useMemo(() => (session && prepared ? placeBounces(session, prepared.frames) : []), [session, prepared]);
  const setup = useMemo(() => (session ? checkSetup(session.frames, session.fps, session.width / (session.height || 1)) : null), [session?.frames]);
  const phaseHere = stroke?.phases.find((p) => p.frame === frame);
  useEffect(() => {
    if (proMode && !proRefs) loadProRefs().then(setProRefs);
  }, [proMode, proRefs]);
  const proMatches = useMemo(() => {
    if (!proMode || !proRefs || !stroke || !prepared || !player) return [];
    // A pro's own session never compares against itself.
    return rankPros({ frames: prepared.frames, stroke, hand: player.hand }, proRefs.filter((r) => r.sessionId !== session?.id));
  }, [proMode, proRefs, stroke, prepared, player, session?.id]);
  const proMatch = proMatches.find((m) => m.ref.key === proKey) ?? proMatches[0];
  const nFrames = session?.frames.length ?? 0;
  const cardsOn = strikeMode && cardK !== null;
  const breakdown = useMemo(() => ((bdMode || cardsOn) && stroke && prepared && player && session ? strokeBreakdown({ frames: prepared.frames, yaw: prepared.yaw, fps: session.fps, hand: player.hand }, stroke) : null), [bdMode, cardsOn, stroke, prepared, player, session?.fps]);
  const strikeNow = useMemo(() => {
    if (!strikeMode || !stroke || !prepared || !player || !session || !strikeApplies(stroke)) return undefined;
    return analyseStrike({ frames: prepared.frames, stroke, hand: player.hand, fps: prepared.fps, yaw: prepared.yaw, hipYaw: prepared.hipYaw ?? [], court: session.court ? courtMap(session.court) : null, stage: stroke.strikeStage, ball: stroke.ballRead?.reading });
  }, [strikeMode, stroke, prepared, player, session?.court]);
  const cards = useMemo(() => (strikeMode && breakdown && stroke ? strikeCards(breakdown, strikeNow, stroke) : null), [strikeMode, breakdown, strikeNow, stroke]);

  const timeToFrame = useCallback((t: number) => {
    if (!session) return 0;
    return Math.max(0, Math.min(session.frames.length - 1, Math.round((t - session.start) * session.fps)));
  }, [session]);
  const frameToTime = (i: number) => (session ? session.start + i / session.fps : 0);

  const save = useCallback((next: Session, persist = true) => {
    setSession(next);
    if (persist) store.saveSession(next);
  }, []);

  const updateStroke = useCallback((st: Stroke, persist = true) => {
    if (!session) return;
    const strokes = session.strokes.some((x) => x.id === st.id) ? session.strokes.map((x) => (x.id === st.id ? st : x)) : [...session.strokes, st];
    save({ ...session, strokes: strokes.sort((a, b) => a.startFrame - b.startFrame) }, persist);
  }, [session, save]);

  // Drawing reads the latest state through a ref, so the playback loop never sees stale data.
  const latest = useRef({ session, prepared, stroke, player, coach, selCallout, studio, studioView, figure, placement, corners, placed, selBounce, proMode, proMatch, strikeMode, breakdown, bdMode, cards, cardK });
  latest.current = { session, prepared, stroke, player, coach, selCallout, studio, studioView, figure, placement, corners, placed, selBounce, proMode, proMatch, strikeMode, breakdown, bdMode, cards, cardK };

  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    const { session: s, prepared: p, stroke: st, player: pl, selCallout: sel, studio: look, studioView: camView, figure: fig, placement: court, corners: pending, placed: bounces, selBounce: selB, proMode: proOn, proMatch: pm, strikeMode: strikeOn, breakdown: bd, bdMode: bdOn, cards: cs, cardK: ck } = latest.current;
    if (!v || !c || !s || !p || !pl || !v.videoWidth) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(c.clientWidth * dpr);
    const H = Math.round((W * v.videoHeight) / v.videoWidth);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const view: View = { ctx: c.getContext('2d')!, W, H, vw: v.videoWidth, vh: v.videoHeight, crop: fullCrop(v.videoWidth, v.videoHeight) };
    viewRef.current = view;
    const i = Math.max(0, Math.min(s.frames.length - 1, Math.round((v.currentTime - s.start) * s.fps)));
    if (court) {
      // Shot placement: the plain video with the calibrated court and the bounces near this frame.
      drawVideo(view, v);
      drawSkeleton(view, p.frames[i]?.image ?? null);
      drawCourtOverlay(view, s.court, pending ?? [], bounces, i, s.fps, selB);
      boxes.current = [];
      return;
    }
    const inStroke = st && i >= st.startFrame && i <= st.endFrame ? st : s.strokes.find((x) => i >= x.startFrame && i <= x.endFrame);
    if (proOn) {
      // Pro compare: the video, your skeleton, and the pro's skeleton timed to the same phase.
      drawVideo(view, v);
      drawSkeleton(view, p.frames[i]?.image ?? null, !!pm);
      if (pm && st && i >= st.startFrame && i <= st.endFrame) {
        const o = proOverlay({ frames: p.frames, stroke: st, hand: pl.hand }, pm.ref, i, s.width || v.videoWidth, s.height || v.videoHeight);
        if (o) drawProSkeleton(view, o.image, p.frames[i]?.image ?? null, pl.hand);
        drawSkeleton(view, p.frames[i]?.image ?? null);
      }
      boxes.current = [];
      return;
    }
    if (strikeOn && !bdOn && cs && ck !== null && bd && st) {
      // Strike lab 3D card: a smooth slow-motion run into the card's frame, then the hold.
      if (!studioScene.current) {
        studioScene.current = new StudioScene(W, H);
        studioScene.current.ready.then(() => draw());
      }
      const card = cs[Math.min(ck, cs.length - 1)];
      const clock = cardClock.current;
      const run = ((card.frame - card.from) / s.fps / BREAKDOWN_SLOW) * 1000;
      const el = clock.playing ? performance.now() - clock.start : run + 1000;
      if (clock.playing && el >= run + 1000) clock.playing = false;
      const fi = el < run ? card.from + (el / run) * (card.frame - card.from) : card.frame;
      const hold = el < run ? 0 : Math.min(1, (el - run) / 1000);
      const weight = weightTransfer(p.frames, st, pl.hand);
      renderStrikeCard({ ctx: view.ctx, W, H }, studioScene.current, strikeCardInput({ frames: p.frames, fps: s.fps, hand: pl.hand, stroke: st, weight, figure: 'mannequin' }, bd, card, fi), bd, { card, total: cs.length, hold });
      boxes.current = [];
      return;
    }
    if (bdOn && bd && st) {
      // Step-by-step breakdown: the chapter's slow-motion run, then a hold with the readouts.
      if (!studioScene.current) {
        studioScene.current = new StudioScene(W, H);
        studioScene.current.ready.then(() => draw());
      }
      const clock = bdClock.current;
      let k = Math.min(clock.step, bd.chapters.length - 1);
      let ch = bd.chapters[k];
      const run = (x: typeof ch) => ((x.frame - x.from) / s.fps / BREAKDOWN_SLOW) * 1000;
      const now = performance.now();
      let el = now - clock.start;
      if (clock.playing && el >= run(ch) + holdMs(ch)) {
        if (k < bd.chapters.length - 1) { k++; clock.step = k; clock.start = now; el = 0; ch = bd.chapters[k]; setBdStep(k); }
        else { clock.playing = false; setBdPlaying(false); }
      }
      if (!clock.playing) el = Math.max(el, run(ch) + 0.3 * holdMs(ch));
      const r = run(ch);
      const i = el < r ? ch.from + (el / r) * (ch.frame - ch.from) : ch.frame;
      const hold = el < r ? 0 : Math.min(1, (el - r) / holdMs(ch));
      const beat = clock.playing ? Math.min(ch.beats.length - 1, Math.floor(hold * ch.beats.length)) : 0;
      const weight = weightTransfer(p.frames, st, pl.hand);
      renderBreakdown({ ctx: view.ctx, W, H }, studioScene.current, breakdownInput({ frames: p.frames, i, fps: s.fps, hand: pl.hand, stroke: st, weight, figure: 'mannequin' }, bd, ch), { breakdown: bd, chapter: ch, beat, hold });
      boxes.current = [];
      return;
    }
    if (look) {
      // 3D studio preview; callouts on a paused phase frame show as rings and pinned labels.
      if (!studioScene.current) {
        studioScene.current = new StudioScene(W, H);
        // First frames use the built-in figure; redraw with the real model once it has loaded.
        studioScene.current.ready.then(() => draw());
      }
      const ph = inStroke && v.paused ? inStroke.phases.find((x) => x.frame === i) : undefined;
      const weight = inStroke ? weightTransfer(p.frames, inStroke, pl.hand) : null;
      renderStudio({ ctx: view.ctx, W, H }, studioScene.current, { frames: p.frames, i, fps: s.fps, hand: pl.hand, stroke: inStroke, weight, view: camView, figure: fig, video: { width: s.width, height: s.height } }, {
        callouts: ph ? inStroke!.callouts.filter((x) => x.phaseId === ph.id) : [],
        gauge: shareAt(weight, i),
        headline: ph ? phaseHeadline(inStroke!, ph) : undefined,
      });
      boxes.current = [];
      return;
    } else {
      drawVideo(view, v);
      if (inStroke) drawTrail(view, p.frames, inStroke, i, pl.hand);
      drawSkeleton(view, p.frames[i]?.image ?? null);
      if (strikeOn && inStroke?.ballRead?.reading) drawBallTrack(view, inStroke.ballRead.reading, i);
    }
    boxes.current = [];
    if (inStroke && v.paused) {
      const ph = inStroke.phases.find((x) => x.frame === i);
      if (ph) boxes.current = drawCallouts(view, p.frames[i], inStroke.callouts.filter((x) => x.phaseId === ph.id), pl.hand, sel);
    }
  }, []);

  useEffect(() => { draw(); }, [draw, session, frame, coach, selCallout, prepared, studio, studioView, figure, placement, corners, placed, selBounce, proMode, proMatch, strikeMode, breakdown, bdStep]);
  // Breakdown playback runs on its own clock, not the video's.
  useEffect(() => {
    if (!bdMode || !bdPlaying) return;
    let id = 0;
    const loop = () => { draw(); if (bdClock.current.playing) id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [bdMode, bdPlaying, draw]);
  useEffect(() => { if (bdMode) loadStudioFonts().then(() => draw()); }, [bdMode, draw]);
  // Strike card run-in animation.
  useEffect(() => {
    if (!cardsOn) return;
    let id = 0;
    loadStudioFonts().then(() => draw());
    const loop = () => { draw(); if (cardClock.current.playing) id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [cardsOn, cardK, cards, draw]);
  const showCard = (k: number | null) => {
    cardClock.current = { start: performance.now(), playing: k !== null };
    setCardK(k);
    if (k !== null) videoRef.current?.pause();
  };
  const bdGo = (k: number, play: boolean) => {
    bdClock.current = { start: performance.now(), step: k, playing: play };
    setBdStep(k);
    setBdPlaying(play);
    videoRef.current?.pause();
    draw();
  };

  // Ball flight: once per contact, read the ball's bounce from the video for every groundstroke, so
  // each shot knows whether it was taken rising, at the peak or falling.
  useEffect(() => {
    if (!session || !prepared || !player || !url || !grabber.current) return;
    const todo = session.strokes.filter((s) => strikeApplies(s) && s.ballRead?.contact !== s.contactFrame);
    if (!todo.length) return;
    const run = ++ballRun.current;
    const g = grabber.current;
    (async () => {
      const results = new Map<string, NonNullable<Stroke['ballRead']>>();
      for (let k = 0; k < todo.length; k++) {
        if (ballRun.current !== run) return;
        setBallBusy(`Reading ball flight ${k + 1}/${todo.length}`);
        let reading = null;
        try { reading = await readStrokeBall({ grabber: g, frames: prepared.frames, stroke: todo[k], hand: player.hand, fps: session.fps, start: session.start }); } catch { reading = null; }
        results.set(todo[k].id, { contact: todo[k].contactFrame, reading });
      }
      if (ballRun.current !== run) return;
      setBallBusy(null);
      setSession((cur) => {
        if (!cur) return cur;
        const next = { ...cur, strokes: cur.strokes.map((s) => { const r = results.get(s.id); if (!r || r.contact !== s.contactFrame) return s; const n = { ...s, ballRead: r }; return { ...n, ...applyRules(n, rules, player.hand) }; }) };
        store.saveSession(next);
        return next;
      });
    })();
    return () => { ballRun.current++; setBallBusy(null); };
  }, [session?.strokes, prepared, player, url, rules]);
  // Strokes with a known ball timing get their body-position targets for that timing (also
  // upgrades sessions read before the targets depended on it).
  useEffect(() => {
    if (!session || !player) return;
    let changed = false;
    const strokes = session.strokes.map((s) => {
      if (!strokeStage(s) || s.keyPoints.some((k) => k.stage)) return s;
      const next = { ...s, ...applyRules(s, rules, player.hand) };
      if (!next.keyPoints.some((k) => k.stage)) return s;
      changed = true;
      return next;
    });
    if (changed) save({ ...session, strokes });
  }, [session?.strokes, player, rules]);
  useEffect(() => { if (studio) loadStudioFonts().then(() => draw()); }, [studio, draw]);
  useEffect(() => () => studioScene.current?.dispose(), []);


  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const tick = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const i = timeToFrame(v.currentTime);
    if (playUntil.current !== null && i >= playUntil.current) {
      v.pause();
      playUntil.current = null;
      const next = thenPlay.current;
      thenPlay.current = null;
      if (next) { next(); return; }
    }
    setFrame(i);
    draw();
    if (!v.paused) requestAnimationFrame(tick);
  }, [draw, timeToFrame]);

  /** Redraw once the seeked frame is actually decoded (phones can fire `seeked` before it is). */
  const drawWhenShown = () => {
    const v = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
    v?.requestVideoFrameCallback?.(() => draw());
  };

  const seekFrame = (i: number) => {
    const v = videoRef.current;
    if (!v || !session) return;
    v.pause();
    playUntil.current = null;
    const f = Math.max(0, Math.min(nFrames - 1, i));
    v.currentTime = frameToTime(f);
    setFrame(f);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (timeToFrame(v.currentTime) >= nFrames - 1) v.currentTime = frameToTime(0);
      v.playbackRate = rate;
      v.play()?.catch(() => { /* blocked: nothing to do */ });
    } else v.pause();
  };

  /** Whole stroke at full speed, then the forward swing again at half speed with its path traced. */
  const playPath = (st: Stroke) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = frameToTime(st.startFrame);
    v.playbackRate = 1;
    setRate(1);
    playUntil.current = st.endFrame;
    thenPlay.current = () => {
      v.currentTime = frameToTime(Math.max(st.startFrame, forwardSwingStart(st) - 2));
      v.playbackRate = 0.5;
      setRate(0.5);
      playUntil.current = Math.min(st.endFrame, forwardSwingEnd(st) + 2);
      v.play();
    };
    v.play();
  };

  const playStroke = (st: Stroke) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = frameToTime(st.startFrame);
    v.playbackRate = 0.25;
    setRate(0.25);
    playUntil.current = st.endFrame;
    v.play();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') { seekFrame(frame + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { seekFrame(frame - 1); e.preventDefault(); }
      if (e.key === ' ') { togglePlay(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Phase thumbnails for the selected stroke.
  const thumbKey = (st: Stroke, p: Phase) => `${st.id}:${p.id}:${p.frame}:${st.callouts.filter((c) => c.phaseId === p.id).map((c) => `${c.label}${c.dx}${c.dy}${c.hidden}`).join()}`;
  useEffect(() => {
    if (!stroke || !grabber.current || !prepared || !session || !player) return;
    let cancelled = false;
    const ctx: CardContext = { grabber: grabber.current, session, frames: prepared.frames, player };
    (async () => {
      for (const p of stroke.phases) {
        const key = thumbKey(stroke, p);
        if (thumbs[key]) continue;
        const card = await renderCard(ctx, stroke, p, 240, 300, { header: false });
        if (cancelled) return;
        setThumbs((t) => ({ ...t, [key]: card.toDataURL('image/jpeg', 0.8) }));
      }
    })();
    return () => { cancelled = true; };
  }, [stroke, prepared]);

  if (!session || !player || !prepared) return <div className="loading">Loading session…</div>;

  const cardCtx = (): CardContext => ({ grabber: grabber.current!, session, frames: prepared.frames, player });
  const runExport = async (label: string, fn: (ctx: CardContext, st: Stroke, onP: (p: number) => void) => Promise<unknown>) => {
    if (!stroke || !grabber.current) return;
    setBusy(`${label} 0%`);
    try {
      await fn(cardCtx(), stroke, (p) => setBusy(`${label} ${Math.round(p * 100)}%`));
    } catch (e: any) {
      alert(`Export failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  // Coach edits
  const editKp = (k: KeyPoint, patch: Partial<KeyPoint>) => stroke && updateStroke({ ...stroke, keyPoints: stroke.keyPoints.map((x) => (x.id === k.id ? { ...x, ...patch, edited: true } : x)) });
  const delKp = (k: KeyPoint) => stroke && updateStroke({ ...stroke, keyPoints: stroke.keyPoints.filter((x) => x.id !== k.id) });
  const addKp = (phaseId: Phase['id']) => stroke && updateStroke({ ...stroke, keyPoints: [...stroke.keyPoints, { id: newId('kp'), phaseId, text: 'New key point', status: 'fix', edited: true }] });
  const editCo = (c: Callout, patch: Partial<Callout>, persist = true) => stroke && updateStroke({ ...stroke, callouts: stroke.callouts.map((x) => (x.id === c.id ? { ...x, ...patch, edited: true } : x)) }, persist);
  const delCo = (c: Callout) => stroke && updateStroke({ ...stroke, callouts: stroke.callouts.filter((x) => x.id !== c.id) });
  const addCo = (phaseId: Phase['id']) => {
    if (!stroke) return;
    const c: Callout = { id: newId('co'), phaseId, label: 'New callout', anchor: 'domWrist', status: 'good', dx: 0.15, dy: -0.1, edited: true };
    updateStroke({ ...stroke, callouts: [...stroke.callouts, c] });
    setSelCallout(c.id);
  };

  const canvasPoint = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (placement) { placementTap(e); return; }
    if (!coach) return;
    const p = canvasPoint(e);
    const hit = boxes.current.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (!hit) { setSelCallout(undefined); return; }
    setSelCallout(hit.id);
    drag.current = { id: hit.id, offX: p.x - (hit.x + hit.w / 2), offY: p.y - (hit.y + hit.h / 2), ax: hit.ax, ay: hit.ay };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !stroke) return;
    const p = canvasPoint(e);
    const H = canvasRef.current!.height;
    const c = stroke.callouts.find((x) => x.id === d.id);
    if (c) editCo(c, { dx: (p.x - d.offX - d.ax) / H, dy: (p.y - d.offY - d.ay) / H }, false);
  };
  const onPointerUp = () => {
    if (drag.current && session) store.saveSession(session);
    drag.current = null;
  };

  // Shot placement taps: four court corners while calibrating, otherwise a bounce.
  const placementTap = (e: React.PointerEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const pt = fromCanvas(view, canvasPoint(e));
    if (corners) {
      const next = [...corners, pt];
      if (next.length < 4) { setCorners(next); return; }
      setCorners(null);
      save({ ...session, court: { corners: next, lines: session.court?.lines ?? 'singles' } });
      return;
    }
    if (!session.court) return;
    const st = strokeForBounce(session.strokes, frame, session.fps);
    const b = { id: newId('bo'), frame, u: pt.x, v: pt.y, strokeId: st?.id };
    save({ ...session, bounces: [...(session.bounces ?? []), b].sort((a, b2) => a.frame - b2.frame) });
    setSelBounce(b.id);
  };
  const editBounces = (fn: (bs: NonNullable<Session['bounces']>) => NonNullable<Session['bounces']>) => save({ ...session, bounces: fn(session.bounces ?? []) });

  const shareSession = async () => {
    setBusy('Packing session…');
    try {
      await saveFile(await sessionBundle(session, player), `${slug(player.name)}-${slug(session.title)}.vidrio`, [{ name: 'Vidrio session', extensions: ['vidrio'] }]);
    } catch (e: any) {
      alert(`Share failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };
  const exportCsv = () => saveFile(new Blob([sessionCsv(session, player)], { type: 'text/csv' }), `${slug(player.name)}-${slug(session.title)}.csv`, [{ name: 'CSV', extensions: ['csv'] }]);

  const phaseOf = (pid: Phase['id']) => stroke?.phases.find((p) => p.id === pid);
  /** Clickable timestamp that jumps the video to a phase frame. */
  const stamp = (p: Phase, label?: string) => (
    <button className={`stamp ${phaseHere?.id === p.id ? 'on' : ''}`} title={`Jump to ${p.label} (frame ${p.frame + 1})`} onClick={(e) => { e.stopPropagation(); seekFrame(p.frame); }}>
      <span aria-hidden>▶</span>{fmtStamp(frameToTime(p.frame))}{label && <em>{label}</em>}
    </button>
  );
  const phaseKps = (pid: Phase['id']) => stroke?.keyPoints.filter((k) => k.phaseId === pid) ?? [];
  const phaseCos = (pid: Phase['id']) => stroke?.callouts.filter((c) => c.phaseId === pid) ?? [];
  const insideStroke = stroke && frame >= stroke.startFrame && frame <= stroke.endFrame;

  return (
    <div className="session">
      <div className="session-head">
        <button className="link" onClick={() => go({ name: 'library', playerId: player.id })}>← {player.name}</button>
        <input className="title-input" value={session.title} onChange={(e) => save({ ...session, title: e.target.value }, false)} onBlur={() => store.saveSession(session)} />
        <div className="chips">
          {TAGS.map((t) => (
            <button key={t} className={`chip tag ${session.tags.includes(t) ? 'on' : ''}`} onClick={() => save({ ...session, tags: session.tags.includes(t) ? session.tags.filter((x) => x !== t) : [...session.tags, t] })}>{t}</button>
          ))}
        </div>
        <select className="kind-select" value={session.kind ?? 'rally'} onChange={(e) => save({ ...session, kind: e.target.value as SessionKind })} title="Session type">
          {SESSION_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        {setup && <SetupBadge report={setup} />}
        <div className="spacer" />
        <label className="toggle" title="Tap the court corners once, then tap each bounce for line calls, depth and speed"><input type="checkbox" checked={placement} onChange={(e) => { setPlacement(e.target.checked); if (e.target.checked) { setStudio(false); setProMode(false); setStrikeMode(false); setBdMode(false); } else setCorners(null); }} /> Shot placement</label>
        <label className="toggle" title="3D mannequin under an arena spotlight, with paddle path, eye line, ball flight and weight transfer"><input type="checkbox" checked={studio} onChange={(e) => { setStudio(e.target.checked); if (e.target.checked) { setPlacement(false); setCorners(null); setProMode(false); setBdMode(false); } }} /> Studio look</label>
        <label className="toggle" title="Study how squarely and how hard each groundstroke meets the ball: face for the bounce, drive vs lift for the height, trunk brake, extension"><input type="checkbox" checked={strikeMode} onChange={(e) => { setStrikeMode(e.target.checked); if (e.target.checked) { setPlacement(false); setCorners(null); } }} /> Strike lab</label>
        {ballBusy && <span className="muted small ball-busy">{ballBusy}</span>}
        <label className="toggle" title="Step-by-step 3D breakdown of the selected stroke: coil, forward swing, contact and finish, with angles, distances and timing on the body"><input type="checkbox" checked={bdMode} onChange={(e) => { setBdMode(e.target.checked); if (e.target.checked) { setPlacement(false); setCorners(null); setProMode(false); setStudio(false); bdGo(0, false); } else { bdClock.current.playing = false; setBdPlaying(false); } }} /> Breakdown</label>
        <label className="toggle" title="Overlay the closest pro stroke from your Pro reference players and show the differences"><input type="checkbox" checked={proMode} onChange={(e) => { setProMode(e.target.checked); if (e.target.checked) { setStudio(false); setPlacement(false); setCorners(null); setProRefs(null); setBdMode(false); } }} /> Pro compare</label>
        {studio && (
          <div className="seg" title="Where the 3D camera stands">
            <button className={studioView === 'footage' ? 'on' : ''} onClick={() => setStudioView('footage')}>As filmed</button>
            <button className={studioView === 'coach' ? 'on' : ''} onClick={() => setStudioView('coach')}>On court</button>
          </div>
        )}
        {studio && (
          <div className="seg" title="How the 3D player looks">
            <button className={figure === 'mannequin' ? 'on' : ''} onClick={() => setFigure('mannequin')} title="3D clay athlete (body: Quaternius Universal Base Characters, CC0)">Mannequin</button>
            <button className={figure === 'athlete' ? 'on' : ''} onClick={() => setFigure('athlete')}>Player</button>
          </div>
        )}
        <label className="toggle"><input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /> Coach editing</label>
        <div className="export">
          {busy ? <span className="muted">{busy}</span> : (
            <>
              <button disabled={!stroke} onClick={() => runExport('Images', exportCarousel)}>Export images</button>
              <button disabled={!stroke} onClick={() => runExport('PDF', exportPdf)}>PDF report</button>
              {canExportVideo() && <button disabled={!stroke} onClick={() => runExport('Video', exportVideo)}>Vertical video</button>}
              {canExportVideo() && <button className="primary" disabled={!stroke} onClick={() => runExport('Studio video', exportStudioVideo)}>Studio video</button>}
              <button onClick={exportCsv} title="Every stroke metric, key point and bounce as a spreadsheet">Data (CSV)</button>
              <button onClick={shareSession} title="One .vidrio file with the video and the analysis, to open in another Vidrio">Share session</button>
            </>
          )}
        </div>
      </div>

      <div className="session-body">
        <aside className="stroke-list">
          <h3>Strokes</h3>
          {session.strokes.length === 0 && <p className="muted small">No swings were detected. Scrub to a contact and use the button below to mark one by hand.</p>}
          {session.strokes.map((s, i) => {
            const fix = topFix(s);
            return (
              <button key={s.id} className={`stroke-item ${s.id === strokeId ? 'selected' : ''}`} onClick={() => { setStrokeId(s.id); seekFrame(s.phases[0]?.frame ?? s.startFrame); }}>
                <span className="n">{i + 1}</span>
                <span>
                  <strong>{STROKE_LABEL[s.type]}{s.spin ? ` · ${s.spin}` : ''}</strong>
                  <small>{fmtTime(frameToTime(s.contactFrame))}</small>
                  {fix ? <em className="fix">{fix.text}</em> : <em className="good">No fixes flagged</em>}
                </span>
              </button>
            );
          })}
          <button className="mark" onClick={() => { const st = strokeAt(prepared, frame, rules); updateStroke(st); setStrokeId(st.id); }}>
            + Mark contact at {fmtTime(frameToTime(frame))}
          </button>
          <label className="notes">Session notes
            <textarea value={session.notes} onChange={(e) => save({ ...session, notes: e.target.value }, false)} onBlur={() => store.saveSession(session)} placeholder="Conditions, goals for the session…" />
          </label>
        </aside>

        <section className="stage">
          <div className="canvas-wrap" style={{ aspectRatio: `${session.width} / ${session.height}` }}>
            <canvas
              ref={canvasRef}
              className={placement ? 'placing' : coach ? 'editing' : ''}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
            {phaseHere && stroke && !studio && !proMode && !bdMode && !cardsOn && (
              <div className="phase-badge"><span>{phaseHere.index}</span>{phaseHere.label}</div>
            )}
            {url && (
              <video
                ref={videoRef}
                src={url}
                muted
                playsInline
                preload="auto"
                className="hidden-video"
                onLoadedMetadata={(e) => primeForPhone(e.currentTarget, () => seekFrame(stroke?.phases[0]?.frame ?? 0))}
                onLoadedData={() => draw()}
                onCanPlay={() => draw()}
                onSeeked={() => { draw(); drawWhenShown(); }}
                onPlay={() => { setPlaying(true); requestAnimationFrame(tick); }}
                onPause={() => { setPlaying(false); setFrame(timeToFrame(videoRef.current!.currentTime)); draw(); }}
              />
            )}
          </div>

          <div className="controls">
            <button onClick={() => seekFrame(frame - 1)} title="Previous frame (←)">‹</button>
            <button className="play" onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => seekFrame(frame + 1)} title="Next frame (→)">›</button>
            <div className="seg">
              {[1, 0.5, 0.25].map((r) => (
                <button key={r} className={rate === r ? 'on' : ''} onClick={() => { setRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }}>{r === 1 ? '1×' : r === 0.5 ? '½×' : '¼×'}</button>
              ))}
            </div>
            {stroke && <button onClick={() => playStroke(stroke)}>Play stroke in slow motion</button>}
            {stroke && <button onClick={() => playPath(stroke)} title="Full speed, then the forward swing at half speed">Swing path replay</button>}
            <span className="time">{fmtStamp(frameToTime(frame))} · frame {frame + 1}/{nFrames}</span>
          </div>

          <div className="scrubber">
            <div className="marks">
              {session.strokes.map((s) => (
                <div key={s.id} className={`mark-band ${s.id === strokeId ? 'on' : ''}`} style={{ left: `${(s.startFrame / nFrames) * 100}%`, width: `${((s.endFrame - s.startFrame) / nFrames) * 100}%` }} onClick={() => setStrokeId(s.id)} />
              ))}
              {stroke?.phases.map((p) => <div key={p.id} className="tick" style={{ left: `${(p.frame / nFrames) * 100}%` }} title={p.label} />)}
            </div>
            <input type="range" min={0} max={nFrames - 1} value={frame} onChange={(e) => seekFrame(+e.target.value)} />
          </div>

          {stroke && (
            <div className="phase-cards">
              {stroke.phases.map((p) => {
                const fix = phaseKps(p.id).some((k) => k.status === 'fix');
                const src = thumbs[thumbKey(stroke, p)];
                return (
                  <button key={p.id} className={`phase-card ${phaseHere?.id === p.id ? 'on' : ''}`} onClick={() => seekFrame(p.frame)}>
                    <div className="thumb">{src ? <img src={src} alt="" /> : <div className="ph" />}<span className="tc">{fmtStamp(frameToTime(p.frame))}</span></div>
                    <div className="cap"><span className="num">{p.index}</span>{p.label}<i className={fix ? 'dot fix' : 'dot good'} /></div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="side">
          {placement ? (
            <CourtPanel
              session={session}
              bounces={placed}
              calibrating={corners ? corners.length : null}
              selected={selBounce}
              onSelect={setSelBounce}
              onCalibrate={() => { videoRef.current?.pause(); setCorners([]); }}
              onCancelCalibrate={() => setCorners(null)}
              onLines={(l: Lines) => save({ ...session, court: { ...session.court!, lines: l } })}
              onDelete={(bid) => editBounces((bs) => bs.filter((b) => b.id !== bid))}
              onToggleServe={(bid, serve) => editBounces((bs) => bs.map((b) => (b.id === bid ? { ...b, serve } : b)))}
              onSeek={seekFrame}
            />
          ) : !stroke ? <p className="muted">Select a stroke.</p> : (
            <>
              <div className="stroke-head">
                <select value={stroke.type} onChange={(e) => updateStroke(retypeStroke(prepared, stroke, e.target.value as StrokeType, rules))}>
                  {STROKE_TYPES.map((t) => <option key={t} value={t}>{STROKE_LABEL[t]}</option>)}
                </select>
                <button onClick={() => go({ name: 'compare', playerId: player.id, strokeId: stroke.id })}>Compare</button>
              </div>
              <div className="readout">
                <div className="label">Telemetry readout <i>|</i> <b>Stroke {session.strokes.indexOf(stroke) + 1}</b></div>
                <dl>
                  <dt>Type</dt><dd className="a">{STROKE_LABEL[stroke.type]}{stroke.spin ? ` · ${stroke.spin}` : ''}</dd>
                  <dt>Contact</dt><dd>{fmtTime(frameToTime(stroke.contactFrame))}</dd>
                  <dt>Duration</dt><dd>{((stroke.endFrame - stroke.startFrame) / session.fps).toFixed(2)} s</dd>
                  {Number.isFinite(stroke.peakSpeed) && <><dt>Peak hand speed</dt><dd className="v">{stroke.peakSpeed.toFixed(1)} m/s</dd></>}
                  <dt>Key points on target</dt><dd className="t">{stroke.keyPoints.filter((k) => k.status === 'good').length}</dd>
                  <dt>Fixes</dt><dd className="r">{stroke.keyPoints.filter((k) => k.status === 'fix').length}</dd>
                </dl>
                <div className="cycle" aria-label="Phase cycle">
                  {stroke.phases.map((p) => {
                    const fix = phaseKps(p.id).some((k) => k.status === 'fix');
                    const here = phaseHere?.id === p.id;
                    return (
                      <div key={p.id} className={here ? 'here' : fix ? 'fix' : 'good'} onClick={() => seekFrame(p.frame)}>
                        <span>{String(p.index).padStart(2, '0')}</span>{p.label}<small className="ts">{fmtStamp(frameToTime(p.frame))}</small><i />
                        <em>{here ? 'Live' : fix ? 'Fix' : 'Done'}</em>
                      </div>
                    );
                  })}
                </div>
              </div>

              {proMode && (() => {
                const inside = frame >= stroke.startFrame && frame <= stroke.endFrame;
                const o = proMatch && inside ? proOverlay({ frames: prepared.frames, stroke, hand: player.hand }, proMatch.ref, frame, session.width, session.height) : null;
                const uw = inside ? prepared.frames[frame]?.world ?? null : null;
                return (
                  <ProComparePanel stroke={stroke} fps={session.fps} hand={player.hand} matches={proMatches} selected={proMatches.find((m) => m.ref.key === proKey)}
                    onSelect={setProKey} userWorld={uw && o ? uw : null} proWorld={o?.world ?? null} loading={!proRefs} />
                );
              })()}
              {bdMode && (
                <BreakdownPanel breakdown={breakdown} step={bdStep} playing={bdPlaying}
                  onStep={(k) => bdGo(k, false)}
                  onPlay={() => (bdPlaying ? (bdClock.current.playing = false, setBdPlaying(false), draw()) : bdGo(bdStep >= 3 ? 0 : bdStep, true))}
                  exporting={busy}
                  onExport={canExportVideo() && breakdown ? () => runExport('Breakdown video', (c, st, onP) => exportBreakdownVideo(c, st, breakdown, onP)) : undefined} />
              )}
              {strikeMode && (
                <StrikeCardsBar cards={cards} card={cardK} onCard={showCard} busy={busy}
                  onSaveOne={() => cards && cardK !== null && breakdown && runExport('Image', (c, st) => exportStrikeImage(c, st, breakdown, cards, cards[cardK]))}
                  onSaveAll={() => cards && breakdown && runExport('Images', (c, st, onP) => exportStrikeImages(c, st, breakdown, cards, onP))}
                  onPdf={() => cards && breakdown && runExport('PDF', (c, st, onP) => exportStrikePdf(c, st, breakdown, cards, { score: strikeNow?.score, headline: strikeNow?.headline }, onP))}
                  onVideo={canExportVideo() ? () => cards && breakdown && runExport('Video', (c, st, onP) => exportStrikeVideo(c, st, breakdown, cards, onP)) : undefined} />
              )}
              {strikeMode && (
                <StrikePanel session={session} prepared={prepared} stroke={stroke} hand={player.hand} busy={ballBusy} onStroke={(st) => updateStroke({ ...st, ...applyRules(st, rules, player.hand) })}
                  onSelect={(sid, f) => { setStrokeId(sid); seekFrame(f); }} />
              )}
              <FocusCard stroke={stroke} />
              <ContactReading stroke={stroke} rules={rules} hand={player.hand} />
              <PowerSequence prepared={prepared} stroke={stroke} frame={frame} onSeek={seekFrame} />

              {coach && insideStroke && !phaseHere && (
                <div className="move-phase">
                  <span>Move a phase to this frame:</span>
                  <div className="chips">
                    {stroke.phases.map((p) => <button key={p.id} className="chip" onClick={() => updateStroke(movePhase(prepared, stroke, p.id, frame, rules))}>{p.index} {p.label}</button>)}
                  </div>
                </div>
              )}

              {(phaseHere ? [phaseHere] : stroke.phases).map((p) => (
                <div key={p.id} className="phase-block">
                  <h4><span className="num">{p.index}</span>{p.label}{stamp(p)}</h4>
                  <ul className="kps">
                    {phaseKps(p.id).map((k) => (
                      <li key={k.id} className={k.status}>
                        {coach ? (
                          <div className="kp-edit">
                            <textarea value={k.text} onChange={(e) => editKp(k, { text: e.target.value })} rows={2} />
                            <div className="row">
                              <select value={k.status} onChange={(e) => editKp(k, { status: e.target.value as KeyPoint['status'] })}>
                                <option value="good">Good</option><option value="fix">Fix</option><option value="info">Note</option>
                              </select>
                              <button className="link danger" onClick={() => delKp(k)}>Remove</button>
                            </div>
                          </div>
                        ) : <p>{k.text}</p>}
                        {k.status === 'fix' && (() => {
                          const tp = topicFor(k.ruleId, k.metric, stroke.type);
                          return tp ? (
                            <button className="drills-btn" title={`On-court and off-court drills for "${tp.title}"`}
                              onClick={() => { videoRef.current?.pause(); go({ name: 'drills', topic: tp.id, stroke: stroke.type, hand: player.hand, back: { name: 'session', id } }); }}>
                              Drills
                            </button>
                          ) : null;
                        })()}
                        {k.metric && k.value !== undefined && (
                          <small>
                            {METRIC_INFO[k.metric].label} {formatMetric(k.metric, k.value)}
                            {(k.min !== undefined || k.max !== undefined) && ` · target ${k.min !== undefined ? formatMetric(k.metric, k.min) : ''}${k.min !== undefined && k.max !== undefined ? '–' : k.min !== undefined ? '+' : 'up to '}${k.max !== undefined ? formatMetric(k.metric, k.max) : ''}${k.stage ? ` (${k.stage} ball)` : ''}`}
                          </small>
                        )}
                        {phaseOf(k.phaseId) && <div className="kp-at">{stamp(phaseOf(k.phaseId)!, `at ${phaseOf(k.phaseId)!.label}`)}</div>}
                      </li>
                    ))}
                    {phaseKps(p.id).length === 0 && <li className="info"><p className="muted">No key points for this phase.</p></li>}
                  </ul>
                  {coach && <button className="link" onClick={() => addKp(p.id)}>+ Add key point</button>}
                  {coach && phaseHere && (
                    <div className="callouts">
                      <h5>Callouts on the video <small className="muted">drag labels to move them</small></h5>
                      {phaseCos(p.id).map((c) => (
                        <div key={c.id} className={`co-row ${selCallout === c.id ? 'sel' : ''}`} onClick={() => setSelCallout(c.id)}>
                          <input value={c.label} onChange={(e) => editCo(c, { label: e.target.value })} />
                          <select value={c.anchor} onChange={(e) => editCo(c, { anchor: e.target.value as AnchorJoint })}>
                            {ANCHORS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                          </select>
                          <select value={c.status} onChange={(e) => editCo(c, { status: e.target.value as Callout['status'] })}>
                            <option value="good">Amber</option><option value="fix">Rose</option>
                          </select>
                          <button className="link" onClick={() => editCo(c, { hidden: !c.hidden })}>{c.hidden ? 'Show' : 'Hide'}</button>
                          <button className="link danger" onClick={() => delCo(c)}>✕</button>
                        </div>
                      ))}
                      <button className="link" onClick={() => addCo(p.id)}>+ Add callout</button>
                    </div>
                  )}
                </div>
              ))}

              <label className="notes">Coach notes for this stroke
                <textarea value={stroke.note ?? ''} onChange={(e) => updateStroke({ ...stroke, note: e.target.value }, false)} onBlur={() => store.saveSession(session)} placeholder="What to practise next…" />
              </label>
              {coach && (
                <button className="link danger" onClick={() => { if (confirm('Delete this stroke?')) { save({ ...session, strokes: session.strokes.filter((s) => s.id !== stroke.id) }); setStrokeId(undefined); } }}>Delete stroke</button>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
