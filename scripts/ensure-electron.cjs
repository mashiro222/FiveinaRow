const { spawnSync } = require('node:child_process');

// Electron downloads lazily when required. Retry that network-only setup step
// separately; never retry or suppress a failed application test.
(async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = spawnSync(process.execPath, ['-e', "console.log(require('electron'))"], { stdio: 'inherit' });
    if (result.status === 0) return;
    if (attempt === 3) process.exit(result.status || 1);
    console.log(`Electron download did not finish; retrying setup (${attempt}/3).`);
    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
  }
})();
