import { useState } from 'react';
import { setupGrade, type SetupReport } from '../core';

/** Bird's-eye sketch of the two camera spots. */
function CameraSketch() {
  return (
    <svg className="film-sketch" viewBox="0 0 200 150" role="img" aria-label="Camera positions: behind the baseline or to the side">
      <rect x="40" y="10" width="120" height="130" rx="2" className="fs-court" />
      <line x1="40" y1="75" x2="160" y2="75" className="fs-net" />
      <line x1="55" y1="10" x2="55" y2="140" className="fs-line" />
      <line x1="145" y1="10" x2="145" y2="140" className="fs-line" />
      <line x1="55" y1="45" x2="145" y2="45" className="fs-line" />
      <line x1="55" y1="105" x2="145" y2="105" className="fs-line" />
      <line x1="100" y1="45" x2="100" y2="105" className="fs-line" />
      <circle cx="110" cy="128" r="5" className="fs-player" />
      <text x="118" y="131" className="fs-label">player</text>
      <g className="fs-cam"><rect x="104" y="143" width="12" height="6" rx="1" /><text x="80" y="148" className="fs-label">A</text></g>
      <g className="fs-cam"><rect x="10" y="122" width="12" height="6" rx="1" /><text x="8" y="118" className="fs-label">B</text></g>
      <path d="M110 143 L96 20 M110 143 L124 20" className="fs-view" />
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
            <li><strong>Tripod at about 1.2–1.5 m</strong> (chest height). A fence clamp works too. Handheld clips shake and move the numbers.</li>
            <li><strong>Spot A, behind the baseline</strong>, 3–4 m back and in line with the player: best for shot placement, serves and line calls. <strong>Spot B, side-on</strong>, 6–8 m away level with the player: best for stroke technique.</li>
            <li><strong>Whole body in the picture</strong> with a little room above the head and below the feet, even at the top of the serve.</li>
            <li><strong>60 fps or faster</strong> (slow-motion modes are fine) and choose 60 when importing.</li>
            <li><strong>Tilt slightly down</strong> so the frame shows court, not sky. Keep it level, and keep the far baseline in view if you want bounce tracking.</li>
            <li><strong>One player per clip</strong>, with the sun behind the camera when you can.</li>
          </ol>
          <p className="muted small">After each analysis Courtside scores the filming and says what to change next time.</p>
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
