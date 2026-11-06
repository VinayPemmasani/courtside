import { COURT, CORNER_HINTS, HALF, summarisePlacement, type Lines } from '../core';
import { STROKE_LABEL, fmtTime } from '../labels';
import type { Session } from '../storage/db';
import type { PlacedBounce } from '../storage/share';

const SH = COURT.singles / 2;
const DH = COURT.doubles / 2;
const L = COURT.length;
const SL = HALF + COURT.service;

/** Bird's-eye view of the far half (where the ball lands), with each bounce. */
export function CourtDiagram({ bounces, lines = 'singles', selected, onSelect }: { bounces: PlacedBounce[]; lines?: Lines; selected?: string; onSelect?: (id: string) => void }) {
  // Metres; the far baseline is at the top. y in the SVG = L + 1.5 - court y.
  const Y = (y: number) => L + 1.5 - y;
  return (
    <svg className="court-diagram" viewBox={`${-DH - 1} 0 ${COURT.doubles + 2} ${L + 1.5 - HALF + 1}`} role="img" aria-label="Bounce map">
      <rect x={-DH - 1} y={0} width={COURT.doubles + 2} height={L + 2.5 - HALF} className="cd-ground" />
      <rect x={-DH} y={Y(L)} width={COURT.doubles} height={L - HALF} className="cd-court" />
      <rect x={-SH} y={Y(L)} width={COURT.singles} height={2.74} className="cd-deep" />
      <g className="cd-lines">
        <line x1={-DH} x2={DH} y1={Y(L)} y2={Y(L)} />
        <line x1={-SH} x2={-SH} y1={Y(L)} y2={Y(HALF)} />
        <line x1={SH} x2={SH} y1={Y(L)} y2={Y(HALF)} />
        <line x1={-DH} x2={-DH} y1={Y(L)} y2={Y(HALF)} className={lines === 'doubles' ? '' : 'faint'} />
        <line x1={DH} x2={DH} y1={Y(L)} y2={Y(HALF)} className={lines === 'doubles' ? '' : 'faint'} />
        <line x1={-SH} x2={SH} y1={Y(SL)} y2={Y(SL)} />
        <line x1={0} x2={0} y1={Y(SL)} y2={Y(HALF)} />
        <line x1={-DH - 0.9} x2={DH + 0.9} y1={Y(HALF)} y2={Y(HALF)} className="net" />
      </g>
      {bounces.map((b, i) => (
        <g key={b.id} className={`cd-ball ${b.inside ? 'in' : 'out'} ${selected === b.id ? 'sel' : ''}`} onClick={() => onSelect?.(b.id)} transform={`translate(${b.at.x} ${Y(b.at.y)})`}>
          <circle r={0.38} />
          <text y={0.13} fontSize={0.42} textAnchor="middle">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

interface Props {
  session: Session;
  bounces: PlacedBounce[];
  calibrating: number | null;
  selected?: string;
  onSelect: (id: string) => void;
  onCalibrate: () => void;
  onCancelCalibrate: () => void;
  onLines: (l: Lines) => void;
  onDelete: (id: string) => void;
  onToggleServe: (id: string, serve: boolean) => void;
  onSeek: (frame: number) => void;
}

export function CourtPanel({ session, bounces, calibrating, selected, onSelect, onCalibrate, onCancelCalibrate, onLines, onDelete, onToggleServe, onSeek }: Props) {
  const sum = summarisePlacement(bounces);
  const pct = (n: number) => (sum.total ? `${Math.round((n / sum.total) * 100)}%` : '–');

  if (calibrating !== null) {
    return (
      <div className="court-panel">
        <h3>Calibrate the court</h3>
        <p className="muted small">Pause on a frame where the court lines are clear, then tap the four corners of the <strong>singles</strong> court on the video, in this order:</p>
        <ol className="corner-steps">
          {CORNER_HINTS.map((h, i) => <li key={h} className={i < calibrating ? 'done' : i === calibrating ? 'now' : ''}>{h}</li>)}
        </ol>
        <p className="muted small">A corner can be off screen? Pick the next clearest frame. You only do this once per camera position.</p>
        <button onClick={onCancelCalibrate}>Cancel</button>
      </div>
    );
  }

  if (!session.court) {
    return (
      <div className="court-panel">
        <h3>Shot placement</h3>
        <p className="muted small">Tap the court corners once, then tap where each ball lands. Courtside calls it in or out, sorts it by depth and direction, and estimates the ball speed from contact to the bounce.</p>
        <button className="primary" onClick={onCalibrate}>Calibrate the court</button>
        <p className="muted small">Works best filmed from behind the baseline, high enough to see the far court lines.</p>
      </div>
    );
  }

  return (
    <div className="court-panel">
      <div className="row between">
        <h3>Shot placement</h3>
        <div className="seg small">
          {(['singles', 'doubles'] as Lines[]).map((l) => <button key={l} className={(session.court!.lines ?? 'singles') === l ? 'on' : ''} onClick={() => onLines(l)}>{l === 'singles' ? 'Singles' : 'Doubles'}</button>)}
        </div>
      </div>
      <CourtDiagram bounces={bounces} lines={session.court.lines} selected={selected} onSelect={onSelect} />
      <div className="stat-row">
        <div><strong>{sum.total ? pct(sum.inside) : '–'}</strong><span>in</span></div>
        <div><strong>{sum.total ? pct(sum.deep) : '–'}</strong><span>deep</span></div>
        <div><strong>{sum.avgSpeed ? Math.round(sum.avgSpeed) : '–'}</strong><span>km/h avg</span></div>
        <div><strong>{sum.total}</strong><span>balls</span></div>
      </div>
      {sum.total > 0 && (
        <p className="muted small">Direction: {sum.byDirection.left} left · {sum.byDirection.middle} middle · {sum.byDirection.right} right (from the hitter's side).</p>
      )}
      <p className="hint">Tap the video where the ball lands to add a bounce. Step frame by frame (← →) to find the landing.</p>
      <ul className="bounce-list">
        {bounces.map((b, i) => (
          <li key={b.id} className={`${b.inside ? 'in' : 'out'} ${selected === b.id ? 'sel' : ''}`} onClick={() => { onSelect(b.id); onSeek(b.frame); }}>
            <span className="n">{i + 1}</span>
            <span className="body">
              <strong>{b.inside ? 'IN' : 'OUT'}</strong> by {Math.round(b.margin * 100)} cm <small>({b.line})</small>
              <small>{fmtTime(session.start + b.frame / session.fps)} · {b.serve ? 'serve, ' : ''}{b.depth} {b.direction}{b.speed ? ` · ${Math.round(b.speed)} km/h` : ''}{b.stroke ? ` · ${STROKE_LABEL[b.stroke.type]}` : ''}</small>
            </span>
            <span className="acts">
              <button className="link" onClick={(e) => { e.stopPropagation(); onToggleServe(b.id, !b.serve); }}>{b.serve ? 'Rally ball' : 'Serve'}</button>
              <button className="link danger" onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}>✕</button>
            </span>
          </li>
        ))}
      </ul>
      <button className="link" onClick={onCalibrate}>Recalibrate the court</button>
      <p className="muted small">Speeds are averages from contact to the bounce, measured on the ground, so they read a little below radar speeds. Line calls are as good as the tapped point: zoom the window and step frames for close calls.</p>
    </div>
  );
}
