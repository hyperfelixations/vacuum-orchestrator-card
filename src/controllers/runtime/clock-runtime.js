// The card's clock (QUE-09): it renders again each second while a shown time counts seconds,
// else at each minute boundary of the integration's clock; not while the page is hidden, and at
// once when it shows again. See internal dev doc §9 "Takt".

import { relativeParts } from "../../core/time.js";

export const TICK_MS = Object.freeze({ second: 1000, minute: 60_000 });

// The text port of one render, noting whether a relative time it worded counts seconds.
export function watchTimes(texts) {
  let mode = "minute";
  const watched = Object.freeze({
    ...texts,
    formatRelative(nowMs, thenMs) {
      if (relativeParts(nowMs, thenMs).unit === "second") mode = "second";
      return texts.formatRelative(nowMs, thenMs);
    },
  });
  return {
    texts: watched,
    get mode() {
      return mode;
    },
  };
}

// `now()`: the card's clock; `onTick()`: render again.
export function createClockRuntime({ platform, now, onTick }) {
  let mode = "minute";
  let timer = null;
  let stopWatching = null;

  function cancel() {
    if (timer) platform.clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    cancel();
    if (!stopWatching || platform.isDocumentHidden?.()) return;
    const step = TICK_MS[mode];
    timer = platform.setTimeout(() => {
      timer = null;
      onTick();
      schedule();
    }, step - (((now() % step) + step) % step));
  }

  return {
    connect() {
      if (stopWatching) return;
      stopWatching = platform.onVisibilityChange?.(() => {
        if (!platform.isDocumentHidden?.()) onTick();
        schedule();
      }) ?? (() => {});
      schedule();
    },
    disconnect() {
      cancel();
      stopWatching?.();
      stopWatching = null;
    },
    // The finest unit the last render showed a time in.
    plan(next) {
      if (next === mode || !TICK_MS[next]) return;
      mode = next;
      schedule();
    },
    get mode() {
      return mode;
    },
  };
}
