// The rendering base: escaped markup builders, the keyed morph that keeps nodes, focus and typed
// values, the focus helpers, the render context and the shadow mount that leaves foreign nodes.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const markup = () => import("../../../src/render/primitives/markup.js");
const documentOf = () => new JSDOM("<!doctype html><body></body>").window.document;

test("every variable text is escaped, in content and in attributes", async () => {
  const { e, attr, argsAttr, chip, pill } = await markup();
  assert.equal(e(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(e(null), "");
  assert.equal(attr("title", `"x"`), ` title="&quot;x&quot;"`);
  assert.equal(attr("hidden", true), " hidden");
  assert.equal(attr("title", null), "");
  assert.equal(argsAttr({ jobId: `a"b` }), ` data-args="{&quot;jobId&quot;:&quot;a\\&quot;b&quot;}"`);
  assert.equal(argsAttr({}), "");
  assert.match(chip("<b>"), /&lt;b&gt;/);
  assert.equal(pill(""), "");
});

test("an icon button is named for assistive technology; a text button shows its label", async () => {
  const { button } = await markup();
  const iconButton = button({ action: "edit-job", args: { jobId: "j" }, label: "Edit", iconName: "mdi:pencil", variant: "icon" });
  assert.match(iconButton, /aria-label="Edit"/);
  assert.match(iconButton, /title="Edit"/);
  assert.doesNotMatch(iconButton, /voc-button-label/);
  const textButton = button({ action: "save", label: "Save", variant: "primary" });
  assert.match(textButton, /<span class="voc-button-label">Save<\/span>/);
  assert.doesNotMatch(textButton, /title=/);
  assert.match(button({ action: "x", label: "Pause", tooltip: true }), /title="Pause"/);
  assert.match(button({ action: "x", label: "On", pressed: true }), /aria-pressed="true"/);
});

test("a hidden decision renders nothing; a disabled one says why", async () => {
  const { button } = await markup();
  assert.equal(button({ action: "x", label: "X", decision: { state: "hidden", reason: null } }), "");
  const hard = button({ action: "x", label: "X", decision: { state: "disabled", reason: "command_pending" }, reasonText: "Busy" });
  assert.match(hard, / disabled/);
  assert.match(hard, /title="Busy"/);
  const soft = button({ action: "x", label: "X", decision: { state: "disabled", reason: "read_only" }, reasonText: "Read only" });
  assert.match(soft, /aria-disabled="true"/);
  assert.doesNotMatch(soft, / disabled[ >]/, "a soft reason stays focusable so it can be read");
});

test("an external link opens in a new tab without referrer", async () => {
  const { link } = await markup();
  const html = link({ href: "https://example.org/?a=1&b=2", label: "Guide" });
  assert.match(html, /href="https:\/\/example.org\/\?a=1&amp;b=2"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("the morph keeps keyed nodes when they move and drops the ones that left", async () => {
  const { morphElement } = await import("../../../src/render/primitives/morph.js");
  const document = documentOf();
  const live = document.createElement("div");
  live.innerHTML = `<p data-key="a">A</p><p data-key="b">B</p><p data-key="c">C</p>`;
  const [a, b] = live.children;
  const next = document.createElement("div");
  next.innerHTML = `<p data-key="b" class="x">B2</p><p data-key="a">A</p>`;
  morphElement(live, next);
  assert.equal(live.children.length, 2);
  assert.equal(live.children[0], b);
  assert.equal(live.children[1], a);
  assert.equal(b.textContent, "B2");
  assert.equal(b.className, "x");
});

test("the morph does not overwrite what the user is typing, and syncs everything else", async () => {
  const { morphElement } = await import("../../../src/render/primitives/morph.js");
  const document = documentOf();
  const live = document.createElement("div");
  live.innerHTML = `<input data-key="name" value="old"><input data-key="other" value="x"><input type="checkbox" data-key="box">`;
  document.body.appendChild(live);
  const [typing, other, box] = live.children;
  typing.focus();
  typing.value = "half-typed";
  const next = document.createElement("div");
  next.innerHTML = `<input data-key="name" value="server"><input data-key="other" value="y"><input type="checkbox" data-key="box" checked>`;
  morphElement(live, next, document.activeElement);
  assert.equal(typing.value, "half-typed");
  assert.equal(document.activeElement, typing);
  assert.equal(other.value, "y");
  assert.equal(box.checked, true);
});

test("the morph leaves the content of custom elements to them", async () => {
  const { morphElement } = await import("../../../src/render/primitives/morph.js");
  const document = documentOf();
  const live = document.createElement("div");
  live.innerHTML = `<ha-icon icon="mdi:a"></ha-icon>`;
  live.firstChild.appendChild(document.createElement("svg"));
  const next = document.createElement("div");
  next.innerHTML = `<ha-icon icon="mdi:b"></ha-icon>`;
  morphElement(live, next);
  assert.equal(live.firstChild.getAttribute("icon"), "mdi:b");
  assert.equal(live.firstChild.childNodes.length, 1);
});

test("focus is found again by identity and restored only when the render lost it", async () => {
  const { captureFocus, restoreFocus, focusSelector, focusRingShown } = await import("../../../src/render/primitives/focus.js");
  const document = documentOf();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<div class="voc-root" tabindex="-1"><button data-action="move-job" data-args='{"jobId":"a"}'>Up</button><button id="named">N</button></div>`;
  const button = root.querySelector("button");
  button.focus();
  const selector = captureFocus(root);
  assert.equal(selector, `[data-action="move-job"][data-args="{\\"jobId\\":\\"a\\"}"]`);
  assert.equal(restoreFocus(root, selector), null, "focus still held: nothing to do");
  const replacement = button.cloneNode(true);
  button.replaceWith(replacement);
  assert.equal(root.activeElement, null);
  assert.equal(restoreFocus(root, selector, { visible: false }), replacement);
  assert.equal(root.activeElement, replacement);
  root.querySelector("#named").focus();
  assert.equal(captureFocus(root), "#named");
  assert.equal(focusSelector(root, ".missing") ?? null, null);
  assert.equal(typeof focusRingShown(root), "boolean");
  assert.equal(captureFocus({ activeElement: null }), null);
});

test("the render context words decisions and parses into the given document", async () => {
  const { createRenderContext } = await import("../../../src/render/primitives/render-context.js");
  const document = documentOf();
  const context = createRenderContext(document, { texts: { t: (key) => `T(${key})` }, resolveUrl: (path) => `https://ha${path}` });
  assert.equal(context.reason({ state: "disabled", reason: "read_only" }), "T(affordance.read_only)");
  assert.equal(context.reason({ state: "enabled", reason: null }), "");
  assert.equal(context.resolveUrl("/x"), "https://ha/x");
  assert.equal(context.fragment("<span>a</span>").firstChild.textContent, "a");
  assert.equal(context.ownerDocument, document);
  assert.throws(() => createRenderContext(null), TypeError);
  assert.equal(createRenderContext(document).t("k"), "k");
});

test("the shadow mount morphs its own root and never touches foreign nodes", async () => {
  const { createShadowMount } = await import("../../../src/render/composition/shadow-mount.js");
  const { createRenderContext } = await import("../../../src/render/primitives/render-context.js");
  const document = documentOf();
  const root = document.createElement("div");
  const mount = createShadowMount(root);
  const context = createRenderContext(document);
  mount.mount(context, { css: "a{}", html: `<div class="voc-root"><p data-key="p">one</p></div>` });
  const paragraph = root.querySelector("p");
  const foreign = document.createElement("card-mod");
  root.appendChild(foreign);
  root.querySelector("ha-card").appendChild(document.createElement("aside"));
  mount.mount(context, { css: "b{}", html: `<div class="voc-root"><p data-key="p">two</p></div>` });
  assert.equal(root.querySelector("p"), paragraph);
  assert.equal(paragraph.textContent, "two");
  assert.equal(root.querySelector("style").textContent, "b{}");
  assert.equal(root.querySelector("card-mod"), foreign);
  assert.ok(root.querySelector("ha-card aside"));
  mount.showText("broken");
  assert.equal(root.querySelector("ha-card"), null);
  assert.equal(root.querySelector("card-mod"), foreign);
  assert.match(root.textContent, /broken/);
});
