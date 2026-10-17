// A release being composed: one row per room with its own kind and, for a timed one, hours and
// minutes. Rows become the grants of one `release_rooms` command. See internal dev doc §8 "Räume".

const NEW_ROW = Object.freeze({ kind: "queue_run", hours: 2, minutes: 0 });
const GRANT_FIELDS = Object.freeze({ kind: "kind", duration_seconds: "duration", room: "room" });

export function releaseRows(roomIds) {
  return [...new Set(roomIds)].map((roomId) => ({ roomId, ...NEW_ROW }));
}

export function withReleaseRoom(rows, roomId) {
  return rows.some((row) => row.roomId === roomId) ? rows : [...rows, { roomId, ...NEW_ROW }];
}

// The last row stays: a release names at least one room.
export function withoutReleaseRow(rows, index) {
  return rows.length > 1 ? rows.filter((_row, at) => at !== index) : rows;
}

// `quick` is a duration in minutes and sets hours and minutes together.
export function updateReleaseRow(rows, index, name, value) {
  return rows.map((row, at) => {
    if (at !== index) return row;
    if (name !== "quick") return { ...row, [name]: value };
    const minutes = Number(value);
    return { ...row, hours: Math.floor(minutes / 60), minutes: minutes % 60 };
  });
}

export function grantsOf(rows) {
  return rows.map((row) => {
    const grant = { room: row.roomId, kind: row.kind || NEW_ROW.kind };
    if (grant.kind === "timed") grant.duration_seconds = (Number(row.hours ?? NEW_ROW.hours) * 60 + Number(row.minutes ?? NEW_ROW.minutes)) * 60;
    return grant;
  });
}

// `release:<index>:<name>`, the key of a row's field.
export function releaseField(key) {
  const match = /^release:(\d+):([a-z]+)$/.exec(String(key));
  return match ? { index: Number(match[1]), name: match[2] } : null;
}

// The row field an error of the integration names by its path `grants.<index>.<field>`.
export function releaseFieldOf(path) {
  const match = /^grants\.(\d+)\.([a-z_]+)$/.exec(String(path));
  return match && GRANT_FIELDS[match[2]] ? `release:${match[1]}:${GRANT_FIELDS[match[2]]}` : null;
}

// Hours, minutes and the quick choice form one duration, which carries its error.
export function releaseGroupOf(key) {
  const field = releaseField(key);
  return field && ["hours", "minutes", "quick"].includes(field.name) ? `release:${field.index}:duration` : null;
}
