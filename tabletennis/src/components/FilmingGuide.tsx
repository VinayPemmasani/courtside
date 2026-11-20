import { useState } from 'react';
import { setupGrade, type SetupReport } from '../core';

/** Bird's-eye sketch of the two camera spots around the table. */
function CameraSketch() {
  return (
    <svg className="film-sketch" viewBox="0 0 200 150" role="img" aria-label="Camera positions: behind the player or to the side">
      <rect x="72" y="22" width="56" height="96" rx="2" className="fs-court" />
      <line x1="64" y1="70" x2="136" y2="70" className="fs-net" />
      <line x1="100" y1="22" x2="100" y2="118" className="fs-line" />
      <circle cx="106" cy="128" r="5" className="fs-player" />
      <text x="114" y="131" className="fs-label">player</text>
      <g className="fs-cam"><rect x="100" y="141" width="12" height="6" rx="1" /><text x="80" y="148" className="fs-label">A</text></g>
      <g className="fs-cam"><rect x="16" y="122" width="12" height="6" rx="1" /><text x="14" y="118" className="fs-label">B</text></g>
      <path d="M106 141 L82 20 M106 141 L130 20" className="fs-view" />
    </svg>
  );
}

export function FilmingGuide({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <div className="film-guide">
      <button className="film-guide-head" onClick={() => setOpen(!open)}>
        <strong>How to film for the best results</strong>
        <span className="muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="film-guide-body">
          <CameraSketch />
          <ol>
            <li><strong>Tripod at about 1.4–1.8 m</strong>, a little above the table. A clamp on a barrier works too. Handheld clips shake and move the numbers.</li>
            <li><strong>Spot A, behind the player</strong>, 2–3 m back and a little raised, with the whole table in view: best for shot placement and serves. <strong>Spot B, side-on</strong>, 3–4 m away level with the player's playing side: best for stroke technique.</li>
            <li><strong>Whole body in the picture</strong> with a little room above the head and below the feet, even when the player moves wide to the forehand.</li>
            <li><strong>120 fps if your phone allows</strong>, at least 60. Table tennis strokes are fast; slow-motion modes are ideal.</li>
            <li><strong>Keep it level</strong>, and keep all four table corners in view if you want shot placement.</li>
            <li><strong>One player in the picture</strong> if you can: film from your side so the opponent is small at the far end. Good, even light helps.</li>
          </ol>
          <p className="muted small">After each analysis Spinwise scores the filming and says what to change next time.</p>
        </div>
      )}
    </div>
  );
}

/** Small "Filming 86/100" badge that opens the list of fixes. */
export function SetupBadge({ report }: { report: SetupReport }) {
  const [open, setOpen] = useState(false);
  const grade = setupGrade(report.score);
  return (
    <div className="setup-badge-wrap">
      <button className={`setup-badge ${grade}`} onClick={() => setOpen(!open)} title="How well this clip was filmed for analysis">
        Filming {report.score}/100
      </button>
      {open && (
        <div className="setup-pop">
          <h4>Setup check</h4>
          <p className="muted small">Player found in {Math.round(report.found * 100)}% of frames · whole body visible {Math.round(report.wholeBody * 100)}% · player height {Math.round(report.size * 100)}% of the frame</p>
          {report.issues.length === 0 ? <p className="good">The clip is well filmed. Numbers from it can be trusted as far as one camera allows.</p> : (
            <ul>
              {report.issues.map((i) => (
                <li key={i.id} className={i.severity}>
                  <strong>{i.problem}</strong>
                  <span>{i.fix}</span>
                </li>
              ))}
            </ul>
          )}
          <FilmingGuide compact />
        </div>
      )}
    </div>
  );
}
