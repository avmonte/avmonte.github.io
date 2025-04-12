function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));

  return `#${[f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

// Bright color range: vibrant hue, 90–100% saturation, 60–75% lightness
const hue = Math.floor(Math.random() * 360);
const saturation = 95;
const lightness = 70;

const brightHex = hslToHex(hue, saturation, lightness);
document.documentElement.style.setProperty('--glow-color', brightHex);
