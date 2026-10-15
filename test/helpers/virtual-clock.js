"use strict";
// A clock tests move by hand: timers fire in time order while it advances, never on their own.

class VirtualClock {
  constructor(now = 0) {
    this.time = now;
    this.nextHandle = 1;
    this.timers = new Map();
  }
  now() {
    return this.time;
  }
  setTimeout(callback, delay = 0) {
    const handle = this.nextHandle++;
    this.timers.set(handle, { at: this.time + Math.max(0, delay), callback });
    return handle;
  }
  clearTimeout(handle) {
    this.timers.delete(handle);
  }
  advance(ms) {
    const target = this.time + Math.max(0, ms);
    for (let guard = 0; guard < 10000; guard += 1) {
      let next = null;
      for (const [handle, timer] of this.timers) if (timer.at <= target && (!next || timer.at < next.timer.at)) next = { handle, timer };
      if (!next) break;
      this.time = next.timer.at;
      this.timers.delete(next.handle);
      next.timer.callback();
    }
    this.time = target;
  }
}

module.exports = { VirtualClock };
