# Bundled Rapfi

Upstream source: https://github.com/dhbloo/rapfi/tree/3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7

Official weights: https://github.com/dhbloo/rapfi-networks/tree/e32ad77a5364363b3e3a02b3f9e8610ade19ea98

`source.tar.gz` is a `git archive` of the exact upstream source commit, with the prefix `rapfi/`. The engine code is unmodified. All code needed for the native engine build is included. Unused upstream submodules are not needed by this build. Licenses of bundled dependencies remain within the source archive. `COPYING.txt` is the GPL-3.0 license; the source specifies GPL-3.0-or-later. Neural weights use CC0-1.0 in `NETWORKS-LICENSE.txt`.

Application configuration selects Mix9SVQ neural evaluation and UCI-like progress messages. The unused standard-rule neural-network entry is omitted; the application offers freestyle and Renju. All model paths are relative to the native executable's working directory. Full-strength play uses strength 100 with no artificial handicap. The optional practice opponent uses the engine's native `INFO STRENGTH` setting (0–90, default 20). Hints and online evaluations always use strength 100; opening practice lets the player choose either opponent.

## Build from the repository

Requirements: Node.js 24+, CMake 3.20+, and a C++17 toolchain (Apple Clang on macOS; Visual Studio C++ tools with ClangCL and a Windows SDK on Windows). No neural-network training, Python inference runtime, GPU, or network fetch is needed by the engine build.

```sh
node scripts/build-engine.mjs --arch=arm64  # Apple Silicon
node scripts/build-engine.mjs --arch=x64    # Intel Mac / Windows x64
```

Run on the target operating system. macOS supports cross-compiling the two Mac architectures; use the matching architecture when testing the result. Set `CMAKE` to the path of CMake if it is not on `PATH`. Outputs go to `native/rapfi/`; never use a binary built for another platform or architecture. Packaging verifies this manifest.

## Build from an installed source bundle

Extract `source.tar.gz`; configure and build the extracted `rapfi/Rapfi` project with CMake. The included `build-engine.mjs` records the exact flags, file copies and integrity-manifest generation used for the distributed engine. In particular, use Release, LTO and `NO_COMMAND_MODULES=ON`. On Apple Silicon enable NEON and NEON_DOTPROD, disable SSE/AVX2/AVX512/BMI2/VNNI. On x64 enable SSE, disable NEON/NEON_DOTPROD/AVX2/AVX512/BMI2/VNNI. The x64 binary uses SSE4.1 and avoids requiring AVX2. macOS targets macOS 12 or later. Windows uses ClangCL and the static multithreaded runtime.

The three pretrained weights, classical model, configuration and manifest are already supplied beside the installed executable in `resources/rapfi/`. Copy the newly built executable there to use your build, or reconstruct the repository layout described by `build-engine.mjs`. On macOS, modifying the installed application requires signing your modified bundle again or running the engine separately. The executable accepts the standard Piskvork text protocol over stdin/stdout.
