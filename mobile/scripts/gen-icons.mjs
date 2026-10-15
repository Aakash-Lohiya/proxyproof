// Renders the ProxyProof logo SVG into every PNG asset Expo needs.
//   node scripts/gen-icons.mjs   (run from mobile/)
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets');
const mark = readFileSync(join(here, 'logo.svg'), 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '');
const BG = '#0B1020';

function svg({ size, bg, padding, mono = false }) {
  const inner = size - padding * 2;
  const body = mono
    ? mark.replace(/fill="url\(#ppShield\)"/g, 'fill="#FFFFFF"').replace(/fill="url\(#ppShade\)"/g, 'fill="none"')
    : mark;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${bg}" rx="${bg === 'none' ? 0 : size * 0.22}"/>` : ''}
    <g transform="translate(${padding} ${padding}) scale(${inner / 120})">${body}</g>
  </svg>`;
}

function render(name, opts) {
  const png = new Resvg(svg(opts), { fitTo: { mode: 'width', value: opts.size } }).render().asPng();
  writeFileSync(join(out, name), png);
  console.log('wrote', name, `${opts.size}px`);
}

render('icon.png', { size: 1024, bg: BG, padding: 120 });
render('android-icon-foreground.png', { size: 1024, bg: null, padding: 256 });
render('android-icon-monochrome.png', { size: 1024, bg: null, padding: 256, mono: true });
render('splash-icon.png', { size: 512, bg: null, padding: 40 });
render('favicon.png', { size: 64, bg: BG, padding: 6 });
// solid background layer for the adaptive icon
writeFileSync(join(out, 'android-icon-background.png'),
  new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`).render().asPng());
console.log('wrote android-icon-background.png 1024px');
