import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test', 'tests/rapfi.test.js'], {
  stdio: 'inherit', env: {...process.env, YIJIAN_NATIVE_TEST: '1'}
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
