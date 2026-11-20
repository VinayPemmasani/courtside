import { chainCurves, contactTiming, pathVsFace, practiceFocus, type Handedness, type Rule, type Stroke } from '../core';
import type { Prepared } from '../core/analyze';

const LINK_COLOR: Record<string, string> = { hips: 'var(--violet)', trunk: 'var(--teal)', elbow: 'var(--accent)', hand: '#ffffff' };

/**
 * Power sequence: how fast the hips, trunk, arm and hand move through the swing, each scaled to its
 * own peak. A connected swing peaks in that order, each link handing speed to the next.
 */
export function PowerSequence({ prepared, stroke, frame, onSeek }: { prepared: Prepared; stroke: Stroke; frame: number; onSeek: (f: number) => void }) {
  const hipYaw = prepared.hipYaw ?? [];
  const c = chainCurves(prepared.frames, stroke, prepared.hand, prepared.fps, prepared.yaw, hipYaw);
  const n = c.to - c.from;
  if (n < 3) return null;
  const W = 300, H = 92, pad = 4;
  const x = (f: number) => pad + ((f - c.from) / n) * (W - 2 * pad);
  const peaks = c.links.map((l) => l.peak).filter(Boolean) as { frame: number }[];
  const inOrder = peaks.length === 4 && peaks.every((p, k) => k === 0 || peaks[k - 1].frame <= p.frame);
  const ms = (a?: { frame: number }, b?: { frame: number }) => (a && b ? Math.round(((b.frame - a.frame) / prepared.fps) * 1000) : undefined);
  return (
    <div className="insight power-seq">
      <div className="label">Power sequence <i>|</i> <b className={inOrder ? 't' : 'r'}>{inOrder ? 'Body leads the arm' : 'Out of order'}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speed of hips, trunk, arm and hand through the swing"
        onClick={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          onSeek(Math.round(c.from + ((e.clientX - r.left) / r.width) * n));
        }}>
        <line x1={x(c.contact)} x2={x(c.contact)} y1={0} y2={H} className="contact" />
        {frame >= c.from && frame <= c.to && <line x1={x(frame)} x2={x(frame)} y1={0} y2={H} className="now" />}
        {c.links.map((l) => {
          const max = Math.max(1e-6, ...l.values.filter((v) => Number.isFinite(v) && v > 0));
          const y = (v: number) => H - pad - (Math.max(0, v) / max) * (H - 2 * pad - 8);
          const d = l.values.map((v, k) => (Number.isFinite(v) ? `${k === 0 || !Number.isFinite(l.values[k - 1]) ? 'M' : 'L'}${x(c.from + k).toFixed(1)},${y(v).toFixed(1)}` : '')).join('');
          return (
            <g key={l.id}>
              <path d={d} fill="none" stroke={LINK_COLOR[l.id]} strokeWidth={1.6} opacity={0.9} />
              {l.peak && <circle cx={x(l.peak.frame)} cy={y(l.peak.value)} r={3} fill={LINK_COLOR[l.id]} />}
            </g>
          );
        })}
      </svg>
      <ol className="seq">
        {c.links.map((l, k) => {
          const lag = k > 0 ? ms(c.links[k - 1].peak, l.peak) : undefined;
          return (
            <li key={l.id}>
              <i style={{ background: LINK_COLOR[l.id] }} />{l.label}
              {l.peak && <small>{l.peak.value.toFixed(l.unit === 'm/s' ? 1 : 0)} {l.unit}</small>}
              {lag !== undefined && <em className={lag < 0 ? 'r' : ''}>{lag >= 0 ? '+' : ''}{lag} ms</em>}
            </li>
          );
        })}
      </ol>
      <p className="muted small">Peaks should go hips → trunk → arm → hand. The line marks contact; click the chart to jump there.</p>
    </div>
  );
}

/** Contact timing and swing path vs racket face, in plain words. */
export function ContactReading({ stroke, rules, hand }: { stroke: Stroke; rules: Rule[]; hand: Handedness }) {
  const t = contactTiming(stroke, rules, hand);
  const pf = pathVsFace(stroke);
  if (!t && !pf) return null;
  return (
    <div className="insight contact-reading">
      <div className="label">Contact <i>|</i> {t && <b className={t.timing === 'on time' ? 't' : 'r'}>{t.timing}</b>}</div>
      <dl>
        {t && <><dt>Hand in front of hips</dt><dd>{t.value.toFixed(2)} m</dd></>}
        {pf && <><dt>Swing path</dt><dd className="a">{pf.path >= 0 ? '+' : ''}{Math.round(pf.path)}°</dd></>}
        {pf?.face !== undefined && <><dt>Face (estimate)</dt><dd>{pf.face >= 0 ? `${Math.round(pf.face)}° closed` : `${Math.round(-pf.face)}° open`}</dd></>}
        {pf?.gap !== undefined && <><dt>Path vs face</dt><dd className="v">{Math.round(Math.abs(pf.gap))}°</dd></>}
      </dl>
      {t && <p>{t.hint}</p>}
      {pf && <p>{pf.summary} {pf.adjust}</p>}
    </div>
  );
}

/** One fix, one drill and one question to take to the next session. */
export function FocusCard({ stroke }: { stroke: Stroke }) {
  const f = practiceFocus(stroke);
  return (
    <div className="insight focus">
      <div className="label">Next session <i>|</i> <b className="a">one change</b></div>
      <p className="focus-title">{f.title}</p>
      <p><strong>Drill.</strong> {f.drill}</p>
      <p className="q">{f.question}</p>
    </div>
  );
}
