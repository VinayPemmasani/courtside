# Spinwise

Table tennis stroke analysis for players and coaches. Import a video of loops, pushes, flicks, blocks or serves and Spinwise:

- tracks the player's body in every frame (MediaPipe Pose, on the device),
- finds each stroke and labels it: forehand loop, backhand loop, push, flick, block or serve,
- splits it into numbered phases: loops use *Ready, Turn, Backswing, Low Point, Contact, Finish*; serves use *Ready, Toss, Low Point, Contact, Finish*; short strokes (push, flick, block) use *Ready, Backswing, Contact, Finish*,
- measures waist turn, knee bend, the hitting elbow, how far in front of the body the ball is met, the finish and the serve toss height,
- writes key points against coach-tunable target ranges and draws callouts on the frame.

**3D studio and breakdown.** The player is rebuilt as a clay athlete beside a regulation table (2.74 × 1.525 m, 76 cm high, 15.25 cm net), with the bat path, an illustrative ball flight, weight transfer under each foot and a step-by-step breakdown of each phase.

**Drills.** Every technique fix links to drills at the table (shadow play, multiball, Falkenberg, serve practice) with 3D demos, plus exercises away from the table and links to the coaching sources behind them.

**Table placement.** Tap the four corners of the table once, then tap where each ball lands. Spinwise calls each bounce on or off (edge balls count), sorts it short, mid or long and left, middle or right, links it to the stroke that hit it and estimates ball speed from contact to the bounce.

**Sessions and progress.** Sessions are drills, robot, multiball, serve practice or matches. Coaches can edit key points, move phases, re-label strokes, compare two strokes lined up at contact, follow progress across sessions, share a session as one `.spinwise` file and export images, PDF reports and vertical reels.

Spinwise is a [Tauri 2](https://v2.tauri.app/) desktop app with a React and TypeScript interface, and it also runs in the browser. All analysis runs on the device; nothing is uploaded.

## Run it

Needs Node 20+ and, for the desktop app, Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install          # also downloads the pose models into public/models
npm run dev          # browser version at http://localhost:1420
npm run tauri dev    # desktop window
npm run tauri build  # installer for this OS
npm test             # analysis core tests
```

## Filming tips

One player, whole body in frame, camera on a tripod behind the player's end or side-on to the table, at 120 fps if the phone allows (table tennis strokes are fast; 60 fps is the minimum). Keep the table corners in the picture if you want shot placement.

## How it works

```
video ──▶ pose model ──▶ 33 body landmarks per frame, 2D + 3D
      ──▶ src/core: clean gaps ▸ find strokes from hitting-hand speed ▸ classify ▸ pick phase frames
          ▸ measure angles in 3D ▸ evaluate coach rules ▸ key points + callouts
      ──▶ React screens: breakdown, coach editing, compare, progress, drills, export
```

| Folder | What lives there |
| --- | --- |
| `src/core` | Analysis core, pure TypeScript, unit-tested. Stroke detection, classification, phases, metrics, rules, table placement. |
| `src/pose` | Runs the pose model over the chosen part of the video. |
| `src/render` | Canvas overlays, the 3D studio (three.js: table, bat, athlete) and exports. |
| `src/drills` | Drill catalogue, 3D drill motions, off-table activities. |
| `src/components` | Screens. |
| `src/storage` | Local database (IndexedDB). |
| `src-tauri` | Desktop shell. |

## Known limits in this first version

- **Not yet tuned on real footage.** Detection and classification thresholds come from synthetic strokes. Expect to re-label some short strokes (push vs block vs flick) by hand and to adjust target ranges in Coach settings after trying real clips.
- **The bat is estimated from the hand**, not detected, and the 3D ball flight is illustrative: one camera cannot measure the ball's depth.
- **Bounces are tapped, not detected.** Line calls are as precise as the tapped point and the table calibration.
- At 30 fps a fast loop may fall between frames; film at 120 fps for reliable contact frames.
- One camera, one player per clip.

## Website

`website/` is a one-page static site for Spinwise. Host the folder on any static host.

## Licences

MediaPipe Pose (Apache 2.0). The 3D figure is the "Superhero Male" body from Quaternius' Universal Base Characters (CC0); see `public/studio/CREDITS.txt`.
