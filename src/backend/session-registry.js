// Cards on the same Home Assistant connection share one session: one subscription, one
// snapshot. A session lives while a card holds it and a short grace period after the last one
// lets go, so a dashboard re-mounting its cards in edit mode does not reconnect.

import { createSession } from "./session.js";
import { createTransport } from "./transport.js";

export const RELEASE_GRACE_MS = 30_000;

const sessions = new WeakMap();
// Cards without a connection object (previews, tests) each get their own session.
const NO_CONNECTION = Symbol("no-connection");

export function acquireSession({ hass, platform, createTransportFor = createTransport, createSessionFor = createSession } = {}) {
  const key = hass?.connection && typeof hass.connection === "object" ? hass.connection : null;
  let record = key ? sessions.get(key) : null;
  if (!record) {
    record = { holders: 0, releaseHandle: null, latestHass: hass, session: null };
    const getHass = () => record.latestHass;
    record.session = createSessionFor({ transport: createTransportFor({ getHass, platform }), platform, getHass });
    if (key) sessions.set(key, record);
    else record[NO_CONNECTION] = true;
  }
  if (record.releaseHandle !== null) {
    platform?.clearTimeout?.(record.releaseHandle);
    record.releaseHandle = null;
  }
  record.holders += 1;
  record.latestHass = hass ?? record.latestHass;
  let released = false;

  return Object.freeze({
    session: record.session,
    // Any card's newest hass object is the session's view of Home Assistant.
    updateHass(next) {
      if (next) record.latestHass = next;
      record.session.syncHass();
    },
    release(owner) {
      if (released) return;
      released = true;
      record.session.releaseDemand(owner);
      record.holders -= 1;
      if (record.holders > 0) return;
      const dispose = () => {
        record.releaseHandle = null;
        if (record.holders > 0) return;
        record.session.dispose();
        if (key && sessions.get(key) === record) sessions.delete(key);
      };
      if (typeof platform?.setTimeout === "function" && !record[NO_CONNECTION]) record.releaseHandle = platform.setTimeout(dispose, RELEASE_GRACE_MS);
      else dispose();
    },
  });
}
