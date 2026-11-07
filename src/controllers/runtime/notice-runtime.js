// The card's notice that goes by itself (UI-33): after each render the element hands over the
// notice's id and time. A pointer moving on the notice, focus inside it, a hidden page and a
// detached card each hold the time and the running line (`data-paused`); once every hold has ended
// the rest of the time runs. A notice that appears under a resting pointer, where the button
// that saved sat, is not held by it. See internal dev doc §9 "Kartenhinweis".

const NOTICE = ".voc-notice--float";

export function createNoticeRuntime({ root, platform, onExpire }) {
  // The timed notice: its id, the time left, when that started to run, its timer and its holds.
  let current = null;
  // The notice whose time ran out; it is not timed again while it is still on screen.
  let expired = null;
  let stopVisibility = null;
  let connected = false;

  const element = () => root.querySelector?.(NOTICE) ?? null;
  const inside = (node) => Boolean(node?.closest?.(NOTICE));

  function mark() {
    element()?.toggleAttribute("data-paused", Boolean(current?.holds.size));
  }

  function run() {
    if (!current || current.timer || current.holds.size) return;
    const { id } = current;
    current.startedAt = platform.monotonicNow();
    current.timer = platform.setTimeout(() => {
      if (current?.id !== id) return;
      current = null;
      expired = id;
      onExpire(id);
    }, current.remaining);
  }

  function hold(reason) {
    if (!current) return;
    if (current.timer) {
      platform.clearTimeout(current.timer);
      current.timer = null;
      current.remaining = Math.max(0, current.remaining - (platform.monotonicNow() - current.startedAt));
    }
    current.holds.add(reason);
    mark();
  }

  function release(reason) {
    if (!current?.holds.delete(reason)) return;
    mark();
    run();
  }

  function stop() {
    if (current?.timer) platform.clearTimeout(current.timer);
    current = null;
  }

  const onPointerMove = (event) => {
    if (inside(event.target)) hold("pointer");
  };
  const onPointerOut = (event) => {
    if (inside(event.target) && !inside(event.relatedTarget)) release("pointer");
  };
  const onFocusIn = (event) => {
    if (inside(event.target)) hold("focus");
  };
  const onFocusOut = (event) => {
    if (inside(event.target) && !inside(event.relatedTarget)) release("focus");
  };
  const onVisibility = () => (platform.isDocumentHidden?.() ? hold("hidden") : release("hidden"));

  return {
    connect() {
      if (connected) return;
      connected = true;
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerout", onPointerOut);
      root.addEventListener("focusin", onFocusIn);
      root.addEventListener("focusout", onFocusOut);
      stopVisibility = platform.onVisibilityChange?.(onVisibility) ?? null;
      // The page may have been shown again while the card was detached.
      if (!platform.isDocumentHidden?.()) release("hidden");
      release("detached");
    },
    disconnect() {
      if (!connected) return;
      connected = false;
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerout", onPointerOut);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      stopVisibility?.();
      stopVisibility = null;
      hold("detached");
    },
    // After every render: the notice on screen, `{id, durationMs}`, or null. A notice without a
    // time stays until it is dismissed or replaced.
    sync(notice) {
      if (!notice || !Number.isFinite(notice.durationMs) || notice.id === expired) {
        stop();
        return;
      }
      if (current?.id === notice.id) {
        mark();
        return;
      }
      stop();
      current = { id: notice.id, remaining: notice.durationMs, startedAt: 0, timer: null, holds: new Set() };
      if (!connected) current.holds.add("detached");
      if (platform.isDocumentHidden?.()) current.holds.add("hidden");
      mark();
      run();
    },
  };
}
