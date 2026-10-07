import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arch = process.argv.find(v=>v.startsWith('--arch='))?.split('=')[1] || process.arch;
if (!['arm64','x64'].includes(arch)) throw new Error('Supported architectures: arm64, x64');
const cmake = process.env.CMAKE || 'cmake';
const source = path.join(root,'.runtime','rapfi-vendored');
const build = path.join(root,'.runtime',`rapfi-${process.platform}-${arch}`);
const output = path.join(root,'native','rapfi');
const upstream = path.join(root,'third_party','rapfi');
const run = (cmd,args,options={}) => { const r=spawnSync(cmd,args,{stdio:'inherit',...options});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} failed (${r.status})`); };
await fs.mkdir(source,{recursive:true});await fs.mkdir(output,{recursive:true});
run(cmake,['-E','tar','xzf',path.join(upstream,'source.tar.gz')],{cwd:source});
const args=['-S',path.join(source,'rapfi','Rapfi'),'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DNO_COMMAND_MODULES=ON','-DENABLE_LTO=ON',
  '-DUSE_AVX2=OFF','-DUSE_AVX512=OFF','-DUSE_BMI2=OFF','-DUSE_VNNI=OFF',`-DUSE_SSE=${arch==='x64'?'ON':'OFF'}`,`-DUSE_NEON=${arch==='arm64'?'ON':'OFF'}`,`-DUSE_NEON_DOTPROD=${arch==='arm64'?'ON':'OFF'}`];
if(process.platform==='darwin')args.push('-DCMAKE_C_COMPILER=clang','-DCMAKE_CXX_COMPILER=clang++',`-DCMAKE_OSX_ARCHITECTURES=${arch==='arm64'?'arm64':'x86_64'}`,'-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0');
if(process.platform==='win32')args.push('-A',arch==='x64'?'x64':'ARM64','-T','ClangCL','-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded');
run(cmake,args);run(cmake,['--build',build,'--config','Release','--parallel',String(Math.min(6,os.availableParallelism()))]);
const executable=process.platform==='win32'?'pbrain-rapfi.exe':'pbrain-rapfi';
const compiled=path.join(build,process.platform==='win32'?'Release':'',executable);
await fs.copyFile(compiled,path.join(output,executable));
if(process.platform!=='win32')await fs.chmod(path.join(output,executable),0o755);
const files=['config.toml','model210901.bin','mix9svqfreestyle_bsmix.bin.lz4','mix9svqrenju_bs15_black.bin.lz4','mix9svqrenju_bs15_white.bin.lz4'];
for(const file of files){const src=file==='config.toml'?path.join(upstream,file):file==='model210901.bin'?path.join(upstream,'rapfi-model210901.bin'):path.join(upstream,'networks',file);await fs.copyFile(src,path.join(output,file));}
// The executable is signed by electron-builder on macOS, which changes its hash.
// Verify config and pretrained weights at runtime; OS code signing seals binaries.
const hashes={};for(const file of files)hashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(output,file))).digest('hex');
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({engineId:'rapfi-nnue-3c94c2a-e32ad77',platform:process.platform,arch,sourceCommit:'3c94c2a976f24a0dd1c5517623e9ab6fffe66bd7',networksCommit:'e32ad77a5364363b3e3a02b3f9e8610ade19ea98',files:hashes},null,2)+'\n');
console.log(`Rapfi NNUE ready: ${process.platform} ${arch}`);
