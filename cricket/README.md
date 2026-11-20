# Creaseline

Cricket technique analysis for players and coaches. Import a side-on or behind-the-stumps clip of a batter or a bowler and Creaseline:

- tracks the player's body in every frame (MediaPipe Pose, on the device),
- finds each shot or delivery and labels it: **drive, pull, cut, defence** for batting, **pace or spin** for bowling,
- splits it into six numbered phases with timestamps:
  - batting: *1 Stance, 2 Backlift, 3 Stride, 4 Downswing, 5 Impact, 6 Follow-through*
  - bowling: *1 Run-up, 2 Gather, 3 Back-foot contact, 4 Front-foot contact, 5 Release, 6 Follow-through*
- measures the body in 3D at each phase (stride length, head over the front knee, backlift height, high front elbow, hands under the eyes, bat speed; elbow extension, front-knee brace, release height, arm angle, hip-shoulder separation, follow-through),
- writes key points against coach-tunable target ranges and draws callouts such as "HEAD OVER BALL" or "LEGAL ARM" on the frame,
- picks one change for next session with a matching drill.

**Bowling legality check.** Elbow extension is the straightening of the bowling elbow from the moment the upper arm passes horizontal to release, as in the Laws' 15° tolerance. It is a single-camera estimate for coaching, not an official test.

**3D studio.** Tick *3D studio* to see the session rebuilt in a floodlit ground: a clay figure (or a dressed player) on a 22-yard pitch with creases and stumps at both ends, the bat (modelled to real proportions) in the batter's hands, the bat path or bowling-arm path, a red ball, rings on the body and a weight-transfer gauge. *Studio video* exports a 1080×1920 reel with each phase held and labelled.

**Drills.** Every fix links to drills, split into *In the nets* and *Off the field*, with kit, dose, steps and a one-line cue.

**Also:** session types (nets, throw-downs, bowling machine, bowling spell, match), a filming score, compare two actions lined up at impact/release, progress across sessions, coach editing of every key point, PDF report, image carousel, vertical video, CSV export and `.crease` share files.

Creaseline is a [Tauri 2](https://v2.tauri.app/) desktop app (Windows, macOS, Linux) that also runs in the browser. All analysis runs on the device; nothing is uploaded.

## Run it

Needs Node 20+ and, for the desktop app, Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm install          # also downloads the pose models into public/models
npm run dev          # browser version at http://localhost:1420
npm run tauri dev    # desktop window with hot reload
npm run tauri build  # installer for this OS
npm test             # analysis core tests
npm run build:web    # static browser build in dist/ (relative paths, host anywhere)
```

## Filming tips

One player, whole body in frame. For batting, film side-on from square of the wicket at waist height; for bowling, side-on at the popping crease or from behind the bowler's arm. Use 60 fps or more if the phone allows: release and impact last a few hundredths of a second.

## How it works

```
video ──▶ pose model ──▶ 33 body landmarks per frame, 2D + 3D
      ──▶ src/core: clean gaps ▸ find shots (hands speed) or deliveries (bowling-wrist speed)
          ▸ classify ▸ pick phase frames (foot plants, highest hands, release peak)
          ▸ measure in 3D ▸ evaluate coach rules ▸ key points + callouts
      ──▶ React screens: session, coach editing, compare, progress, drills, export
```

| Folder | What lives there |
| --- | --- |
| `src/core` | The analysis core: pure TypeScript, unit-tested (`npm test`). Detection, phases, metrics, biomechanics, rules. |
| `src/pose` | Runs the pose model frame by frame over the chosen part of the video. |
| `src/render` | Overlays, the 3D studio (`scene3d.ts`, pitch and stumps; `racket3d.ts`, the bat), and exports. |
| `src/drills` | The drill catalogue for every batting and bowling fix. |
| `src/components` | Screens. |
| `src/storage` | Local database (IndexedDB), share files, optional cloud mirror. |
| `src-tauri` | The desktop shell. |

## Known limits in this first version

- **Not yet tuned on real footage.** The core is tested on synthetic shots and deliveries; adjust target ranges in Coach settings after trying real clips.
- **The ball is illustrative.** One camera cannot track the ball; the studio draws it arriving at the measured impact point (or leaving the measured release point) along a typical line.
- **The bat is estimated**, from the line between the two hands and the bottom forearm.
- **Pace vs spin** is read from bowling-hand speed; re-label by hand when it is wrong.
- One camera, one player per clip.

## Licences

MediaPipe Pose (Apache 2.0). The studio's 3D figure is the "Superhero Male" body from Quaternius' Universal Base Characters (CC0); see `public/studio/CREDITS.txt`.
