const LIMIT = 2;

function distance(one, other, limit) {
  if (Math.abs(one.length - other.length) > limit) return limit + 1;
  let previous = Array.from({ length: other.length + 1 }, (_, index) => index);
  for (let row = 1; row <= one.length; row += 1) {
    const current = [row];
    let best = row;
    for (let column = 1; column <= other.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (one[row - 1] === other[column - 1] ? 0 : 1),
      );
      best = Math.min(best, current[column]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[other.length];
}

export function nearestKey(key, known) {
  const needle = String(key).toLowerCase();
  let closest = null;
  let best = LIMIT + 1;
  let ties = 0;
  for (const candidate of known) {
    const current = distance(needle, String(candidate).toLowerCase(), LIMIT);
    if (current > LIMIT) continue;
    if (current < best) {
      closest = candidate;
      best = current;
      ties = 1;
    } else if (current === best) {
      ties += 1;
    }
  }
  return ties === 1 ? closest : null;
}
