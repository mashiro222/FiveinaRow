import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_PATH || 'sharp');
await sharp(await fs.readFile('assets/favicon.svg')).resize(1024,1024).png().toFile('assets/icon.png');
