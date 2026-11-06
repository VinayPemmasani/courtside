# Courtside

Tennis stroke analysis for players and coaches. Import a video of a forehand, backhand or serve and Courtside:

- tracks the player's body in every frame,
- finds each swing and labels it (forehand, one- or two-handed backhand, serve),
- splits it into numbered phases ("1 Ready, 2 Unit Turn, 3 Backswing, 4 Racket Drop, 5 Contact, 6 Follow-Through"; serves use Trophy instead of Unit Turn and Backswing),
- measures angles at each phase (shoulder turn, hitting-elbow angle, knee bend, contact point, finish),
- writes key points against coach-tunable target ranges, and draws callouts such as "LEFT HAND ON THROAT" on the frame.

**Studio look and coach reels.** Tick *Studio look* to see the session as a 3D studio: the player rebuilt as a jointed, shaded mannequin from the pose's 3D landmarks, standing on a dark virtual court with glowing lines, with the racket path (neon), the ball flight (red), highlight rings on the body, and the weight transfer (a glow under each foot plus a back-foot to front-foot gauge). *Studio video* exports a 1080×1920 reel with bold headlines ("THE PROBLEM / FOREHAND / TURN EARLIER."): a title, each phase in slow motion held with its rings and labels, then the full swing with the weight shift summed up. On the Compare screen, *Export split-screen studio video* puts two strokes side by side, lined up at contact, under labels such as PRO and BEGINNER. Reels are encoded frame by frame (WebCodecs) where the system supports it, so they play at full speed even on slow machines.

**Shot placement and line calls.** Tick *Shot placement*, tap the four singles-court corners once, then tap where each ball lands. Courtside draws the calibrated court over the video, calls each bounce in or out with the margin in centimetres (serves against the service boxes), sorts it as short, mid or deep and left, middle or right, links it to the stroke that hit it and estimates the average ball speed from contact to the bounce. A bounce map and in/deep/speed totals sit beside the video.

**Filming help.** The import screen has a filming guide (tripod height, camera spots behind the baseline or side-on, frame rate). After each analysis a *Filming score* checks the clip: player found, whole body in the picture, player size, frame rate, tilt and camera shake, with what to change next time.

**Session types, sharing and data.** Each session is a rally, ball machine, coach feed, serve practice or match, and the player page filters by type. *Share session* saves one `.courtside` file (video plus analysis) that a teammate opens with *Open a shared session*; *Data (CSV)* exports every stroke metric, key point and bounce.

Coaches can edit any key point or callout, drag labels, move a phase to a different frame, re-label a stroke, mark a missed stroke by hand, compare two strokes lined up at contact, follow a player's progress across sessions, and export a breakdown as a carousel of 1080×1350 images, a PDF report, or a 1080×1920 vertical video.

Courtside is a [Tauri 2](https://v2.tauri.app/) desktop app (Windows, macOS, Linux) with a React and TypeScript interface. All analysis runs on the device; nothing is uploaded.

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
- **The racket is estimated, not detected.** Its position extends the hand and forearm direction, so the racket path is an approximation; contact still comes from hand speed and can be a frame or two off. A racket model is the next planned addition.
- **Weight transfer** is the centre of mass (from body-segment weights) projected between the ankles. It reads best when both feet are visible and apart.
- **Volleys** are not detected automatically; re-label them by hand.
- **Vertical video export** depends on the system's video encoder; it is hidden where the desktop webview does not support recording (some Linux setups). Images and PDF work everywhere.
- **Bounces are tapped, not detected.** Courtside does not track the ball automatically yet; line calls are as precise as the tapped point and the court calibration. Shot speed is ground distance over time from contact to the bounce, so it reads a little below a radar gun.
- Only one camera, one player per clip; match stats from rally video are planned as phase 2.

## Website

`website/` is the Courtside marketing and FAQ site: one static `index.html` with its images and a sample reel in `website/img`. Open it directly or host the folder on any static host (GitHub Pages, Netlify). The download button points at this repository's Releases page; the price section says "free during early access", so change it there if that changes.

## Licences

MediaPipe Pose (Apache 2.0) is the pose model; no AGPL components are used.
