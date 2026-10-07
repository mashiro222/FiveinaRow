const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
module.exports = async function beforePack(context) {
  const directory = path.join(context.packager.projectDir, 'native', 'rapfi');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const arch = {1: 'x64', 3: 'arm64'}[context.arch];
  if (manifest.arch !== arch || manifest.platform !== context.electronPlatformName) {
    throw new Error(`Build Rapfi for ${context.electronPlatformName} ${arch} first: pnpm build:engine --arch=${arch}`);
  }
  const executable = context.electronPlatformName === 'win32' ? 'pbrain-rapfi.exe' : 'pbrain-rapfi';
  fs.accessSync(path.join(directory, executable));
  for (const [file, expected] of Object.entries(manifest.files)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex');
    if (actual !== expected) throw new Error(`Rapfi file corrupted: ${file}`);
  }
};
