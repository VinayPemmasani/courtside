import { useState } from 'react';
import { setupGrade, type SetupReport } from '../core';

/** Bird's-eye sketch of the pitch and the two camera spots. */
function CameraSketch() {
  return (
    <svg className="film-sketch" viewBox="0 0 200 150" role="img" aria-label="Camera positions: side-on, square of the crease, or behind the bowler's arm">
      <rect x="85" y="8" width="30" height="134" rx="2" className="fs-court" />
      <line x1="80" y1="22" x2="120" y2="22" className="fs-line" />
      <line x1="80" y1="128" x2="120" y2="128" className="fs-line" />
      <line x1="93" y1="14" x2="107" y2="14" className="fs-net" />
      <line x1="93" y1="136" x2="107" y2="136" className="fs-net" />
      <circle cx="100" cy="122" r="5" className="fs-player" />
      <text x="40" y="117" className="fs-label">batter</text>
      <circle cx="104" cy="30" r="4" className="fs-player" />
      <text x="112" y="33" className="fs-label">bowler</text>
      <g className="fs-cam"><rect x="160" y="119" width="12" height="6" rx="1" /><text x="176" y="125" className="fs-label">A</text></g>
      <g className="fs-cam"><rect x="94" y="0" width="12" height="6" rx="1" /><text x="80" y="6" className="fs-label">B</text></g>
      <path d="M160 122 L108 108 M160 122 L108 138" className="fs-view" />
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
            <li><strong>Tripod at about 1.2–1.5 m</strong> (chest height). Handheld clips shake and move the numbers.</li>
            <li><strong>Spot A, side-on</strong>, square of the crease 8–12 m away: best for both batting and the bowling action (elbow, front knee, stride). <strong>Spot B, behind</strong>, straight down the pitch behind the bowler's arm or the batter: best for alignment and the head position.</li>
            <li><strong>Whole body in the picture</strong> with room above the bat at the top of the backlift and above the bowling hand at release. For bowlers, frame the last three strides and the follow-through.</li>
            <li><strong>60 fps or faster</strong>; 120 or 240 fps slow motion is best for checking the bowling elbow. Choose 60 when importing.</li>
            <li><strong>Keep it level</strong>, and keep the stumps in view so the crease is easy to find.</li>
            <li><strong>One player per clip</strong>: in the nets, film through the side netting, not through other batters.</li>
          </ol>
          <p className="muted small">After each analysis Creaseline scores the filming and says what to change next time.</p>
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
