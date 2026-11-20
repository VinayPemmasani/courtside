import { useEffect, useMemo, useRef, useState } from 'react';
import type { Handedness, StrokeType } from '../core';
import { StudioScene } from '../render/scene3d';
import { useApp, type Route } from '../App';
import { drillsFor, STROKE_NAME, TOPICS, type DrillStroke, type Topic } from '../drills/catalog';
import { DrillPlayer } from '../drills/play';
import { exportDrillVideo, renderCollage, saveCollage } from '../drills/media';
import { canExportVideo } from '../render/export';
import { BodyPanel, DailyLinks, LifePage, type OpenDrill } from './LifeLinks';

const SPEEDS = [1, 0.5, 0.25];

/**
 * Drills for each technique fix: on-court drills and off-court exercises, each shown on the 3D
 * mannequin (play, slow down, turn the camera) with a collage of the rep's key positions.
 */
export function DrillsView({ topic: topicId, stroke: strokeIn, hand: handIn, back }: { topic?: string; stroke?: StrokeType; hand?: Handedness; back?: Route }) {
  const { go } = useApp();
  const [topicIdState, setTopic] = useState(topicId ?? TOPICS[0].id);
  const topic = TOPICS.find((t) => t.id === topicIdState) ?? TOPICS[0];
  const [strokeSel, setStroke] = useState<StrokeType | undefined>(strokeIn);
  const [hand, setHand] = useState<Handedness>(handIn ?? 'right');
  const list = useMemo(() => drillsFor(topic, strokeSel), [topic, strokeSel]);
  const [where, setWhere] = useState<'on-court' | 'off-court'>('on-court');
  const shown = list.filter((x) => x.drill.where === where);
  const [drillId, setDrillId] = useState<string | undefined>();
  const [life, setLife] = useState(false);
  const cur = shown.find((x) => x.drill.id === drillId) ?? shown[0] ?? list[0];

  // Keep the drill tab valid when the topic changes.
  useEffect(() => {
    if (!list.some((x) => x.drill.where === where)) setWhere(where === 'on-court' ? 'off-court' : 'on-court');
  }, [list, where]);

  /** Jump to a fix (and one of its drills), choosing a stroke the drill is shown for. */
  const open: OpenDrill = (tid, did) => {
    const t = TOPICS.find((x) => x.id === tid);
    if (!t) return;
    const d = did ? t.drills.find((x) => x.id === did) : undefined;
    const ok = (d?.strokes ?? t.strokes) as string[];
    if (!strokeSel || !ok.includes(strokeSel)) setStroke(ok[0] as StrokeType);
    setTopic(tid);
    setWhere(d?.where ?? 'on-court');
    setDrillId(did);
    setLife(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="drills-page">
      <aside className="drill-topics">
        {back && <button className="link back" onClick={() => go(back)}>← Back to the session</button>}
        <button className={`topic life ${life ? 'on' : ''}`} onClick={() => setLife(true)}>
          <strong>Everyday &amp; cross-training</strong>
          <small>Stairs, yoga, rowing, swimming…</small>
        </button>
        <h3>Technique fixes</h3>
        {TOPICS.map((t) => (
          <button key={t.id} className={`topic ${!life && t.id === topic.id ? 'on' : ''}`} onClick={() => { setTopic(t.id); setDrillId(undefined); setLife(false); }}>
            <strong>{t.title}</strong>
            <small>{t.drills.length} drills · {t.strokes.length > 1 ? 'all strokes' : STROKE_NAME[t.strokes[0]]}</small>
          </button>
        ))}
        <p className="muted small">Drills follow common coaching practice; each fix lists its references.</p>
      </aside>

      {life ? <section className="drill-main"><LifePage open={open} /></section> : <section className="drill-main">
        <header className="drill-head">
          <div className="label">Drills for the fix <i>|</i> <b className="r">{topic.title}</b></div>
          <p>{topic.why}</p>
          <div className="drill-opts">
            {topic.strokes.length > 1 && (
              <div className="seg">
                {topic.strokes.map((s) => (
                  <button key={s} className={(strokeSel ?? topic.strokes[0]) === s ? 'on' : ''} onClick={() => setStroke(s)}>{STROKE_NAME[s]}</button>
                ))}
              </div>
            )}
            <div className="seg">
              {(['right', 'left'] as const).map((h) => <button key={h} className={hand === h ? 'on' : ''} onClick={() => setHand(h)}>{h === 'right' ? 'Right-handed' : 'Left-handed'}</button>)}
            </div>
          </div>
          <div className="drill-tabs">
            {(['on-court', 'off-court'] as const).map((w) => {
              const n = list.filter((x) => x.drill.where === w).length;
              return <button key={w} disabled={!n} className={where === w ? 'on' : ''} onClick={() => { setWhere(w); setDrillId(undefined); }}>{w === 'on-court' ? 'At the table' : 'Away from the table'} <small>{n}</small></button>;
            })}
          </div>
          <div className="drill-cards">
            {shown.map(({ drill }, i) => (
              <button key={drill.id} className={`drill-card ${cur?.drill.id === drill.id ? 'on' : ''}`} onClick={() => setDrillId(drill.id)}>
                <span className="num">{i + 1}</span>
                <span><strong>{drill.title}</strong><small>{drill.dose}</small></span>
              </button>
            ))}
          </div>
        </header>
        {cur && <DrillDetail key={`${topic.id}/${cur.drill.id}/${cur.stroke}/${hand}`} topic={topic} index={list.indexOf(cur)} drill={cur.drill} stroke={cur.stroke} hand={hand} open={open} />}
      </section>}
    </div>
  );
}

function DrillDetail({ topic, drill, stroke, hand, open }: { topic: Topic; index: number; drill: Topic['drills'][number]; stroke: DrillStroke; hand: Handedness; open: OpenDrill }) {
  const motion = useMemo(() => drill.motion(stroke), [drill, stroke]);
  const wrap = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const playerRef = useRef<DrillPlayer | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cam, setCam] = useState(drill.cam);
  const [orbit, setOrbit] = useState(false);
  const [t, setT] = useState(0);
  const [collage, setCollage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const state = useRef({ t: 0, playing: true, speed: 1, cam: drill.cam, orbit: false, drag: null as null | { x: number; cam: number } });
  state.current.playing = playing;
  state.current.speed = speed;
  state.current.cam = cam;
  state.current.orbit = orbit;

  // The live 3D player.
  useEffect(() => {
    const el = wrap.current!;
    const w = Math.round(Math.min(720, el.clientWidth || 480) * Math.min(1.25, window.devicePixelRatio || 1));
    const h = Math.round(w * 1.2);
    const scene = new StudioScene(w, h);
    sceneRef.current = scene;
    scene.canvas.className = 'drill-canvas';
    el.prepend(scene.canvas);
    const player = new DrillPlayer(scene, motion, hand);
    playerRef.current = player;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const s = state.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (s.playing) s.t = (s.t + dt * s.speed) % player.duration;
      if (s.orbit) s.cam += dt * 18;
      player.render(s.t, { yaw: s.cam }, { fast: true });
      if (now - lastUi > 120) { setT(s.t); lastUi = now; }
      raf = requestAnimationFrame(loop);
    };
    scene.ready.then(() => { raf = requestAnimationFrame(loop); });
    return () => { cancelAnimationFrame(raf); scene.canvas.remove(); scene.dispose(); };
  }, [motion, hand]);

  // The collage of key positions.
  useEffect(() => {
    let live = true;
    setCollage(null);
    renderCollage(drill, motion, hand, drill.cam).then((c) => live && setCollage(c.toDataURL('image/jpeg', 0.86))).catch(() => undefined);
    return () => { live = false; };
  }, [drill, motion, hand]);

  const seek = (v: number) => { state.current.t = v; setT(v); };
  const run = async (label: string, f: (p: (x: number) => void) => Promise<unknown>) => {
    setBusy(`${label}…`);
    try { await f((p) => setBusy(`${label} ${Math.round(p * 100)}%`)); } finally { setBusy(null); }
  };
  const onDown = (e: React.PointerEvent) => { state.current.drag = { x: e.clientX, cam: state.current.cam }; (e.target as Element).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    const d = state.current.drag;
    if (!d) return;
    setOrbit(false);
    setCam(d.cam - (e.clientX - d.x) * 0.5);
  };
  const onUp = () => { state.current.drag = null; };
  const stillHere = [...motion.stills].reverse().find((s) => t >= s.t - 0.05);

  return (
    <div className="drill-detail">
      <div className="drill-stage">
        <div className="drill-view" ref={wrap} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
          <div className="drill-badge"><span>{drill.where === 'on-court' ? 'At the table' : 'Away from the table'}</span>{stillHere?.label}</div>
        </div>
        <div className="controls">
          <button className="play" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
          <div className="seg">
            {SPEEDS.map((r) => <button key={r} className={speed === r ? 'on' : ''} onClick={() => setSpeed(r)}>{r === 1 ? '1×' : r === 0.5 ? '½×' : '¼×'}</button>)}
          </div>
          <div className="seg">
            {[['Behind', 0], ['Side', drill.cam], ['Front', 180]].map(([l, y]) => (
              <button key={l as string} className={!orbit && Math.abs(((cam - (y as number)) % 360 + 360) % 360) < 1 ? 'on' : ''} onClick={() => { setOrbit(false); setCam(y as number); }}>{l}</button>
            ))}
            <button className={orbit ? 'on' : ''} onClick={() => setOrbit(!orbit)} title="Circle the player">Orbit</button>
          </div>
        </div>
        <div className="scrubber">
          <div className="marks">
            {motion.stills.map((s, i) => <div key={i} className="tick" style={{ left: `${(s.t / motion.duration) * 100}%` }} title={s.label} />)}
          </div>
          <input type="range" min={0} max={motion.duration} step={0.01} value={t} onChange={(e) => { setPlaying(false); seek(+e.target.value); }} />
        </div>
        <div className="drill-positions">
          {motion.stills.map((s, i) => (
            <button key={i} onClick={() => { setPlaying(false); seek(s.t); }}><span className="num">{i + 1}</span>{s.label}</button>
          ))}
        </div>
        <p className="muted small">Drag the figure to turn the camera.</p>
      </div>

      <div className="drill-info">
        <h2>{drill.title}</h2>
        <dl>
          <dt>Where</dt><dd>{drill.where === 'on-court' ? 'At the table' : 'Away from the table'}</dd>
          <dt>You need</dt><dd>{drill.kit}</dd>
          <dt>Dose</dt><dd className="a">{drill.dose}</dd>
          <dt>Shown for</dt><dd>{STROKE_NAME[stroke]}, {hand}-handed</dd>
        </dl>
        <ol className="drill-steps">{drill.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <div className="cue good"><b>Feel</b>{drill.cue}</div>
        <div className="cue fix"><b>Avoid</b>{drill.avoid}</div>
        <div className="drill-actions">
          <button disabled={!!busy} onClick={() => run('Saving collage', () => saveCollage(drill, topic, motion, hand, cam))}>Save collage</button>
          {canExportVideo() && <button className="primary" disabled={!!busy} onClick={() => run('Making video', (p) => exportDrillVideo(drill, topic, stroke, motion, hand, cam, p))}>Save video</button>}
          {busy && <span className="muted small">{busy}</span>}
        </div>
        <div className="drill-sources">
          <h5>References for this fix</h5>
          <ul>{topic.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
        </div>
      </div>

      <div className="drill-wide">
        <BodyPanel topic={topic} />
        <DailyLinks topic={topic} drill={drill} open={open} />
      </div>

      <div className="drill-collage">
        <h4>Key positions <small className="muted">one rep, step by step</small></h4>
        {collage ? <img src={collage} alt={`${drill.title}: key positions`} /> : <div className="ph">Rendering the positions…</div>}
      </div>
    </div>
  );
}
