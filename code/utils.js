export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickMany(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length > 0 && out.length < n) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function fmtPct(v) {
  return `${Math.round(v * 100)}%`;
}
