<div align="center">

# Yijian · Five in a Row

**A quiet board. A world of possibilities.**

A Gomoku desktop game for a thoughtful match: play a friend locally or online, challenge an offline Rapfi AI, and explore opening variations.

[简体中文](README.md) · **English**

[![Latest release](https://img.shields.io/github/v/release/mashiro222/FiveinaRow?color=496b56&label=release)](https://github.com/mashiro222/FiveinaRow/releases/latest)
[![Build status](https://github.com/mashiro222/FiveinaRow/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/mashiro222/FiveinaRow/actions/workflows/build.yml)
![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-697965)

[Download](https://github.com/mashiro222/FiveinaRow/releases/latest) · [Development](docs/DEVELOPMENT.en.md) · [Report an issue](https://github.com/mashiro222/FiveinaRow/issues)

</div>

![Yijian v1.4.1: a match against Rapfi on the wooden board](assets/screenshot.png)

> **The game interface is currently in Chinese.** The language links switch the project documentation only. Screenshots show v1.4.1.

## Download and play

Open the **[latest release](https://github.com/mashiro222/FiveinaRow/releases/latest)** and choose a file under **Assets**. You do not need the source code or development tools.

| Your computer | Download | Getting started |
| --- | --- | --- |
| Apple Silicon Mac (M-series) | `Five-in-a-Row-VERSION-mac-arm64.dmg` | Open and drag the app to Applications |
| Intel Mac | `Five-in-a-Row-VERSION-mac-x64.dmg` | Open and drag the app to Applications |
| Windows 64-bit | `Five-in-a-Row-VERSION-win-x64-Setup.exe` | Run the installer |
| Windows 64-bit, no installation | `Five-in-a-Row-VERSION-win-x64-Portable.exe` | Download and run |

Free to play, with no account required. The AI, opening library and themes are included in the download; offline modes need no internet connection.

<details>
<summary>Seeing a system warning on first launch?</summary>

The app is not Apple-notarized or signed with an Apple Developer or Windows code-signing certificate. Mac bundles have an ad-hoc signature for file integrity.

Download from this repository's Releases page. If macOS blocks the app after you attempt to open it, use **System Settings → Privacy & Security → Open Anyway**. Windows may show a SmartScreen prompt. Do not disable system-wide security protection.

</details>

## Choose your game

| Feature | What you can do |
| --- | --- |
| **Local two-player** | Share one computer and take turns |
| **Online rooms** | Share a four-digit room code, choose a name and take a seat; two people play while others watch. Select forbidden-move rules and a 30-second, 60-second or 2-minute limit per move |
| **Offline AI** | Challenge full-strength Rapfi or choose a practice opponent with strength 0–90; the default is 20 and can be lowered |
| **Opening study** | Explore 26 named openings and 149 six-ply variations, then continue from the displayed position |
| **Custom themes** | Mix boards, backgrounds and stones across wood, notebook paper, slate and pale-green styles; use × / ○ marks on paper |
| **Records and replay** | Keep up to 1,000 AI game records locally, with separate practice-opponent and full-strength statistics, move replay and JSON export |

Also includes 13×13, 15×15 and 19×19 boards, optional Black forbidden moves, undo, hints, move numbers, sound and keyboard controls. AI games with forbidden moves use 15×15; online games always use 15×15.

### Play a friend

1. Both players open **联机房间** (Online rooms) and use the built-in public service.
2. One creates a room with **创建房间**; the other enters its four-digit code.
3. Choose names and Black/White seats. The host sets the rules, and both players select **准备开始** (Ready).

The free service may take about a minute to wake up; the app waits and retries. A service restart clears rooms, and empty rooms expire after 10 minutes. Room codes are join codes, not private passwords. LAN hosting and self-hosting are also supported. The [online deployment guide](docs/ONLINE.md) is currently in Chinese.

### Study a position, then make it your own

![Yijian v1.4.1: numbered ×/○ stones and opening variations on notebook paper](assets/study.png)

The names and first three plies of the 26 openings follow the [Renju International Federation diagrams](https://www.renju.net/openings/). Full-strength Rapfi supplies plies 4–6, analyzed separately for freestyle and Black forbidden-move rules: **149 six-ply variations** in total. Each opening/rule combination has up to three filtered variations; a few retain only one or two.

Select board markers, compare branches and step through the moves. Continue as Black or White against the practice opponent or full-strength Rapfi. The library is precomputed and works offline.

These are useful results from finite searches, **not certified optimal lines or proofs of a forced win**. See the [analysis method and source data](docs/DEVELOPMENT.en.md#opening-analysis).

## AI, rules and statistics

- **Rapfi:** the [native engine](https://github.com/dhbloo/rapfi) and [official pretrained Mix9SVQ NNUE networks](https://github.com/dhbloo/rapfi-networks) run on your CPU. The practice opponent uses the engine's native strength control; full strength is 100. These values are neither win percentages nor Elo ratings.
- **Thinking budget:** choose 0.5, 1, 3, 10, 30 or 60 seconds per move. Defaults are 1 second for practice and 10 seconds for full strength; the engine may move early. Hints always use full strength and at least a 10-second budget.
- **Optional forbidden moves:** Black cannot play double-threes, double-fours or overlines; an exact five takes precedence. Illegal moves are blocked and can be retried. Swap openings, five-move/two-proposal protocols and Swap2 are not implemented, so this is not a complete tournament opening system. Under freestyle rules, five or more in a row wins for either side.
- **Recorded win rate:** wins divided by all rated games, including draws. Games using hints, undo or opening practice are excluded. Practice-opponent and full-strength records are separate; local and online games do not enter AI statistics. Abandoning an unfinished game is not recorded as a result.
- **Online evaluation:** each player's local full-strength Rapfi estimates Black/White chances. The display can be hidden, does not choose moves for players, and is not a guarantee of winning.

## Data and privacy

Offline modes request no remote resources and include no telemetry. Settings, games and statistics stay on your computer. JSON export is available for readable backups; importing them is not yet supported.

Online play sends player names, game actions and room state to the selected room service. Rapfi still runs locally. Rooms are held in server memory and do not survive restarts. See the [development guide](docs/DEVELOPMENT.en.md) and [security notes](SECURITY.md).

## Development and credits

Built with Electron, vanilla JavaScript and a separate native Rapfi process. The room service uses Node.js and WebSocket. See the **[development guide](docs/DEVELOPMENT.en.md)** for building, testing, packaging and engine validation.

Thanks to [Rapfi](https://github.com/dhbloo/rapfi) and its contributors for the engine and pretrained models, and to the [Renju International Federation](https://www.renju.net/) for rules and opening references.

The application's own code uses the [MIT License](LICENSE). The bundled Rapfi engine is **GPL-3.0-or-later** and the official neural-network weights are **CC0-1.0**. Installers include the corresponding engine source and licenses. See [third-party notices](THIRD_PARTY_NOTICES.md) for component-specific terms.
