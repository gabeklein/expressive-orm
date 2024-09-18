export function random(min: number, max: number) {
  const u = Math.max(min, max);
  const l = Math.min(min, max);
  const diff = u - l;
  const r = Math.floor(Math.random() * (diff + 1));
  return l + r;
}

export function seconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

