"use strict";

// The browser's idle callbacks wait until a test flushes them (`window.__vocIdle.flush()`): the
// card reads views ahead once idle (UI-35), and the recordings answer only what a test plays.
// Loaded before the card bundle; jsdom gets the same seam (test/helpers/load-card.jsdom.js).
(function () {
  const waiting = new Map();
  let next = 0;
  window.requestIdleCallback = (fn) => {
    next += 1;
    waiting.set(next, fn);
    return next;
  };
  window.cancelIdleCallback = (id) => waiting.delete(id);
  window.__vocIdle = {
    get pending() {
      return waiting.size;
    },
    flush() {
      const due = [...waiting.values()];
      waiting.clear();
      for (const fn of due) fn({ didTimeout: false, timeRemaining: () => 50 });
      return due.length;
    },
  };
})();
