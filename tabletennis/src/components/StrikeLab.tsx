import { useMemo, useState } from 'react';
import {
  analyseStrike, ballPathAngle, DEFAULT_RULES, formatMetric, METRIC_INFO, PHASE_LABEL, ruleForStage, type KeyPoint, type PhaseId, type Rule, type StrokeType, BRAKE_MIN, BRUSH_FACE, BRUSH_PATH, BRUSH_PATH_ANY, courtMap, driveShare, DRIVE_TARGET, EXTENSION_MIN, FACE_TARGET, heightBand, NET_STRAP,
  strikeApplies, strikeSummary, type BounceStage, type Handedness, type Height, type Strike, type StrikeCard, type Stroke,
} from '../core';
import type { Prepared } from '../core/analyze';
import type { Session } from '../storage/db';
import { useApp } from '../App';
import { fmtTime } from '../labels';

const STAGES: { id: BounceStage; label: string }[] = [
  { id: 'rising', label: 'Rising' },
  { id: 'peak', label: 'Peak' },
  { id: 'falling', label: 'Falling' },
];
const HEIGHT_WORD: Record<Height, string> = { low: 'below the net strap', net: 'at net height', high: 'above the net' };
const fmtFace = (v: number) => (Math.abs(v) < 0.5 ? 'vertical' : v > 0 ? `${Math.round(v)}° closed` : `${Math.round(-v)}° open`);
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Side view of the strike, net to the right: the incoming ball for the bounce stage, the net strap,
 * the racket face as measured (amber) against the face that meets the ball square on (dashed teal),
 * and the swing path through contact (violet).
 */
export function StrikeDiagram({ stage, height, face, path, compact }: { stage: BounceStage; height?: number; face?: number; path?: number; compact?: boolean }) {
  const W = 320, H = compact ? 180 : 220;
  const m = { l: 18, r: 14, t: 12, b: 22 };
  const xMax = 2.6, yMax = 1.8;
  const X = (x: number) => m.l + (x / xMax) * (W - m.l - m.r);
  const Y = (y: number) => H - m.b - (y / yMax) * (H - m.t - m.b);
  const h = Math.max(0.15, Math.min(1.7, height ?? 0.9));
  const cx = 0.9;
  // Incoming ball: a parabola that reaches the contact point travelling at the stage's angle.
  const a = rad(ballPathAngle(stage));
  const pts: string[] = [];
  const g = 1.6; // curvature, only for the look
  const slope = -Math.tan(a); // dy/dx along +x (toward the net) for a ball moving left at angle a
  for (let k = 0; k <= 24; k++) {
    const x = cx + (k / 24) * 1.6;
    const dx = x - cx;
    const y = h + slope * dx - g * 0.5 * dx * dx * (stage === 'rising' ? -0.6 : 0.35);
    if (y < 0.02) break;
    pts.push(`${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
  }
  const seg = (tilt: number, len = 0.34) => {
    // Closed (+) leans the top of the frame toward the net.
    const dx = Math.sin(rad(tilt)) * len, dy = Math.cos(rad(tilt)) * len;
    return { x1: X(cx - dx / 2), y1: Y(h - dy / 2), x2: X(cx + dx / 2), y2: Y(h + dy / 2) };
  };
  const target = FACE_TARGET[stage].centre;
  const p = path !== undefined ? rad(path) : undefined;
  return (
    <svg className="strike-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Side view: ${stage} ball, contact ${h.toFixed(2)} m high`}>
      <defs>
        <marker id="sd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="var(--violet)" /></marker>
        <marker id="sd-ball" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#d8f25a" /></marker>
      </defs>
      <line x1={X(0)} x2={X(xMax)} y1={Y(0)} y2={Y(0)} className="ground" />
      <line x1={X(0)} x2={X(xMax)} y1={Y(NET_STRAP)} y2={Y(NET_STRAP)} className="strap" />
      <text x={X(xMax) - 2} y={Y(NET_STRAP) - 4} textAnchor="end" className="cap">Net strap 0.91 m</text>
      <polyline points={pts.reverse().join(' ')} className="ball-path" markerEnd="url(#sd-ball)" />
      {p !== undefined && (
        <line x1={X(cx - Math.cos(p) * 0.55)} y1={Y(h - Math.sin(p) * 0.55)} x2={X(cx + Math.cos(p) * 0.55)} y2={Y(h + Math.sin(p) * 0.55)} className="swing" markerEnd="url(#sd-arrow)" />
      )}
      <line {...seg(target)} className="face-target" />
      {face !== undefined && <line {...seg(face)} className="face" />}
      <circle cx={X(cx)} cy={Y(h)} r={5} className="ball" />
      <line x1={X(cx)} x2={X(cx)} y1={Y(0)} y2={Y(h) + 6} className="drop" />
      <text x={X(cx) - 8} y={Y(h / 2)} textAnchor="end" className="cap">{h.toFixed(2)} m</text>
      <text x={X(0)} y={H - 6} className="cap">Player</text>
      <text x={X(xMax)} y={H - 6} textAnchor="end" className="cap">Net →</text>
    </svg>
  );
}

function Legend() {
  return (
    <div className="strike-legend">
      <span><i className="k-face" />Your face</span>
      <span><i className="k-target" />Square to the ball</span>
      <span><i className="k-swing" />Swing path</span>
      <span><i className="k-ball" />Incoming ball</span>
    </div>
  );
}

const ms = (sec: number) => `${Math.round(Math.abs(sec) * 1000)} ms`;
/** How the ball's flight gave the stage, in words. */
function ballWords(b: NonNullable<Strike['ball']>): string {
  if (!b.bounceSeen) return `from the ball's last frames (bounce out of view): ball ${b.stage === 'rising' ? 'still climbing' : b.stage === 'peak' ? 'level' : 'dropping'} at contact`;
  const top = b.sinceApex !== undefined ? (Math.abs(b.sinceApex) < 0.03 ? ', right at the top' : `, ${ms(b.sinceApex)} ${b.sinceApex < 0 ? 'before' : 'after'} the top`) : '';
  return `from the ball's flight: bounced ${b.dt!.toFixed(2)} s before contact${top}`;
}
const kmh = (v: number) => Math.round(v * 3.6);
const STAGE_SHORT = { rising: 'rising', peak: 'peak', falling: 'falling' } as const;

/** Groundstroke phases in order; Ready has no measured target. */
const GS_PHASES: PhaseId[] = ['ready', 'unit-turn', 'backswing', 'racket-drop', 'contact', 'follow-through'];
const STAGE_FOCUS: Record<BounceStage, Partial<Record<PhaseId, string>>> = {
  rising: {
    ready: 'Split step early and a little further up the court.',
    'unit-turn': 'Turn sooner: the ball reaches you quickly after the bounce.',
    backswing: 'Compact backswing, knees bent and staying down.',
    'racket-drop': 'Short drop just below the ball; little lift needed.',
    contact: 'Further in front, face slightly closed, use the ball\'s pace.',
    'follow-through': 'Forward and through, finishing around shoulder height.',
  },
  peak: {
    ready: 'Normal split step as the opponent hits.',
    'unit-turn': 'Turn as you read the ball.',
    backswing: 'Full turn, standing a little taller for a chest-high ball.',
    'racket-drop': 'Drop the racket just below the ball.',
    contact: 'Vertical face, mostly drive through the ball.',
    'follow-through': 'Long extension toward the target, then across.',
  },
  falling: {
    ready: 'Split step, then move back or wait: you have time.',
    'unit-turn': 'Turn fully; there is time to set up.',
    backswing: 'Full turn and a deep knee bend to get under the ball.',
    'racket-drop': 'Drop lower so the swing can rise into the ball.',
    contact: 'Let it come a little closer, face slightly open, push up and forward.',
    'follow-through': 'Finish high to lift the ball over the net.',
  },
};

const fmtRange = (r: Pick<Rule, 'metric' | 'min' | 'max'>) =>
  r.min !== undefined && r.max !== undefined ? `${formatMetric(r.metric, r.min)}–${formatMetric(r.metric, r.max)}`
    : r.min !== undefined ? `${formatMetric(r.metric, r.min)}+` : r.max !== undefined ? `up to ${formatMetric(r.metric, r.max)}` : '';

/** How each of the six positions changes with the ball's timing, from the rule targets. */
export function StageBody({ stage, type = 'forehand' }: { stage: BounceStage; type?: StrokeType }) {
  const rules = DEFAULT_RULES.filter((r) => r.enabled && r.strokes.includes(type) && r.byStage);
  return (
    <ol className="stage-body">
      {GS_PHASES.map((ph) => {
        const here = rules.filter((r) => r.phase === ph).map((r) => ({ base: r, eff: ruleForStage(r, stage) }));
        return (
          <li key={ph}>
            <b>{PHASE_LABEL[ph]}</b>
            <span>{STAGE_FOCUS[stage][ph]}</span>
            {here.map(({ base, eff }) => {
              const changed = eff.min !== base.min || eff.max !== base.max;
              return (
                <small key={base.id} className={changed ? 'changed' : ''}>
                  {METRIC_INFO[base.metric].label}: {fmtRange(eff)}{changed ? ` (usual ${fmtRange(base)})` : ''}
                </small>
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}

const SOURCE_WORD = (s: Strike) =>
  s.stageSource === 'set' ? 'set by you'
    : s.stageSource === 'ball' && s.ball ? ballWords(s.ball)
    : s.stageSource === 'court' ? `from court position, ${Math.abs(s.behindBaseline!).toFixed(1)} m ${s.behindBaseline! >= 0 ? 'behind' : 'inside'} the baseline`
      : 'assumed (most club forehands are hit on the drop). Set it if you know.';

/** This stroke's key points, phase by phase, with targets set for the ball's timing. */
function BodyChecks({ stroke, stage }: { stroke: Stroke; stage: BounceStage }) {
  const kps = stroke.keyPoints.filter((k) => k.metric && k.value !== undefined && !k.edited);
  const adjusted = kps.some((k) => k.stage);
  const row = (k: KeyPoint) => (
    <li key={k.id} className={k.status === 'good' ? 'ok' : 'no'}>
      <b>{k.status === 'good' ? '✓' : '✗'} {PHASE_LABEL[k.phaseId]}</b>
      <span>{METRIC_INFO[k.metric!].label} {formatMetric(k.metric!, k.value)} <small>· target {fmtRange({ metric: k.metric!, min: k.min, max: k.max })}{k.stage ? ` for a ${k.stage} ball` : ''}</small></span>
      {k.status === 'fix' && <p>{k.text}</p>}
    </li>
  );
  return (
    <>
      <ul className="strike-checks">
        {GS_PHASES.flatMap((ph) => kps.filter((k) => k.phaseId === ph).map(row))}
      </ul>
      <p className="muted small">
        {adjusted
          ? `Targets marked "for a ${stage} ball" are set for this timing. ${STAGE_FOCUS[stage].ready}`
          : 'These targets are the usual ones: set the ball timing above, or let the app read the ball, to adjust them.'}
      </p>
    </>
  );
}

interface PanelProps {
  session: Session;
  prepared: Prepared;
  stroke: Stroke;
  hand: Handedness;
  onStroke: (s: Stroke) => void;
  onSelect: (id: string, frame: number) => void;
  /** Progress text while the ball is being read from the video. */
  busy?: string | null;
}

/** Per-stroke strike reading, plus a table of every groundstroke in the session. */
export function StrikePanel({ session, prepared, stroke, hand, onStroke, onSelect, busy }: PanelProps) {
  const { go } = useApp();
  const map = useMemo(() => (session.court ? courtMap(session.court) : null), [session.court]);
  const read = (s: Stroke) =>
    analyseStrike({ frames: prepared.frames, stroke: s, hand, fps: prepared.fps, yaw: prepared.yaw, hipYaw: prepared.hipYaw ?? [], court: map, stage: s.strikeStage, ball: s.ballRead?.reading });
  const strike = useMemo(() => read(stroke), [stroke, prepared, map]);
  const all = useMemo(
    () => session.strokes.filter(strikeApplies).map((s) => ({ s, r: read(s)! })).filter((x) => x.r),
    [session.strokes, prepared, map],
  );
  const sum = strikeSummary(all.map((x) => x.r));

  if (!strike) {
    return (
      <div className="insight strike">
        <div className="label">Strike lab</div>
        <p>The Strike lab reads groundstrokes (forehands and backhands). Pick one from the list, or change this stroke's type.</p>
        <button className="link" onClick={() => go({ name: 'strike' })}>Study how the strike works →</button>
      </div>
    );
  }
  const scoreCls = strike.score === undefined ? '' : strike.score >= 75 ? 't' : strike.score >= 50 ? 'a' : 'r';
  return (
    <>
      <div className="insight strike">
        <div className="label">Strike lab <i>|</i> {strike.score !== undefined ? <b className={scoreCls}>{strike.score}/100</b> : <b>not scored</b>}</div>
        <p className="focus-title">{strike.headline}</p>

        <div className="strike-stage">
          <span className="muted small">Ball at contact</span>
          <div className="seg">
            {STAGES.map((st) => (
              <button key={st.id} className={strike.stage === st.id ? 'on' : ''} onClick={() => onStroke({ ...stroke, strikeStage: stroke.strikeStage === st.id ? undefined : st.id })} title={stroke.strikeStage === st.id ? 'Click again to go back to the estimate' : `Ball ${st.label.toLowerCase()} at contact`}>
                {st.label}
              </button>
            ))}
          </div>
          <span className="muted small">{SOURCE_WORD(strike)}</span>
          {busy && <span className="muted small ball-busy">{busy}</span>}
        </div>

        <StrikeDiagram stage={strike.stage} height={strike.ballHeight} face={strike.face} path={strike.path} compact />
        <Legend />

        <dl className="strike-nums">
          {strike.ballHeight !== undefined && <><dt>Contact height</dt><dd className="a">{strike.ballHeight.toFixed(2)} m <small>{HEIGHT_WORD[strike.height!]}</small></dd></>}
          <dt>Face (estimate)</dt><dd>{strike.face !== undefined ? fmtFace(strike.face) : '—'} <small>target {strike.faceTarget.words}</small></dd>
          {strike.path !== undefined && <><dt>Strike path</dt><dd className="v">{strike.path >= 0 ? '+' : ''}{Math.round(strike.path)}°</dd></>}
          {strike.drive !== undefined && <><dt>Drive / lift</dt><dd>{Math.round(strike.drive)}% / {100 - Math.round(strike.drive)}%</dd></>}
          {strike.brake !== undefined && <><dt>Trunk brake</dt><dd>{Math.round(strike.brake)}%{strike.trunkLead !== undefined ? <small> peak {strike.trunkLead} ms before contact</small> : null}</dd></>}
          {strike.extension !== undefined && <><dt>Extension</dt><dd>{strike.extension.toFixed(2)} m</dd></>}
        </dl>

        {strike.shot && (
          <div className="strike-impact">
            <div className="label">What it did to the ball <i>|</i> <b className="v">model</b></div>
            <dl className="strike-nums">
              <dt>Off the strings</dt><dd className="a">{kmh(strike.shot.speed)} km/h <small>racket ~{kmh(strike.racketSpeed!)} km/h, ball in {kmh(strike.speedIn!)} km/h{strike.speedInMeasured ? '' : ' (assumed)'}</small></dd>
              <dt>Launch</dt><dd>{strike.shot.launch >= 0 ? '+' : ''}{strike.shot.launch.toFixed(1)}°</dd>
              <dt>Spin</dt><dd>{Math.round(Math.abs(strike.shot.rpm))} rpm {strike.shot.rpm >= 0 ? 'topspin' : 'backspin'}</dd>
              <dt>Into the ball</dt><dd>{Math.round(strike.shot.square)}% <small>of the strike goes straight through it</small></dd>
              {strike.atPeak && strike.stage !== 'peak' && <><dt>At the top</dt><dd>{kmh(strike.atPeak.speed)} km/h, {strike.atPeak.launch >= 0 ? '+' : ''}{strike.atPeak.launch.toFixed(1)}°, {Math.round(Math.abs(strike.atPeak.rpm))} rpm</dd></>}
            </dl>
            <ul className="impact-list">{strike.impact.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <p className="muted small">Estimated with a physics model (ball meeting the strings, then flight with drag and spin). Racket speed comes from the wrist, {strike.faceAssumed ? 'the face could not be read so it is taken as vertical, ' : ''}so compare strokes with each other rather than trusting one number.</p>
          </div>
        )}

        <ul className="strike-checks">
          {strike.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'ok' : 'no'}>
              <b>{c.ok ? '✓' : '✗'} {c.label}</b>
              <span>{c.value} <small>· target {c.target}</small></span>
              {!c.ok && <p>{c.tip}</p>}
            </li>
          ))}
        </ul>
        <div className="strike-body">
          <div className="label">Body positions for a {strike.stage} ball</div>
          <BodyChecks stroke={stroke} stage={strike.stage} />
        </div>
        {strike.faceNote && <p className="muted small">{strike.faceNote}</p>}
        {strike.lowTracking && <p className="muted small">Tracking of the hitting arm at contact: {Math.round(strike.tracking * 100)}%. The score is left out below 50%.</p>}
        <p className="muted small">Readings come from the pose: the face is estimated from the palm and the ball is tracked by its colour, so treat single numbers as a guide and look at the pattern across strokes.</p>
        <button className="link" onClick={() => go({ name: 'strike' })}>Study how the strike works →</button>
      </div>

      {all.length > 1 && (
        <div className="insight strike-table">
          <div className="label">Every groundstroke <i>|</i> <b className="a">{sum.avgScore !== undefined ? `avg ${sum.avgScore}/100` : `${sum.n} strokes`}</b></div>
          <table>
            <thead><tr><th>#</th><th>Time</th><th>Ball</th><th>vs top</th><th>Height</th><th>Path</th><th>Face</th><th>Off strings</th><th>Spin</th><th>Drive</th><th>Score</th></tr></thead>
            <tbody>
              {all.map(({ s, r }) => (
                <tr key={s.id} className={s.id === stroke.id ? 'on' : ''} onClick={() => onSelect(s.id, s.contactFrame)}>
                  <td>{session.strokes.indexOf(s) + 1}</td>
                  <td>{fmtTime(session.start + s.contactFrame / session.fps)}</td>
                  <td className={`stage-${r.stage}`}>{STAGE_SHORT[r.stage]}{r.stageSource === 'assumed' ? '?' : r.stageSource === 'court' ? '*' : ''}</td>
                  <td>{r.ball?.sinceApex !== undefined ? `${r.ball.sinceApex < 0 ? '−' : '+'}${Math.round(Math.abs(r.ball.sinceApex) * 1000)} ms` : '—'}</td>
                  <td>{r.ballHeight !== undefined ? r.ballHeight.toFixed(2) : '—'}</td>
                  <td>{r.path !== undefined ? `${Math.round(r.path)}°` : '—'}</td>
                  <td>{r.face !== undefined ? fmtFace(r.face) : '—'}</td>
                  <td>{r.shot ? `${kmh(r.shot.speed)} km/h` : '—'}</td>
                  <td>{r.shot ? `${Math.round(r.shot.rpm)}` : '—'}</td>
                  <td className={r.checks.find((c) => c.id === 'drive')?.ok === false ? 'r' : ''}>{r.drive !== undefined ? `${Math.round(r.drive)}%` : '—'}</td>
                  <td>{r.score ?? '—'}{r.brushing ? ' ⚠' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            {sum.worst ? `Most common miss: ${({ face: 'face not square to the ball', drive: 'wrong drive/lift split for the height', brake: 'trunk still turning at contact', extension: 'short extension through the ball', brush: 'brushing up the back of the ball' } as const)[sum.worst]}. ` : ''}
            {sum.brushing ? `${sum.brushing} brushed (⚠). ` : ''}Ball stage comes from tracking the ball; * = from court position, ? = assumed. "vs top" is time before (−) or after (+) the top of the bounce. Off strings and spin are model estimates. Click a row to study that stroke.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * The study page: an interactive model of the strike. Move the bounce stage, the contact height,
 * the face and the swing path and see whether the strings meet the ball square on and whether the
 * drive/lift split suits the height.
 */
export function StrikeStudy() {
  const [stage, setStage] = useState<BounceStage>('falling');
  const [height, setHeight] = useState(0.8);
  const [face, setFace] = useState(6);
  const [path, setPath] = useState(20);
  const t = FACE_TARGET[stage];
  const band = heightBand(height);
  const dt = DRIVE_TARGET[band];
  const drive = driveShare(path);
  const faceOk = face >= t.min && face <= t.max;
  const driveOk = drive >= dt.min && drive <= dt.max;
  const brushing = (path >= BRUSH_PATH && face >= BRUSH_FACE && stage !== 'rising') || path >= BRUSH_PATH_ANY;
  const off = face - t.centre;
  return (
    <div className="strike-study">
      <h1>Strike lab</h1>
      <p className="muted">How squarely and how hard a groundstroke meets the ball. Move the controls to see the model, then open a session and switch on <b>Strike lab</b> to read your own strokes.</p>

      <div className="study-grid">
        <div className="insight">
          <div className="label">Try it <i>|</i> <b className={faceOk && driveOk && !brushing ? 't' : 'r'}>{faceOk && driveOk && !brushing ? 'Clean strike' : brushing ? 'Brushing' : 'Not square'}</b></div>
          <StrikeDiagram stage={stage} height={height} face={face} path={path} />
          <Legend />
          <div className="study-controls">
            <label>Ball at contact
              <div className="seg">{STAGES.map((s) => <button key={s.id} className={stage === s.id ? 'on' : ''} onClick={() => setStage(s.id)}>{s.label}</button>)}</div>
            </label>
            <label>Contact height <b>{height.toFixed(2)} m</b> <small>{HEIGHT_WORD[band]}</small>
              <input type="range" min={0.3} max={1.6} step={0.01} value={height} onChange={(e) => setHeight(+e.target.value)} />
            </label>
            <label>Racket face <b>{fmtFace(face)}</b>
              <input type="range" min={-20} max={25} step={1} value={face} onChange={(e) => setFace(+e.target.value)} />
            </label>
            <label>Swing path <b>{path >= 0 ? '+' : ''}{path}°</b> <small>{Math.round(drive)}% drive / {100 - Math.round(drive)}% lift</small>
              <input type="range" min={-10} max={55} step={1} value={path} onChange={(e) => setPath(+e.target.value)} />
            </label>
          </div>
          <ul className="strike-checks">
            <li className={faceOk ? 'ok' : 'no'}><b>{faceOk ? '✓' : '✗'} Face square to the ball</b><span>{Math.abs(off) < 1 ? 'Head on.' : `${Math.round(Math.abs(off))}° ${off > 0 ? 'too closed' : 'too open'} for a ${stage} ball (target ${t.words}).`}</span></li>
            <li className={driveOk ? 'ok' : 'no'}><b>{driveOk ? '✓' : '✗'} Drive vs lift for the height</b><span>{Math.round(drive)}% forward; a ball {HEIGHT_WORD[band]} wants {dt.words}.</span></li>
            <li className={!brushing ? 'ok' : 'no'}><b>{!brushing ? '✓' : '✗'} No wiper brush</b><span>{brushing ? 'Steep path with a closed face: the strings slide up the felt instead of squashing the ball.' : 'The racket drives through the ball.'}</span></li>
          </ul>
          <div className="label" style={{ marginTop: 14 }}>The six positions for a {stage} ball</div>
          <StageBody stage={stage} />
        </div>

        <div className="study-text">
          <div className="insight">
            <div className="label">The three rules</div>
            <ol>
              <li><b>Match the face to the bounce.</b> Slightly closed (5–10°) on a rising ball, vertical at the peak, slightly open (about 5°) on a falling ball, so the strings meet the ball square on. Copying a pro's closed face only works if you take the ball on the rise like they do.</li>
              <li><b>Drive, don't wipe.</b> Push forward through the ball with a long extension. Topspin comes from a slightly low-to-high path while the ball is squashed on the strings, not from brushing up its back with a closed face.</li>
              <li><b>Respect the net.</b> Above the net strap you have clearance: mostly drive. Below it, split the swing roughly half forward, half up so topspin carries the ball over the net and dips it in.</li>
            </ol>
          </div>
          <div className="insight">
            <div className="label">Where the power comes from</div>
            <p>The legs push, the hips and trunk turn, and just before contact the trunk slows down sharply. Like a passenger thrown forward when a car stops, the lighter arm and racket keep going and whip through the ball. Contact lasts about 4 ms; in that time the ball flattens on the strings and springs off.</p>
          </div>
          <div className="insight">
            <div className="label">What the app measures</div>
            <dl className="strike-nums">
              <dt>Contact height</dt><dd>hitting hand above the ground at contact; below {NET_STRAP} m counts as a low ball</dd>
              <dt>Bounce stage</dt><dd>from the ball's flight in the video (bounce to contact), else your court position, else your setting</dd>
              <dt>Face</dt><dd>estimated from the palm; best when filmed side-on</dd>
              <dt>Strike path</dt><dd>hand from its lowest point before contact to just after it</dd>
              <dt>Drive / lift</dt><dd>how much of that path goes forward vs up</dd>
              <dt>Trunk brake</dt><dd>trunk turning speed at contact vs its peak; aim for {BRAKE_MIN}%+ slower</dd>
              <dt>Extension</dt><dd>hand reach forward along the shot line in the 0.1 s after contact; aim for {EXTENSION_MIN} m+</dd>
            </dl>
          </div>
          <div className="insight">
            <div className="label">Keep in mind</div>
            <p>These are coaching rules of thumb, not laws. In reality the ball's direction depends mostly on the face angle and the swing path together, and many pros hit with a near-vertical to slightly closed face at most heights. Use the angles as a cue when your misses go into the net (face too closed) or long (too open), and change one thing at a time.</p>
            <p className="muted small">Topspin pushes the ball down because the top of the spinning ball moves against the air, which raises the pressure above it.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Strike lab 3D cards: pick a numbered card to see it on the 3D figure (or go back to the video),
 * and save the cards as images, a PDF or a video.
 */
export function StrikeCardsBar({ cards, card, onCard, busy, onSaveOne, onSaveAll, onPdf, onVideo }: {
  cards: StrikeCard[] | null;
  card: number | null;
  onCard: (k: number | null) => void;
  busy?: string | null;
  onSaveOne: () => void;
  onSaveAll: () => void;
  onPdf: () => void;
  onVideo?: () => void;
}) {
  return (
    <div className="insight strike-cards">
      <div className="label">Strike lab <i>|</i> <b>3D cards</b></div>
      <div className="sc-tabs">
        <button className={card === null ? 'on' : ''} onClick={() => onCard(null)}>Video</button>
        {card === null && !cards && <button className="primary" onClick={() => onCard(0)}>Show 3D cards</button>}
        {cards?.map((c, k) => (
          <button key={c.id} className={card === k ? 'on' : ''} onClick={() => onCard(k)} title={c.verdict?.text}>
            <span className={`sc-n ${c.verdict?.ok === true ? 'ok' : c.verdict?.ok === false ? 'no' : ''}`}>{c.n}</span>{c.title}
          </button>
        ))}
      </div>
      {cards && card !== null && cards[card] && (
        <p className="muted small">{cards[card].verdict ? `${cards[card].verdict!.ok ? '✓' : cards[card].verdict!.ok === false ? '✗' : '?'} ${cards[card].verdict!.text}. ` : ''}Tap the card again to replay it.</p>
      )}
      {cards && (
        <div className="sc-export">
          <button onClick={onSaveOne} disabled={!!busy || card === null}>This image</button>
          <button onClick={onSaveAll} disabled={!!busy}>All images</button>
          <button onClick={onPdf} disabled={!!busy}>PDF</button>
          {onVideo && <button onClick={onVideo} disabled={!!busy}>Video</button>}
          {busy && <span className="muted small">{busy}</span>}
        </div>
      )}
      {!cards && <p className="muted small">Each step of the stroke on the 3D figure, with its angles and numbers and a pass or fix, ready to save as images or a PDF.</p>}
    </div>
  );
}
