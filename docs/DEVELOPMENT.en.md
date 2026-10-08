# Development and validation

[中文](DEVELOPMENT.md) · [English](DEVELOPMENT.en.md) · [Back to the project](../README.en.md)

## Run from source

Requirements: Node.js 24 or a newer compatible version, pnpm 11.25.0, CMake 3.20+, and a C++17 compiler. On macOS, install Xcode Command Line Tools. On Windows, install Visual Studio C++ tools, the Windows SDK and ClangCL.

The pinned Rapfi source and pretrained weights are included in the repository. Building the engine requires no model download or training; installing JavaScript dependencies does require network access.

```sh
git clone https://github.com/mashiro222/FiveinaRow.git
cd FiveinaRow
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm build:engine
pnpm start
```

A browser preview supports the UI and local two-player mode. The native AI requires the desktop app.

```sh
pnpm dev
# Open http://127.0.0.1:5173
```

## Tests and packaging

```sh
pnpm test                 # Rules, protocols, opening data, migrations and statistics
pnpm test:native          # Real NNUE loading, tactics, forbidden moves and cancellation
pnpm test:ui              # Electron end-to-end tests; requires a desktop environment
pnpm test:study           # Every opening, rule and branch, plus continuation practice
pnpm test:appearance      # Stone centers against actual grid intersections
pnpm test:online          # Two players, one spectator and LAN-host controls
pnpm test:public          # Real public-service acceptance test; requires internet
pnpm benchmark:ai         # Paired-color matches against the former JavaScript AI
pnpm benchmark:strength   # Practice strengths 0 / 20 against full-strength Rapfi
pnpm build:openings       # Recompute the opening library; slow and resumable
pnpm server              # Standalone room service, default port 8787
pnpm dist:mac            # Build .dmg and .zip on macOS
pnpm dist:win            # Build Windows Setup and Portable packages on Windows
```

Build the native engine before packaging. For Intel Mac cross-compilation, run `pnpm build:engine --arch=x64` and package with `pnpm exec electron-builder --mac --x64 --publish never`. The packaging hook rejects a mismatched engine platform or architecture. See [the bundled engine guide](../third_party/rapfi/README.md) for build details.

Packages are written to `release/`. UI tests use separate temporary user-data directories and do not modify your normal game saves. Test screenshots go to `test-results/`. Opening analysis is a separate maintenance task, not part of ordinary packaging.

GitHub Actions runs unit tests, a container smoke test, native-engine tests, desktop tests and packaging. Desktop/native execution runs on macOS ARM64 and Windows x64; the Intel Mac artifact is cross-compiled and its bundle signature is checked.

For a release, first update the application, service-package and displayed versions together, then push an unused `v*` tag. The workflow publishes installers only after every build succeeds. Never move an existing release tag. `vX.Y.Z` below is a placeholder:

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

Mac packages have an ad-hoc signature but no Apple Developer certificate or notarization. Windows packages do not have a commercial code-signing certificate.

## Project map

| Location | Responsibility |
| --- | --- |
| `src/engine.js` | Five-in-a-row detection, fours, recursive open-three and forbidden-move checks |
| `src/ai.js` | Engine identity, practice strength, hints and search budgets |
| `electron/rapfi.cjs` | Native engine processes, model checks and protocol adapter |
| `electron/rapfi-pv.cjs` | Complete multi-PV iterations and candidate parsing |
| `electron/main.cjs` / `preload.cjs` | Sandboxed windows, local protocol and restricted IPC |
| `third_party/rapfi/` | Pinned source archive, official networks and licenses |
| `scripts/build-engine.mjs` | Native engine builds and integrity manifests |
| `src/state.js` | Games, undo, records, persistence and migration |
| `src/openings.js` / `opening-lines.js` / `study.js` | Named openings, precomputed branches and study interactions |
| `src/app.js` / `style.css` | UI, themes and interaction |
| `src/online.js` / `online-client.js` | Rooms, spectators, clocks, reconnection and local evaluation |
| `server/` | Authoritative room service, lifecycle and deployment |
| `reports/` | Raw engine analysis and benchmark records |

## Rules, records and storage

Freestyle permits five or more stones in a row for either player. With forbidden moves enabled, Black needs exactly five and White may also win with an overline. An exact Black five takes precedence under RIF rule 9.2. Open-three detection recursively checks whether the extension to an open four is legal. Illegal Black moves are blocked and can be retried, rather than immediately losing as they would under tournament penalties. Black loses if no legal move remains.

The app uses unrestricted placement from the start. It does not implement swap protocols, five-move/two-proposal openings or Swap2. Non-15×15 forbidden-move games in local two-player mode are casual extensions; Rapfi's Renju models require 15×15. See [the RIF rules](https://www.renju.net/rifrules/), especially sections 3 and 9.

Win rate is wins divided by completed qualifying games, including draws. Hints, undo and opening practice exclude a game from this statistic. Resignation records a result; abandoning an unfinished game does not. Practice-opponent and full-strength games are separate, with optional practice-strength filtering. Each group aggregates colors, board sizes, rules and thinking budgets, while individual records preserve those settings and the engine identity. Historical pre-Rapfi records remain available but do not enter Rapfi statistics.

Electron stores application data in its per-user data directory. Uninstalling the app typically leaves this data behind. Exported JSON is a readable backup; the app does not yet import it. Offline play uses no remote assets or telemetry. Online rooms send names, actions and room state to the selected service; evaluation remains local.

The renderer has Node integration disabled, context isolation and sandboxing enabled, and a content security policy. Native search uses separate child processes. Undo, new games and window closure cancel obsolete searches. Model files are checked against SHA-256 manifests at engine startup; failures are shown rather than silently falling back to a weaker AI.

## Engine validation

The bundled engine is Rapfi revision `3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7`, with official networks revision `e32ad77a5364363b3e3a02b3f9e8610ade19ea98`. Its public project achieved first place in five categories (freestyle 20×20, freestyle 15×15, fastgame, standard and Renju) of [Gomocup 2025](https://gomocup.org/results/gomocup-result-2025/). Different hardware, versions and search budgets mean this integration does not claim identical tournament strength or guaranteed wins.

The [legacy-AI regression match](../reports/ai-match.json) used four fixed openings with paired colors: four freestyle and four forbidden-move games. Rapfi had 0.4 seconds per move and two threads; the former highest-level JavaScript AI had 2.2 seconds and one JS thread. Rapfi won all eight, without reaching the move cap. This is a small regression comparison, not an Elo estimate.

Practice mode uses Rapfi's native [SkillMovePicker](https://github.com/dhbloo/rapfi/blob/3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7/Rapfi/search/skill.h). For ordinary search, strength 0 caps the main iteration depth at 4, strength 20 at 7, and strength 100 disables this cap. Neural evaluation and tactical search remain active, so even low strength can find obvious wins. Changing strength or requesting a full-strength hint restarts the search process, preventing stronger cached analysis from carrying into weaker play.

The [practice-strength regression match](../reports/coach-match.json) paired colors on one freestyle and one forbidden-move opening, testing strengths 0 and 20 against full strength. Both sides received one second per move, two threads and a 64 MB search table. Full strength won all eight. This verifies a difference on those positions; it does not calibrate a human win rate, and randomized practice move selection can produce different results.

## Opening analysis

Names and the first three plies follow the [RIF opening diagrams](https://www.renju.net/openings/). For each of 26 openings under each of two rule sets, full-strength Rapfi searches for 30 seconds with six candidates, two threads and a 256 MB search table. If too few good branches remain, additional searches use the same settings at later positions, before White's sixth or Black's fifth move.

The selection keeps candidates within 200 evaluation units **and** eight percentage points of the best engine-estimated win rate for the same searched position. It removes symmetry duplicates that preserve the named three-ply prefix, uses deeper follow-up searches to replace older continuations, and keeps at most three branches per opening/rule combination. There are 149 retained branches, each exactly six plies long including the named opening.

Raw search data and settings are in [root analysis](../reports/opening-analysis.json) and [continuation analysis](../reports/opening-extra-analysis.json). They are finite search results, not solver-certified optimal lines or complete forced-win proofs. Depth, hardware and time budgets can change the result. Step descriptions explain verifiable geometric relationships and do not claim to reveal the neural network's reasoning.

## Licenses and security

The application code is MIT-licensed; the separate Rapfi engine is GPL-3.0-or-later and its official neural networks are CC0-1.0. Installers include the corresponding engine source, build instructions and licenses. See [third-party notices](../THIRD_PARTY_NOTICES.md) and [security notes](../SECURITY.md).
