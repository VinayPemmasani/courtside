import { formatReading, type Breakdown } from '../core';

/**
 * Side panel for the step-by-step breakdown: the four chapters as steps, play/pause, and every
 * number of the selected chapter with where it comes from (measured from the body, or estimated).
 */
export function BreakdownPanel({ breakdown, step, playing, onStep, onPlay, onExport, exporting }: {
  breakdown: Breakdown | null;
  step: number;
  playing: boolean;
  onStep: (k: number) => void;
  onPlay: () => void;
  onExport?: () => void;
  exporting?: string | null;
}) {
  if (!breakdown) return <div className="panel breakdown-panel"><h4>Breakdown</h4><p className="muted small">Pick a stroke to break it down.</p></div>;
  const c = breakdown.chapters[step];
  return (
    <div className="panel breakdown-panel">
      <div className="bd-head">
        <h4>Breakdown</h4>
        <button className="primary" onClick={onPlay}>{playing ? 'Pause' : step === 0 ? 'Play breakdown' : 'Play'}</button>
        {onExport && <button onClick={onExport} disabled={!!exporting} title="1080×1920 video of the four steps">{exporting ?? 'Breakdown video'}</button>}
      </div>
      <div className="bd-steps">
        {breakdown.chapters.map((ch, k) => (
          <button key={ch.id} className={k === step ? 'on' : k < step ? 'done' : ''} onClick={() => onStep(k)}>
            <span>{ch.step}</span>{ch.title}
          </button>
        ))}
      </div>
      <ul className="bd-beats">
        {c.beats.map((b, k) => <li key={k}><strong>{b.topic}</strong> {b.text}</li>)}
      </ul>
      <table className="bd-readings">
        <tbody>
          {c.readings.map((r) => (
            <tr key={r.id} className={r.status ?? ''}>
              <td>{r.label}</td>
              <td className="v">{formatReading(r)}</td>
              <td><span className={`src ${r.source}`} title={r.source === 'estimated' ? 'Estimated: depends on the racket (simulated from the hand and forearm) or on depth the camera cannot see' : 'Measured from the tracked body in the video'}>{r.source === 'estimated' ? 'est.' : 'measured'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.id === 'swing' && breakdown.chain.length > 0 && (
        <p className="muted small">Peak speed before contact: {breakdown.chain.map((x) => `${x.label} ${x.ms} ms`).join(' · ')}</p>
      )}
      <p className="muted small">Measured = read from your tracked joints. Est. = the racket (simulated from your hand and forearm) or depth toward the camera. Film side-on or from behind with your whole body in shot for the best numbers.</p>
    </div>
  );
}
