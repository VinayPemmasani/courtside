import { formatMetric, liveDiff, METRIC_INFO, metricDiffs, PHASE_LABEL, phaseTiming, type Handedness, type LiveDiff, type ProMatch, type Stroke, type Vec3 } from '../core';
import { STROKE_LABEL } from '../labels';

const sign = (d: number, digits = 0) => `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(digits)}`;

/** Plain-language reading of the biggest live difference. */
function liveHint(r: LiveDiff): string {
  const more = r.delta > 0;
  switch (r.key) {
    case 'elbow': return more ? 'Your hitting arm is straighter than the pro’s here.' : 'Your hitting arm is more bent than the pro’s here.';
    case 'knee': return more ? 'You are standing taller: bend your knees more.' : 'You are lower than the pro here.';
    case 'hipShoulder': return more ? 'You have more hip-shoulder stretch than the pro here.' : 'Less hip-shoulder stretch: turn the shoulders further past the hips.';
    case 'shoulder': return more ? 'Your arm is further from your body than the pro’s.' : 'Your arm is closer to your body than the pro’s.';
    case 'trunkLean': return more ? 'You lean more than the pro here.' : 'You stay more upright than the pro here.';
    case 'hand': return 'Your hitting hand is away from where the pro’s is at this moment.';
  }
}

export function ProComparePanel({
  stroke, fps, hand, matches, selected, onSelect, userWorld, proWorld, loading,
}: {
  stroke: Stroke;
  fps: number;
  hand: Handedness;
  matches: ProMatch[];
  selected?: ProMatch;
  onSelect: (key: string | undefined) => void;
  userWorld: Vec3[] | null;
  proWorld: Vec3[] | null;
  loading: boolean;
}) {
  if (loading) return <div className="insight pro-cmp"><div className="label">Pro compare</div><p className="muted">Loading pro references…</p></div>;
  if (!matches.length) {
    return (
      <div className="insight pro-cmp">
        <div className="label">Pro compare <i>|</i> <b className="a">No {STROKE_LABEL[stroke.type].toLowerCase()} models yet</b></div>
        <p>Pro models come from real clips. Add a player (for example the pro you want to copy), tick <b>Pro reference</b>, and import a short side-on clip of their {STROKE_LABEL[stroke.type].toLowerCase()}. Slow motion works best.</p>
        <p className="muted small">Only import clips you have the right to use.</p>
      </div>
    );
  }
  const m = selected ?? matches[0];
  const rows = userWorld && proWorld ? liveDiff(userWorld, hand, proWorld) : [];
  const worst = rows.filter((r) => (r.unit === '°' ? Math.abs(r.delta) >= 12 : r.delta >= 15)).sort((a, b) => Math.abs(b.delta) / (b.unit === '°' ? 12 : 15) - Math.abs(a.delta) / (a.unit === '°' ? 12 : 15))[0];
  const diffs = metricDiffs(stroke, m.ref.stroke).slice(0, 6);
  const tu = phaseTiming(stroke, fps);
  const tp = phaseTiming(m.ref.stroke, m.ref.fps);
  return (
    <div className="insight pro-cmp">
      <div className="label">Pro compare <i>|</i> <b className="a">{m.ref.player}</b> <span className="muted">{m.similarity}% alike</span></div>
      <select value={selected?.ref.key ?? ''} onChange={(e) => onSelect(e.target.value || undefined)}>
        <option value="">Closest match: {matches[0].ref.player} · {STROKE_LABEL[matches[0].ref.stroke.type]}{matches[0].ref.stroke.spin ? ` · ${matches[0].ref.stroke.spin}` : ''}</option>
        {matches.map((x) => (
          <option key={x.ref.key} value={x.ref.key}>{x.ref.player} · {STROKE_LABEL[x.ref.stroke.type]}{x.ref.stroke.spin ? ` · ${x.ref.stroke.spin}` : ''} · {x.similarity}%{x.ref.title ? ` · ${x.ref.title}` : ''}</option>
        ))}
      </select>
      <p className="legend"><span className="you" /> You <span className="pro" /> {m.ref.player}, scaled to your size and timed phase by phase</p>
      {rows.length > 0 ? (
        <>
          <table className="live">
            <thead><tr><th>Now</th><th>You</th><th>Pro</th><th>Gap</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={(r.unit === '°' ? Math.abs(r.delta) >= 12 : r.delta >= 15) ? 'off' : ''}>
                  <td>{r.label}</td>
                  <td>{r.unit === 'cm' ? '' : `${r.user.toFixed(0)}°`}</td>
                  <td>{r.unit === 'cm' ? '' : `${r.pro.toFixed(0)}°`}</td>
                  <td>{r.unit === 'cm' ? `${r.delta.toFixed(0)} cm` : `${sign(r.delta)}°`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {worst && <p className="hint">{liveHint(worst)}</p>}
        </>
      ) : <p className="muted small">Scrub into the stroke to see the two poses side by side.</p>}
      {diffs.length > 0 && (
        <>
          <h5>Biggest differences</h5>
          <ul className="diffs">
            {diffs.map((d) => (
              <li key={d.phase + d.metric}>
                <span>{METRIC_INFO[d.metric].label} <small className="muted">{PHASE_LABEL[d.phase]}</small></span>
                <span>{formatMetric(d.metric, d.user)} <small className="muted">vs {formatMetric(d.metric, d.pro)}</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h5>Tempo <small className="muted">seconds before contact</small></h5>
      <ul className="diffs">
        {stroke.phases.filter((p) => p.id !== 'contact' && tu[p.id] !== undefined && tp[p.id] !== undefined).map((p) => (
          <li key={p.id}><span>{p.label}</span><span>{(-tu[p.id]!).toFixed(2)} s <small className="muted">vs {(-tp[p.id]!).toFixed(2)} s</small></span></li>
        ))}
      </ul>
    </div>
  );
}
