import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const appSvg = readFileSync('./scripts/icon-app.svg', 'utf-8');
const windowSvg = readFileSync('./scripts/icon-window.svg', 'utf-8');

if (!existsSync('./public')) mkdirSync('./public', { recursive: true });

// App icon: 1024x1024 (pnpm tauri icon の入力用)
const appResvg = new Resvg(appSvg, { fitTo: { mode: 'width', value: 1024 } });
const appPng = appResvg.render().asPng();
writeFileSync('./scripts/icon-app-1024.png', appPng);
console.log('OK: scripts/icon-app-1024.png');

// Window (taskbar) icon: 256x256
const windowResvg = new Resvg(windowSvg, { fitTo: { mode: 'width', value: 256 } });
const windowPng = windowResvg.render().asPng();
writeFileSync('./public/icon-window.png', windowPng);
console.log('OK: public/icon-window.png');
