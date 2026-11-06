// Renders a social cover image for the project: logo + wordmark on the left,
// a phone showing the animated loading screen (frozen mid-animation) on the right.
//   node scripts/gen-cover.mjs   (run from mobile/) -> ../cover.png
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mark = readFileSync(join(here, 'logo.svg'), 'utf8').replace(/<svg[^>]*>/, '').replace('</svg>', '')
  .replace(/id="ppShield"/g, 'id="g1"').replace(/id="ppShade"/g, 'id="g2"').replace(/url\(#ppShield\)/g, 'url(#g1)').replace(/url\(#ppShade\)/g, 'url(#g2)');

const W = 1600, H = 900;
const FONT = "'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif";
const logoAt = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 120})">${mark.replace(/#g1/g, `#g1${id}`).replace(/#g2/g, `#g2${id}`).replace(/id="g1"/, `id="g1${id}"`).replace(/id="g2"/, `id="g2${id}"`)}</g>`;

const chip = (x, y, label, icon) => `
  <g transform="translate(${x} ${y})">
    <rect width="${label.length * 11.5 + 58}" height="44" rx="22" fill="#141D36" stroke="#243052"/>
    <circle cx="24" cy="22" r="7" fill="${icon}"/>
    <text x="42" y="28" font-family="${FONT}" font-size="18" font-weight="600" fill="#C9D3F2">${label}</text>
  </g>`;

// Phone frame geometry
const PX = 1070, PY = 90, PW = 380, PH = 760, R = 48;
const SX = PX + 14, SY = PY + 14, SW = PW - 28, SH = PH - 28;
const cx = SX + SW / 2, cy = SY + 290;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E1733"/><stop offset="0.55" stop-color="#0B1020"/><stop offset="1" stop-color="#070B16"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#4F8CFF" stop-opacity="0.35"/><stop offset="1" stop-color="#4F8CFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#22D3EE" stop-opacity="0.28"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient>
    <linearGradient id="phoneEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A4668"/><stop offset="1" stop-color="#161D33"/></linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4F8CFF"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>
    <clipPath id="screen"><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="${R - 14}"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="#000" flood-opacity="0.55"/></filter>
  </defs>

  <!-- background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="260" cy="180" r="420" fill="url(#glowA)"/>
  <circle cx="1250" cy="760" r="380" fill="url(#glowB)"/>
  <!-- faint signal arcs across the canvas -->
  <g fill="none" stroke="#4F8CFF" stroke-opacity="0.10" stroke-width="2">
    <path d="M 700 -100 A 700 700 0 0 1 700 1000"/><path d="M 780 -100 A 620 620 0 0 1 780 1000"/><path d="M 860 -100 A 540 540 0 0 1 860 1000"/>
  </g>
  <!-- dotted grid -->
  <g fill="#FFFFFF" fill-opacity="0.045">${Array.from({ length: 22 }, (_, i) => Array.from({ length: 12 }, (_, j) => `<circle cx="${80 + i * 70}" cy="${70 + j * 70}" r="1.6"/>`).join('')).join('')}</g>

  <!-- left: brand -->
  ${logoAt(120, 150, 150, 'L')}
  <text x="300" y="235" font-family="${FONT}" font-size="78" font-weight="800" fill="#F2F5FF" letter-spacing="-2">Proxy<tspan fill="#4F8CFF">Proof</tspan></text>
  <text x="304" y="282" font-family="${FONT}" font-size="20" font-weight="700" fill="#9AA6C7" letter-spacing="7">PROOF OF PRESENCE</text>

  <text x="120" y="400" font-family="${FONT}" font-size="46" font-weight="700" fill="#F2F5FF" letter-spacing="-1">Bluetooth attendance</text>
  <text x="120" y="456" font-family="${FONT}" font-size="46" font-weight="700" fill="#F2F5FF" letter-spacing="-1">that proxies can't beat.</text>
  <text x="120" y="512" font-family="${FONT}" font-size="22" fill="#9AA6C7">Students are marked automatically when their phone hears the organiser's</text>
  <text x="120" y="544" font-family="${FONT}" font-size="22" fill="#9AA6C7">beacon. Tokens rotate every 5 seconds. One device, one student.</text>

  ${chip(120, 600, 'Rotating BLE tokens', '#4F8CFF')}
  ${chip(372, 600, 'Device binding', '#22D3EE')}
  ${chip(578, 600, 'Live dashboard', '#34D399')}
  ${chip(120, 660, 'Firebase backend', '#F59E0B')}
  ${chip(352, 660, 'Expo · React Native', '#A78BFA')}
  ${chip(606, 660, 'CSV export', '#FB7185')}

  <text x="120" y="790" font-family="${FONT}" font-size="18" fill="#5F6B8C">github.com/Aakash-Lohiya/proxyproof</text>

  <!-- right: phone with the loading screen -->
  <g filter="url(#shadow)">
    <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="${R}" fill="url(#phoneEdge)"/>
    <rect x="${PX + 4}" y="${PY + 4}" width="${PW - 8}" height="${PH - 8}" rx="${R - 4}" fill="#0B1020"/>
  </g>
  <g clip-path="url(#screen)">
    <rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" fill="#0B1020"/>
    <!-- beacon rings mid-animation -->
    <circle cx="${cx}" cy="${cy}" r="150" fill="none" stroke="#4F8CFF" stroke-width="2" stroke-opacity="0.12"/>
    <circle cx="${cx}" cy="${cy}" r="112" fill="none" stroke="#4F8CFF" stroke-width="2" stroke-opacity="0.28"/>
    <circle cx="${cx}" cy="${cy}" r="78" fill="none" stroke="#4F8CFF" stroke-width="2" stroke-opacity="0.5"/>
    <circle cx="${cx}" cy="${cy + 2}" r="66" fill="#4F8CFF" fill-opacity="0.14"/>
    ${logoAt(cx - 60, cy - 60, 120, 'P')}
    <text x="${cx}" y="${cy + 150}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="800" fill="#F2F5FF" letter-spacing="-1">Proxy<tspan fill="#4F8CFF">Proof</tspan></text>
    <text x="${cx}" y="${cy + 180}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="700" fill="#9AA6C7" letter-spacing="4">PROOF OF PRESENCE</text>
    <rect x="${cx - 80}" y="${cy + 225}" width="160" height="5" rx="2.5" fill="#1C2640"/>
    <rect x="${cx - 80}" y="${cy + 225}" width="118" height="5" rx="2.5" fill="url(#bar)"/>
    <text x="${cx}" y="${SY + SH - 44}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#5F6B8C">Bluetooth attendance · no proxies</text>
    <!-- status bar -->
    <text x="${SX + 26}" y="${SY + 34}" font-family="${FONT}" font-size="14" font-weight="600" fill="#F2F5FF">9:41</text>
    <rect x="${SX + SW - 60}" y="${SY + 23}" width="22" height="11" rx="3" fill="none" stroke="#F2F5FF" stroke-opacity="0.8"/>
    <rect x="${SX + SW - 58}" y="${SY + 25}" width="14" height="7" rx="1.5" fill="#F2F5FF"/>
    <circle cx="${SX + SW - 76}" cy="${SY + 28.5}" r="4" fill="none" stroke="#F2F5FF" stroke-opacity="0.8"/>
  </g>
  <!-- notch + home indicator -->
  <rect x="${cx - 52}" y="${SY + 8}" width="104" height="24" rx="12" fill="#0B1020" stroke="#1C2640"/>
  <rect x="${cx - 60}" y="${SY + SH - 14}" width="120" height="5" rx="2.5" fill="#F2F5FF" fill-opacity="0.6"/>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: W * 1.5 }, font: { loadSystemFonts: true } }).render().asPng();
const out = join(here, '..', '..', 'cover.png');
writeFileSync(out, png);
console.log('wrote', out, `${W * 1.5}x${H * 1.5}`);
