// The scroll runtime: faded edges where content lies beyond a region, the width a classic
// scrollbar takes, and the position a region shows when the user comes back to it.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/controllers/runtime/scroll-runtime.js");

test("an edge is marked only where content lies more than a pixel beyond it", async () => {
  const { scrollEdges } = await load();
  assert.deepEqual(scrollEdges({ scrollTop: 0, clientHeight: 300, scrollHeight: 300 }), { top: false, bottom: false });
  assert.deepEqual(scrollEdges({ scrollTop: 0, clientHeight: 300, scrollHeight: 301 }), { top: false, bottom: false });
  assert.deepEqual(scrollEdges({ scrollTop: 0, clientHeight: 300, scrollHeight: 500 }), { top: false, bottom: true });
  assert.deepEqual(scrollEdges({ scrollTop: 120, clientHeight: 300, scrollHeight: 500 }), { top: true, bottom: true });
  assert.deepEqual(scrollEdges({ scrollTop: 200, clientHeight: 300, scrollHeight: 500 }), { top: true, bottom: false });
});

test("a classic scrollbar's width is what the region loses; an overlay scrollbar takes none", async () => {
  const { scrollbarWidth } = await load();
  assert.equal(scrollbarWidth({ offsetWidth: 600, clientWidth: 589 }), 11);
  assert.equal(scrollbarWidth({ offsetWidth: 600, clientWidth: 600 }), 0);
  assert.equal(scrollbarWidth({ offsetWidth: 600.4, clientWidth: 600 }), 0);
});

// A shadow root with one body region and, while an overlay is open, its content region.
function fakeRoot() {
  const listeners = {};
  const region = (name) => {
    const attributes = new Set(["data-scroll"]);
    const properties = {};
    return {
      name,
      scrollTop: 0,
      clientHeight: 300,
      scrollHeight: 900,
      offsetWidth: 600,
      clientWidth: 600,
      hasAttribute: (key) => attributes.has(key),
      toggleAttribute: (key, on) => (on ? attributes.add(key) : attributes.delete(key)),
      attributes,
      style: { setProperty: (key, value) => { properties[key] = value; }, removeProperty: (key) => { delete properties[key]; } },
      properties,
    };
  };
  const body = region("body");
  const root = {
    body,
    overlay: null,
    host: { ownerDocument: { fonts: null } },
    querySelector(selector) {
      if (selector.startsWith(".voc-overlay-scroll")) return this.overlay;
      return selector.startsWith(".voc-body") ? body : null;
    },
    querySelectorAll() {
      return [body, this.overlay].filter(Boolean);
    },
    addEventListener: (name, listener) => { listeners[name] = listener; },
    removeEventListener: (name) => { delete listeners[name]; },
    listeners,
    open() {
      this.overlay = region("overlay");
      return this.overlay;
    },
  };
  return root;
}

const platform = { observeResize: (_element, fn) => { platform.resize = fn; return () => { platform.resize = null; }; } };

test("a region comes back where it was left, a new one starts at the top, and a left one is forgotten", async () => {
  const { createScrollRuntime } = await load();
  const root = fakeRoot();
  const runtime = createScrollRuntime({ root, platform });
  const queue = "view:queue:{}";
  runtime.sync([queue]);
  root.body.scrollTop = 240;
  runtime.capture();
  const editor = root.open();
  editor.scrollTop = 80;
  runtime.sync([queue, "overlay:0:job-editor"]);
  assert.equal(editor.scrollTop, 0, "an overlay opens at its top");
  editor.scrollTop = 150;
  runtime.capture();
  const dialog = root.open();
  runtime.sync([queue, "overlay:0:job-editor", "overlay:1:confirm"]);
  assert.equal(dialog.scrollTop, 0);
  runtime.capture();
  const editorAgain = root.open();
  runtime.sync([queue, "overlay:0:job-editor"]);
  assert.equal(editorAgain.scrollTop, 150, "closing the dialog gives the editor back where it was");
  runtime.capture();
  root.overlay = null;
  root.body.scrollTop = 0;
  runtime.sync([queue]);
  assert.equal(root.body.scrollTop, 240, "closing the editor gives the queue back where it was");
  runtime.capture();
  runtime.sync(["view:rooms:{}"]);
  assert.equal(root.body.scrollTop, 0, "another view starts at the top");
  root.body.scrollTop = 0;
  runtime.capture();
  runtime.sync([queue]);
  assert.equal(root.body.scrollTop, 0, "a view left through a tab is not remembered");
});

test("a render, a scroll and a resize mark the edges and the scrollbar width", async () => {
  const { createScrollRuntime } = await load();
  const root = fakeRoot();
  const runtime = createScrollRuntime({ root, platform });
  runtime.connect();
  runtime.sync(["view:queue:{}"]);
  assert.deepEqual([...root.body.attributes].sort(), ["data-overflow-bottom", "data-scroll"]);
  assert.deepEqual(root.body.properties, {}, "no scrollbar, no width on the region");
  root.body.scrollTop = 600;
  root.body.clientWidth = 589;
  root.listeners.scroll({ target: root.body });
  assert.deepEqual([...root.body.attributes].sort(), ["data-overflow-top", "data-scroll"]);
  assert.equal(root.body.properties["--voc-scrollbar"], "11px");
  root.body.scrollHeight = 300;
  root.body.scrollTop = 0;
  root.body.clientWidth = 600;
  platform.resize();
  assert.deepEqual([...root.body.attributes], ["data-scroll"]);
  assert.deepEqual(root.body.properties, {});
  root.listeners.scroll({ target: { hasAttribute: () => false } });
  runtime.disconnect();
  assert.deepEqual(Object.keys(root.listeners), []);
  assert.equal(platform.resize, null);
});
