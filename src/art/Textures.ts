import * as THREE from 'three';

/** Small seeded RNG so procedural art is stable between runs. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tex(c: HTMLCanvasElement, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${h},${s}%,${l}%)`;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, a = 0.08) {
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${a * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Edinburgh sandstone ashlar. tone: hue-ish (25..45), light: base lightness. */
export function drawAshlar(g: CanvasRenderingContext2D, w: number, h: number, seed: number, hue = 35, light = 52, rowH = 28) {
  const r = rng(seed);
  g.fillStyle = hsl(hue, 14, light - 18);
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += rowH) {
    let x = -r() * 60;
    while (x < w) {
      const bw = 50 + r() * 70;
      const l = light - 6 + r() * 12;
      g.fillStyle = hsl(hue + (r() - 0.5) * 8, 10 + r() * 10, l);
      g.fillRect(x + 1.5, y + 1.5, bw - 3, rowH - 3);
      // tooling marks
      g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.05})`;
      g.fillRect(x + 2, y + rowH - 6, bw - 4, 4);
      x += bw;
    }
  }
  speckle(g, w, h, r, w * h * 0.02, 0.12);
  // soot/grime streaks (Auld Reekie!)
  for (let i = 0; i < 26; i++) {
    const x = r() * w, len = h * (0.2 + r() * 0.8);
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(20,18,16,${0.18 + r() * 0.2})`);
    grad.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 6 + r() * 26, len);
  }
}

const cache = new Map<string, any>();
function memo<T>(key: string, fn: () => T): T {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export function ashlarTex(hue = 35, light = 52, seed = 1) {
  return memo(`ash${hue}_${light}_${seed}`, () => {
    const c = canvas(512, 512);
    drawAshlar(c.getContext('2d')!, 512, 512, seed, hue, light);
    return tex(c);
  });
}

export function cobbleTex() {
  return memo('cobble', () => {
    const c = canvas(512, 512);
    const g = c.getContext('2d')!;
    const r = rng(7);
    g.fillStyle = '#2b2a2a';
    g.fillRect(0, 0, 512, 512);
    const rowH = 32;
    for (let y = 0; y < 512; y += rowH) {
      let x = (y / rowH) % 2 ? -20 : -45;
      while (x < 512) {
        const w = 38 + r() * 26;
        const l = 34 + r() * 18;
        g.fillStyle = hsl(25 + r() * 20, 6 + r() * 8, l);
        const rr = 7;
        g.beginPath();
        g.roundRect(x + 2, y + 2, w - 4, rowH - 4, rr);
        g.fill();
        // wet sheen
        g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`;
        g.beginPath();
        g.roundRect(x + 6, y + 5, w * 0.5, 5, 3);
        g.fill();
        x += w;
      }
    }
    speckle(g, 512, 512, r, 9000, 0.15);
    return tex(c);
  });
}

export function flagTex() {
  return memo('flags', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    const r = rng(11);
    g.fillStyle = '#4a4744';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) {
      let x = (y / 64) % 2 ? -30 : 0;
      while (x < 256) {
        const w = 70 + r() * 40;
        g.fillStyle = hsl(30, 5, 52 + r() * 10);
        g.fillRect(x + 2, y + 2, w - 4, 60);
        x += w;
      }
    }
    speckle(g, 256, 256, r, 3000, 0.14);
    return tex(c);
  });
}

export function slateTex() {
  return memo('slate', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    const r = rng(3);
    g.fillStyle = '#23272d';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      let x = (y / 16) % 2 ? -12 : 0;
      while (x < 256) {
        g.fillStyle = hsl(215, 10, 22 + r() * 10);
        g.fillRect(x + 1, y + 1, 22, 14);
        x += 24;
      }
    }
    return tex(c);
  });
}

export function woodTex(hue = 28, light = 30, seed = 5, vertical = true) {
  return memo(`wood${hue}_${light}_${seed}_${vertical}`, () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    const r = rng(seed);
    const n = 6;
    for (let i = 0; i < n; i++) {
      g.fillStyle = hsl(hue + r() * 6, 45, light + r() * 10);
      if (vertical) g.fillRect((i * 256) / n, 0, 256 / n, 256);
      else g.fillRect(0, (i * 256) / n, 256, 256 / n);
      g.fillStyle = 'rgba(0,0,0,.35)';
      if (vertical) g.fillRect((i * 256) / n, 0, 2, 256);
      else g.fillRect(0, (i * 256) / n, 256, 2);
    }
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.06 + r() * 0.08})`;
      g.beginPath();
      if (vertical) {
        const x = r() * 256;
        g.moveTo(x, 0);
        g.bezierCurveTo(x + r() * 6 - 3, 80, x + r() * 6 - 3, 170, x, 256);
      } else {
        const y = r() * 256;
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + r() * 6 - 3, 170, y + r() * 6 - 3, 256, y);
      }
      g.stroke();
    }
    return tex(c);
  });
}

export function barrelTex() {
  return memo('barrel', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    g.drawImage(woodTex(26, 28, 9).image, 0, 0);
    for (const y of [28, 92, 164, 228]) {
      g.fillStyle = '#2a2a2c';
      g.fillRect(0, y - 7, 256, 14);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(0, y - 6, 256, 3);
    }
    g.save();
    g.translate(128, 128);
    g.fillStyle = 'rgba(250,240,210,.85)';
    g.font = 'bold 22px Georgia';
    g.textAlign = 'center';
    g.fillText('AULD', 0, -6);
    g.fillText('SCUNNER', 0, 18);
    g.font = 'italic 13px Georgia';
    g.fillText('18 yr · cask strength', 0, 36);
    g.restore();
    return tex(c);
  });
}

/** Tartan sett from a list of [colour, width] stripes. */
export function tartanTex(name: string, stripes: [string, number][]) {
  return memo(`tartan_${name}`, () => {
    const total = stripes.reduce((a, s) => a + s[1], 0);
    const size = 256;
    const c = canvas(size, size);
    const g = c.getContext('2d')!;
    const scale = size / (total * 2);
    const seq = [...stripes, ...stripes.slice().reverse()];
    let p = 0;
    for (const [col, w] of seq) {
      g.fillStyle = col;
      g.fillRect(p, 0, w * scale, size);
      p += w * scale;
    }
    p = 0;
    g.globalAlpha = 0.55;
    for (const [col, w] of seq) {
      g.fillStyle = col;
      g.fillRect(0, p, size, w * scale);
      p += w * scale;
    }
    g.globalAlpha = 1;
    // twill weave hint
    g.strokeStyle = 'rgba(0,0,0,.12)';
    for (let i = -size; i < size; i += 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + size, size);
      g.stroke();
    }
    return tex(c, 2, 2);
  });
}

export const TARTANS = {
  red: [['#a3121b', 12], ['#0d2a52', 4], ['#a3121b', 2], ['#0f4d2a', 6], ['#e9d26a', 1], ['#0f4d2a', 6], ['#a3121b', 8]] as [string, number][],
  green: [['#0f4d2a', 10], ['#0d2a52', 6], ['#111', 3], ['#0d2a52', 6], ['#0f4d2a', 10], ['#c22', 1]] as [string, number][],
  blue: [['#18306b', 10], ['#111', 4], ['#18306b', 3], ['#fff', 1], ['#18306b', 3], ['#3b7a3b', 8]] as [string, number][],
  dress: [['#eee', 10], ['#c11', 3], ['#eee', 3], ['#111', 2], ['#eee', 3], ['#e5c64a', 1]] as [string, number][],
};

/** Window-lit tenement facade: 4 bays x 4 floors per tile. Returns [map, emissive]. */
export function facadeTex(hue: number, light: number, seed: number): [THREE.Texture, THREE.Texture] {
  return memo(`facade${hue}_${light}_${seed}`, () => {
    const W = 512, Hh = 512;
    const c = canvas(W, Hh), e = canvas(W, Hh);
    const g = c.getContext('2d')!, ge = e.getContext('2d')!;
    const r = rng(seed);
    drawAshlar(g, W, Hh, seed * 13 + 1, hue, light, 22);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, W, Hh);
    const bayW = W / 4, floorH = Hh / 4;
    for (let fy = 0; fy < 4; fy++) {
      // string course
      g.fillStyle = hsl(hue, 12, light - 4);
      g.fillRect(0, fy * floorH + floorH - 8, W, 6);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(0, fy * floorH + floorH - 2, W, 3);
      for (let bx = 0; bx < 4; bx++) {
        const ww = 50, wh = 82;
        const x = bx * bayW + (bayW - ww) / 2, y = fy * floorH + 18;
        // surround
        g.fillStyle = hsl(hue, 12, light + 8);
        g.fillRect(x - 7, y - 7, ww + 14, wh + 12);
        g.fillStyle = hsl(hue, 12, light - 10);
        g.fillRect(x - 9, y + wh + 3, ww + 18, 6); // sill
        const lit = r() < 0.28;
        if (lit) {
          const grad = g.createLinearGradient(0, y, 0, y + wh);
          grad.addColorStop(0, '#ffe2a3');
          grad.addColorStop(1, '#e79d48');
          g.fillStyle = grad;
          ge.fillStyle = r() < 0.5 ? '#ffc773' : '#ffb257';
          ge.fillRect(x, y, ww, wh);
        } else {
          const grad = g.createLinearGradient(x, y, x + ww, y + wh);
          grad.addColorStop(0, '#5d6e7c');
          grad.addColorStop(0.5, '#25303a');
          grad.addColorStop(1, '#3b4855');
          g.fillStyle = grad;
        }
        g.fillRect(x, y, ww, wh);
        // curtains
        if (r() < 0.5) {
          g.fillStyle = [`#7a2430`, `#2f4d6e`, `#6a5a3a`, `#3a5a3a`][Math.floor(r() * 4)];
          g.fillRect(x, y, 10, wh);
          g.fillRect(x + ww - 10, y, 10, wh);
          if (lit) {
            ge.fillStyle = '#000';
            ge.fillRect(x, y, 10, wh);
            ge.fillRect(x + ww - 10, y, 10, wh);
          }
        }
        // sash bars
        g.fillStyle = '#efe9dc';
        g.fillRect(x, y + wh / 2 - 2, ww, 4);
        g.fillRect(x + ww / 2 - 1.5, y, 3, wh);
        g.fillRect(x, y, ww, 3);
        g.fillRect(x, y + wh - 3, ww, 3);
        g.fillRect(x, y, 3, wh);
        g.fillRect(x + ww - 3, y, 3, wh);
        // the odd window box or saltire flag
        if (r() < 0.06) {
          g.fillStyle = '#1060c0';
          g.fillRect(x + 8, y + 20, 34, 22);
          g.strokeStyle = '#fff';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(x + 8, y + 20); g.lineTo(x + 42, y + 42);
          g.moveTo(x + 42, y + 20); g.lineTo(x + 8, y + 42);
          g.stroke();
        } else if (r() < 0.12) {
          g.fillStyle = '#3a2a1a';
          g.fillRect(x - 4, y + wh - 2, ww + 8, 10);
          for (let k = 0; k < 6; k++) {
            g.fillStyle = ['#d33', '#f5c', '#fd3', '#fff'][Math.floor(r() * 4)];
            g.beginPath();
            g.arc(x + 2 + k * 9, y + wh - 4, 4, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
    const m = tex(c), em = tex(e);
    return [m, em] as [THREE.Texture, THREE.Texture];
  });
}

export const SHOP_NAMES = [
  'TARTAN TAT EMPORIUM', 'SHORTBREAD & SONS', 'HAGGIS TO GO', 'YE OLDE GIFTE SHOPPE · EST. 2019',
  'KILTS R ALSO US', 'WHISKY TASTING (MOSTLY)', 'GHOST TOURS — BOO!', 'CASHMERE-ISH', 'BAGPIPE REPAIRS',
  'NAE BOTHER CAFÉ', 'TABLET & TOFFEE', 'MAGNETS & MORE MAGNETS', 'SCOTCH EGG-SPERIENCE', 'SPORRAN SALE',
  "THE DEACON'S DEN", "McGONAGALL'S BAD POETRY", "DOG'S DINNER BISTRO", 'OCH AYE OPTICIANS',
  'PEELY WALLY TANNING', 'HAUD YER WHEESHT LIBRARY', 'DEEP FRIED EVERYTHING', 'BRAW BRAWS (CLOTHING)',
  'FOG & FUDGE', 'NESSIE SIGHTINGS (CLOSED)', 'CLAN NAME FINDER', 'SPOOKY CLOSE TOURS',
];

/** Painted shopfront with a gold-lettered fascia. */
export function shopTex(name: string, seed: number): [THREE.Texture, THREE.Texture] {
  return memo(`shop_${name}_${seed}`, () => {
    const W = 512, Hh = 256;
    const c = canvas(W, Hh), e = canvas(W, Hh);
    const g = c.getContext('2d')!, ge = e.getContext('2d')!;
    const r = rng(seed);
    const paints = ['#1e3d2f', '#5a1420', '#14284a', '#1c1c1c', '#3d2a5a', '#0f4a4a', '#6a3a12'];
    const paint = paints[Math.floor(r() * paints.length)];
    g.fillStyle = paint;
    g.fillRect(0, 0, W, Hh);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, W, Hh);
    // fascia
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, 56, W, 6);
    g.fillStyle = '#e8c45a';
    let fs = 40;
    g.font = `bold ${fs}px Georgia`;
    while (g.measureText(name).width > W - 40 && fs > 14) {
      fs -= 2;
      g.font = `bold ${fs}px Georgia`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, W / 2, 32);
    // windows + door
    const doorX = r() < 0.5 ? 40 : W - 120;
    for (const [x, w] of [[24, doorX - 40], [doorX + 96, W - doorX - 120]] as [number, number][]) {
      if (w < 40) continue;
      const grad = g.createLinearGradient(0, 80, 0, 230);
      grad.addColorStop(0, '#f6d797');
      grad.addColorStop(1, '#b77b3d');
      g.fillStyle = grad;
      g.fillRect(x, 80, w, 140);
      ge.fillStyle = '#d99a4a';
      ge.fillRect(x, 80, w, 140);
      // goods on display
      for (let k = 0; k < w / 22; k++) {
        g.fillStyle = ['#c22', '#2a6', '#24a', '#eee', '#a63', '#dd3'][Math.floor(r() * 6)];
        const gx = x + 8 + k * 22, gh = 16 + r() * 34;
        g.fillRect(gx, 218 - gh, 16, gh);
      }
      g.fillStyle = paint;
      for (let k = 1; k < 3; k++) g.fillRect(x + (w * k) / 3 - 2, 80, 4, 140);
      g.fillRect(x, 148, w, 4);
    }
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillRect(doorX, 76, 56, 180);
    g.fillStyle = '#e8c45a';
    g.fillRect(doorX + 44, 160, 5, 5);
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(0, 236, W, 20);
    return [tex(c), tex(e)] as [THREE.Texture, THREE.Texture];
  });
}

/** Generic sign/banner texture with text. */
export function signTex(lines: string[], bg = '#14284a', fg = '#fff', w = 256, h = 128, font = 'Lilita One, Arial Black') {
  return memo(`sign_${lines.join('|')}_${bg}_${fg}_${w}x${h}`, () => {
    const c = canvas(w, h);
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 4;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = (h - 20) / lines.length;
    lines.forEach((l, i) => {
      let fs = Math.min(lh * 0.8, 44);
      g.font = `${fs}px ${font}`;
      while (g.measureText(l).width > w - 24 && fs > 8) {
        fs -= 1;
        g.font = `${fs}px ${font}`;
      }
      g.fillText(l, w / 2, 10 + lh * (i + 0.5));
    });
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function heartTex() {
  return memo('heart', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    const r = rng(21);
    g.clearRect(0, 0, 256, 256);
    // heart path
    const path = new Path2D();
    path.moveTo(128, 220);
    path.bezierCurveTo(20, 140, 10, 70, 70, 50);
    path.bezierCurveTo(105, 40, 125, 65, 128, 80);
    path.bezierCurveTo(131, 65, 151, 40, 186, 50);
    path.bezierCurveTo(246, 70, 236, 140, 128, 220);
    // mosaic setts
    for (let y = 0; y < 256; y += 10) {
      for (let x = 0; x < 256; x += 10) {
        if (!g.isPointInPath(path, x + 5, y + 5)) continue;
        const edge = !g.isPointInPath(path, x - 6, y + 5) || !g.isPointInPath(path, x + 16, y + 5) || !g.isPointInPath(path, x + 5, y - 6) || !g.isPointInPath(path, x + 5, y + 16);
        g.fillStyle = edge ? hsl(0, 55, 30 + r() * 8) : hsl(30, 10, 60 + r() * 15);
        g.fillRect(x + 1, y + 1, 8, 8);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function clockTex() {
  return memo('clock', () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b2533';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#e8c45a';
    g.beginPath();
    g.arc(128, 128, 118, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f1df';
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.font = 'bold 22px Georgia';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const rn = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    rn.forEach((n, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.fillText(n, 128 + Math.cos(a) * 82, 128 + Math.sin(a) * 82);
    });
    g.strokeStyle = '#222';
    g.lineCap = 'round';
    g.lineWidth = 8;
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 40, 128 - 30); g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 80); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function saltireTex() {
  return memo('saltire', () => {
    const c = canvas(256, 160);
    const g = c.getContext('2d')!;
    g.fillStyle = '#005eb8';
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#fff';
    g.lineWidth = 30;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(256, 160);
    g.moveTo(256, 0); g.lineTo(0, 160);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function stainedGlassTex(seed = 4) {
  return memo(`stained${seed}`, () => {
    const c = canvas(128, 256);
    const g = c.getContext('2d')!;
    const r = rng(seed);
    g.fillStyle = '#111';
    g.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 128; x += 16) {
        g.fillStyle = ['#b21f2d', '#1f4fb2', '#e3b52b', '#2b8a3e', '#7a2fa0', '#1f8ab2'][Math.floor(r() * 6)];
        g.fillRect(x + 1.5, y + 1.5, 13, 13);
      }
    }
    // arched top mask
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    g.moveTo(0, 256); g.lineTo(0, 64);
    g.quadraticCurveTo(0, 0, 64, 0);
    g.quadraticCurveTo(128, 0, 128, 64);
    g.lineTo(128, 256);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function stripeTex(a: string, b: string, n = 8) {
  return memo(`stripe${a}${b}${n}`, () => {
    const c = canvas(256, 64);
    const g = c.getContext('2d')!;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * 256) / n, 0, 256 / n + 1, 64);
    }
    return tex(c);
  });
}

export function checkerTex() {
  return memo('checker', () => {
    const c = canvas(256, 32);
    const g = c.getContext('2d')!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    return tex(c);
  });
}
