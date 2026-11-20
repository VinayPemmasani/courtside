# Vidrio

Padel stroke analysis for players and coaches. Import a phone video of a rally, drill or match and Vidrio:

- tracks the player's body in every frame (MediaPipe Pose, on the device, nothing uploaded),
- finds each shot and labels it: forehand, backhand, volley, **bandeja**, **víbora**, smash, lob, **off the back glass**, and the **underhand serve**,
- splits it into numbered phases (groundstrokes: Ready, Unit Turn, Backswing, Paddle Drop, Contact, Follow-Through; overheads: Ready, Turn, Paddle Up, Contact, Finish; serve: Ready, Ball Drop, Backswing, Contact, Follow-Through; volleys: Ready, Turn, Contact, Finish),
- measures angles at each phase (shoulder turn, elbow, knee bend, contact in front, contact height and side, finish),
- writes key points against coach-tunable target ranges set for padel (compact take-backs, bandeja in front with a slightly bent arm, víbora contact to the side, serve contact at or below the waist), and draws callouts on the frame,
- links every fix to on-court drills, off-court drills and everyday cross-training, each shown as a 3D demo.

**3D studio.** The stroke is rebuilt as a 3D athlete holding a padel paddle (455 mm, perforated face) inside a 10 × 20 m court with glass back and side walls, mesh fence and a 0.88 m net.

**Line calls.** Tap the four floor corners of the back glass once and Vidrio calls each bounce: rally balls against the walls, serves against the service boxes (service lines 6.95 m from the net).

**Strike lab.** Paddle face against the bounce stage (rising, peak, falling, read from the distance to the back glass), drive against lift, and the flight over the 0.88 m net.

Vidrio is built from the Courtside codebase (same architecture: Tauri 2 desktop app, React + TypeScript + Vite front end, three.js studio, vitest tests).

## Run it

Needs Node 20+ and, for the desktop app, Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
npm install          # also downloads the pose models into public/models
npm run dev          # browser version at http://localhost:1420
npm run tauri dev    # desktop window with hot reload
npm run tauri build  # installer for this OS (.msi / .dmg / .AppImage)
npm test             # analysis core tests
```

The GitHub Actions workflow in `.github/workflows/desktop.yml` runs the tests and builds Windows, macOS and Linux installers on every push.

## Filming tips

One player, whole body in frame, filmed from the side or from behind, at 60 fps if the phone allows. Trim the clip to the strokes you want on the import screen.

## How it works

```
video ──▶ pose model (MediaPipe Pose, in the app) ──▶ 33 body landmarks per frame, 2D + 3D
      ──▶ src/core: clean gaps ▸ find swings from hitting-hand speed ▸ classify ▸ pick phase frames
          ▸ measure angles in 3D ▸ evaluate coach rules ▸ key points + callouts
      ──▶ React screens: breakdown, coach editing, compare, progress, export
```

| Folder | What lives there |
| --- | --- |
| `src/core` | The analysis core: pure TypeScript with no DOM, unit-tested (`npm test`). Stroke detection, phases, metrics, rules. |
| `src/pose` | Runs the pose model frame by frame over the chosen part of the video. |
| `src/render` | Canvas drawing (skeleton glow, hand trail, callouts, phase headers), the 3D studio (`scene3d.ts`, three.js) and its headline layers (`studio.ts`), and exports, including coach reels (`reel.ts`). |
| `src/components` | Screens: players, import, breakdown, compare, progress, coach settings. |
| `src/storage` | Local database (IndexedDB) for players, sessions, videos and coach rules. |
| `src-tauri` | The desktop shell: window, native save dialog. |

Measurements use the model's 3D landmarks (metres, centred on the hips), so they do not depend on how far the camera is. Contact is taken as the peak of hitting-hand speed relative to the hips.

## Known limits in this first version

- **Not yet tuned on real footage.** The core is tested on synthetic swings; the default target ranges in Coach settings are broad starting points to adjust after trying real clips.
- **The 3D ball flight is illustrative.** One camera cannot measure the ball's depth, so the studio draws the ball arriving at the measured contact point and leaving in the direction of the swing; the contact point and direction come from the video, the arc does not.
- **The paddle is estimated, not detected.** Its position extends the hand and forearm direction, so the paddle path is an approximation; contact still comes from hand speed and can be a frame or two off.
- **Weight transfer** is the centre of mass (from body-segment weights) projected between the ankles. It reads best when both feet are visible and apart.
- **Stroke labels are heuristics.** Bandeja, víbora and smash are separated by contact height, arm extension and how far the hand cuts across; serve by contact below the waist after a ball drop; off-the-glass shots are not told apart from ordinary groundstrokes automatically. Re-label by hand when it guesses wrong.
- **Wall bounces are not tracked.** Line calls use the floor bounce only.
- **Vertical video export** depends on the system's video encoder; it is hidden where the desktop webview does not support recording (some Linux setups). Images and PDF work everywhere.
- **Bounces are tapped, not detected.** Vidrio does not track the ball automatically yet; line calls are as precise as the tapped point and the court calibration. Shot speed is ground distance over time from contact to the bounce, so it reads a little below a radar gun.
- Only one camera, one player per clip; match stats from rally video are planned as phase 2.

## Website

`website/` is the Vidrio marketing and FAQ site: one static `index.html` with its screenshots in `website/img`. Open it directly or host the folder on any static host (GitHub Pages, Netlify). The download button points at this repository's Releases page; the price section says "free during early access", so change it there if that changes.

## Licences

MediaPipe Pose (Apache 2.0) is the pose model; no AGPL components are used.

The studio's 3D figure is the "Superhero Male" body from Quaternius' Universal Base Characters (CC0),
shown in matte clay with clothes built over it; see `public/studio/CREDITS.txt`.
