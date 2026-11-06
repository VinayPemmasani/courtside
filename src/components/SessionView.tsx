import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import {
  checkSetup, formatMetric, METRIC_INFO, movePhase, strokeForBounce, type Lines, type Vec2, newId, prepare, retypeStroke, shareAt, strokeAt, topFix, weightTransfer,
  type AnchorJoint, type Callout, type KeyPoint, type Phase, type Stroke, type StrokeType,
} from '../core';
import { STROKE_LABEL, STROKE_TYPES, fmtStamp, fmtTime } from '../labels';
import { SESSION_KINDS, store, TAGS, type Player, type Session, type SessionKind } from '../storage/db';
import { placeBounces, sessionBundle, sessionCsv } from '../storage/share';
import { saveFile, slug } from '../render/files';
import { drawCourtOverlay, fromCanvas } from '../render/court';
import { CourtPanel } from './CourtPanel';
import { SetupBadge } from './FilmingGuide';
import { drawCallouts, drawSkeleton, drawTrail, drawVideo, fullCrop, type LabelBox, type View } from '../render/overlay';
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
  const [placement, setPlacement] = useState(false);
  const [corners, setCorners] = useState<Vec2[] | null>(null);
  const [selBounce, setSelBounce] = useState<string>();
  const viewRef = useRef<View>();
  const studioScene = useRef<StudioScene>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<LabelBox[]>([]);
  const drag = useRef<{ id: string; offX: number; offY: number; ax: number; ay: number } | null>(null);
  const playUntil = useRef<number | null>(null);
  const grabber = useRef<FrameGrabber>();

  useEffect(() => {
    let objectUrl: string | undefined;
    (async () => {
      const s = await store.session(id);
      if (!s) return;
      const ps = await store.players();
      const blob = await store.video(id);
      setPlayer(ps.find((p) => p.id === s.playerId));
      setSession(s);
      setStrokeId(s.strokes[0]?.id);
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        grabber.current = new FrameGrabber(objectUrl);
        setUrl(objectUrl);
      }
    })();
    return () => {
      grabber.current?.dispose();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const prepared = useMemo(() => (session && player ? prepare(session.frames, session.fps, player.hand) : null), [session?.frames, player]);
  const stroke = session?.strokes.find((s) => s.id === strokeId);
  const placed = useMemo(() => (session && prepared ? placeBounces(session, prepared.frames) : []), [session, prepared]);
  const setup = useMemo(() => (session ? checkSetup(session.frames, session.fps, session.width / (session.height || 1)) : null), [session?.frames]);
  const phaseHere = stroke?.phases.find((p) => p.frame === frame);
  const nFrames = session?.frames.length ?? 0;

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
  const latest = useRef({ session, prepared, stroke, player, coach, selCallout, studio, placement, corners, placed, selBounce });
  latest.current = { session, prepared, stroke, player, coach, selCallout, studio, placement, corners, placed, selBounce };

  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    const { session: s, prepared: p, stroke: st, player: pl, selCallout: sel, studio: look, placement: court, corners: pending, placed: bounces, selBounce: selB } = latest.current;
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
    if (look) {
      // 3D studio preview; callouts on a paused phase frame show as rings and pinned labels.
      studioScene.current ??= new StudioScene(W, H);
      const ph = inStroke && v.paused ? inStroke.phases.find((x) => x.frame === i) : undefined;
      const weight = inStroke ? weightTransfer(p.frames, inStroke, pl.hand) : null;
      renderStudio({ ctx: view.ctx, W, H }, studioScene.current, { frames: p.frames, i, fps: s.fps, hand: pl.hand, stroke: inStroke, weight }, {
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
    }
    boxes.current = [];
    if (inStroke && v.paused) {
      const ph = inStroke.phases.find((x) => x.frame === i);
      if (ph) boxes.current = drawCallouts(view, p.frames[i], inStroke.callouts.filter((x) => x.phaseId === ph.id), pl.hand, sel);
    }
  }, []);

  useEffect(() => { draw(); }, [draw, session, frame, coach, selCallout, prepared, studio, placement, corners, placed, selBounce]);
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
    }
    setFrame(i);
    draw();
    if (!v.paused) requestAnimationFrame(tick);
  }, [draw, timeToFrame]);

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
      v.play();
    } else v.pause();
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
      await saveFile(await sessionBundle(session, player), `${slug(player.name)}-${slug(session.title)}.courtside`, [{ name: 'Courtside session', extensions: ['courtside'] }]);
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
        <label className="toggle" title="Tap the court corners once, then tap each bounce for line calls, depth and speed"><input type="checkbox" checked={placement} onChange={(e) => { setPlacement(e.target.checked); if (e.target.checked) setStudio(false); else setCorners(null); }} /> Shot placement</label>
        <label className="toggle" title="3D mannequin on a virtual court, with racket path, ball flight and weight transfer"><input type="checkbox" checked={studio} onChange={(e) => { setStudio(e.target.checked); if (e.target.checked) { setPlacement(false); setCorners(null); } }} /> Studio look</label>
        <label className="toggle"><input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} /> Coach editing</label>
        <div className="export">
          {busy ? <span className="muted">{busy}</span> : (
            <>
              <button disabled={!stroke} onClick={() => runExport('Images', exportCarousel)}>Export images</button>
              <button disabled={!stroke} onClick={() => runExport('PDF', exportPdf)}>PDF report</button>
              {canExportVideo() && <button disabled={!stroke} onClick={() => runExport('Video', exportVideo)}>Vertical video</button>}
              {canExportVideo() && <button className="primary" disabled={!stroke} onClick={() => runExport('Studio video', exportStudioVideo)}>Studio video</button>}
              <button onClick={exportCsv} title="Every stroke metric, key point and bounce as a spreadsheet">Data (CSV)</button>
              <button onClick={shareSession} title="One .courtside file with the video and the analysis, to open in another Courtside">Share session</button>
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
                  <strong>{STROKE_LABEL[s.type]}</strong>
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
            {phaseHere && stroke && !studio && (
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
                onLoadedData={() => seekFrame(stroke?.phases[0]?.frame ?? 0)}
                onSeeked={() => draw()}
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
                  <dt>Type</dt><dd className="a">{STROKE_LABEL[stroke.type]}</dd>
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
                        {k.metric && k.value !== undefined && (
                          <small>
                            {METRIC_INFO[k.metric].label} {formatMetric(k.metric, k.value)}
                            {(k.min !== undefined || k.max !== undefined) && ` · target ${k.min !== undefined ? formatMetric(k.metric, k.min) : ''}${k.min !== undefined && k.max !== undefined ? '–' : k.min !== undefined ? '+' : 'up to '}${k.max !== undefined ? formatMetric(k.metric, k.max) : ''}`}
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
