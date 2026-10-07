# Third-party engine and pretrained networks

The application's own source is available under the MIT license in `LICENSE`.
The distribution also contains the following separately licensed components.

## Rapfi

- Author: Haobin Lin and the contributors listed in `third_party/rapfi/AUTHORS`.
- Project: https://github.com/dhbloo/rapfi
- Source revision: `3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7`.
- License: GNU GPL version 3 or later; see `third_party/rapfi/COPYING.txt`.
- The unmodified engine runs as a separate native executable, communicating over the Piskvork standard-input/output protocol.
- Complete corresponding engine source, including its bundled dependencies and their notices, is in `third_party/rapfi/source.tar.gz`. Build instructions are in `third_party/rapfi/README.md` and `scripts/build-engine.mjs`.

Installed distributions include this notice, the source archive, authors, licenses, configuration, instructions and build script under `resources/licenses/` (macOS: `Five in a Row.app/Contents/Resources/licenses/`). The compiled engine, configuration, model files and integrity manifest are in the adjacent `rapfi/` directory. The engine source is provided with the binary, without an additional download requirement.

## Official Rapfi neural networks

- Project: https://github.com/dhbloo/rapfi-networks
- Revision: `e32ad77a5364363b3e3a02b3f9e8610ade19ea98`.
- License: CC0 1.0; see `third_party/rapfi/NETWORKS-LICENSE.txt`.
- Included weights: `mix9svqfreestyle_bsmix.bin.lz4`, `mix9svqrenju_bs15_black.bin.lz4`, `mix9svqrenju_bs15_white.bin.lz4`.

The classical `model210901.bin` is supplied from the Rapfi source repository. Neural-evaluator initialization failures are surfaced to the player; the application does not silently play using the classical fallback or the previous JavaScript AI.

Electron and its bundled components retain the license and Chromium notices shipped by Electron. Development dependencies retain their respective licenses.
