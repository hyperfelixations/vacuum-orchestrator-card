// The card's only timestamp reader. Deterministic on purpose: `Date.parse` accepts
// engine-specific spellings and would make normalization depend on the browser.
// Wall-clock access belongs to the platform adapter, never here.

const DAYS_BEFORE_MONTH = Object.freeze([0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]);
// Up to nine fractional digits: Python's isoformat writes six. Comma and lower case are RFC 3339.
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;

function leapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysBeforeYear(year) {
  const previous = year - 1;
  return 365 * previous + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400);
}

function daysInMonth(year, month) {
  if (month === 2) return 28 + (leapYear(year) ? 1 : 0);
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Epoch milliseconds for an ISO-8601 instant, or null. A number passes through so a
// record that was already normalized stays stable.
export function parseInstant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const match = ISO.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  // Cut to milliseconds, never rounded: rounding up could carry into the next second.
  const millisecond = Number((match[7] || "").slice(0, 3).padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  if (day > daysInMonth(year, month)) return null;
  let offsetMinutes = 0;
  const zone = match[8];
  if (zone && zone.toUpperCase() !== "Z") {
    const compact = zone.slice(1).replace(":", "");
    const offsetHours = Number(compact.slice(0, 2));
    const offsetPart = Number(compact.slice(2, 4));
    if (offsetHours > 23 || offsetPart > 59) return null;
    offsetMinutes = (zone[0] === "+" ? 1 : -1) * (offsetHours * 60 + offsetPart);
  }
  const days = daysBeforeYear(year) - daysBeforeYear(1970) + DAYS_BEFORE_MONTH[month - 1] + (month > 2 && leapYear(year) ? 1 : 0) + day - 1;
  return (((days * 24 + hour) * 60 + minute - offsetMinutes) * 60 + second) * 1000 + millisecond;
}

export function elapsed(nowMs, thenMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return null;
  return Math.max(0, nowMs - thenMs);
}

// Largest unit that still describes the distance, for Intl.RelativeTimeFormat.
export function relativeParts(nowMs, thenMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return { unit: "second", value: 0 };
  const seconds = (thenMs - nowMs) / 1000;
  if (Math.abs(seconds) < 60) return { unit: "second", value: Math.round(seconds) };
  const minutes = seconds / 60;
  if (Math.abs(minutes) < 60) return { unit: "minute", value: Math.round(minutes) };
  const hours = minutes / 60;
  if (Math.abs(hours) < 24) return { unit: "hour", value: Math.round(hours) };
  return { unit: "day", value: Math.round(hours / 24) };
}

// Hours and minutes of a duration; the wording belongs to the i18n layer.
export function durationParts(durationMs) {
  if (!Number.isFinite(durationMs)) return null;
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}
