import { mkdir, writeFile } from 'node:fs/promises';
import { STRIX_SPEC } from '../models/strix-definition.mjs';

const output = new URL('../output/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('strix.asset.json', output), `${JSON.stringify(STRIX_SPEC, null, 2)}\n`);
console.log('STRIX asset contract written from models/strix-definition.mjs');
