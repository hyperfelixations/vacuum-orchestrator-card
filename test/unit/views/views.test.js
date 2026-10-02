// The view layer: the registry's declarations, form fields with their ARIA ties, and every view
// and page renderer producing keyed, escaped markup whose controls name an action.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { modelFor } = require("../../helpers/model.js");

async function renderContext(texts) {
  const { createRenderContext } = await import("../../../src/render/primitives/render-context.js");
  const document = new JSDOM("<!doctype html><body></body>").window.document;
  return { document, context: createRenderContext(document, { texts, resolveUrl: (path) => path }) };
}

function parse(document, html) {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

// Repeated siblings carry distinct keys; every control names an action; text never becomes markup.
function assertMarkupContract(host, label) {
  for (const parent of [host, ...host.querySelectorAll("*")]) {
    const keys = [...parent.children].map((child) => child.getAttribute("data-key")).filter(Boolean);
    assert.equal(new Set(keys).size, keys.length, `${label}: duplicate data-key under ${parent.className || parent.nodeName}`);
  }
  for (const button of host.querySelectorAll("button")) {
    assert.ok(button.hasAttribute("data-action") || button.hasAttribute("data-view"), `${label}: a button without an action`);
    assert.ok(button.textContent.trim() || button.getAttribute("aria-label"), `${label}: a button without a name`);
  }
  assert.equal(host.querySelectorAll("script, [onerror], [onclick]").length, 0, `${label}: executable markup`);
}

test("the registry declares every view and page once with build and render", async () => {
  const { VIEWS, OVERLAYS, VIEW_TYPES, viewFor, overlayFor, optionSchemaForView, VIEW_CSS } = await import("../../../src/views/registry.js");
  assert.deepEqual(VIEW_TYPES, ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics", "settings"]);
  assert.equal(OVERLAYS.length, 11);
  for (const view of VIEWS) {
    assert.equal(typeof view.defaultEnabled, "function", view.key);
    assert.ok(Array.isArray(view.requires) && view.requires.length, view.key);
    assert.ok(view.icon.startsWith("mdi:"), view.key);
  }
  assert.equal(viewFor("rooms").key, "rooms");
  assert.equal(overlayFor("release").key, "release");
  assert.equal(viewFor("garden"), null);
  assert.deepEqual(Object.keys(optionSchemaForView("rooms")), ["sort", "show_disabled"]);
  assert.equal(new Set(VIEW_CSS).size, VIEW_CSS.length);
});

test("a field ties its label, hint and error to the control", async () => {
  const { renderField, fieldId } = await import("../../../src/views/controls/fields.js");
  const built = await modelFor("typical");
  const { document, context } = await renderContext(built.texts);
  const text = parse(document, renderField(context, { key: "name", label: "Name", control: "text", value: `<b>`, hint: "Shown in the queue", error: "Required", optionalLabel: "optional" }));
  const input = text.querySelector("input");
  assert.equal(input.id, fieldId("name"));
  assert.equal(text.querySelector("label").getAttribute("for"), input.id);
  assert.equal(input.getAttribute("aria-describedby"), `${input.id}-hint ${input.id}-error`);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(input.value, "<b>");
  const choice = parse(document, renderField(context, { key: "mode", label: "Mode", control: "segmented", value: "mop", options: [{ value: "vacuum", label: "Vacuum" }, { value: "mop", label: "Mop" }] }));
  const group = choice.querySelector("[role=radiogroup]");
  assert.equal(group.getAttribute("aria-labelledby"), `${fieldId("mode")}-label`);
  assert.deepEqual([...group.querySelectorAll("[role=radio]")].map((radio) => [radio.getAttribute("aria-checked"), radio.tabIndex]), [["false", -1], ["true", 0]]);
  const none = parse(document, renderField(context, { key: "rooms", label: "Rooms", control: "chips", value: [], options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }));
  assert.deepEqual([...none.querySelectorAll("[role=option]")].map((option) => option.tabIndex), [0, -1], "the first option is the tab stop when none is chosen");
  assert.equal(renderField(context, { key: "x", control: "text", hidden: true }), "");
});

test("an inline field puts label and hint beside the control; a single entity hides its search once chosen", async () => {
  const { renderField } = await import("../../../src/views/controls/fields.js");
  const built = await modelFor("typical");
  const { document, context } = await renderContext(built.texts);
  const inline = parse(document, renderField(context, { key: "roles.battery.mode", label: "Battery", control: "segmented", layout: "inline", value: "auto", hint: "Found: Rocky battery", options: [{ value: "auto", label: "Automatic" }] }));
  assert.ok(inline.querySelector(".voc-field--inline > .voc-field-text > .voc-field-hint"));
  const chosen = parse(document, renderField(context, { key: "roles.battery.entity", label: "Entity", labelHidden: true, control: "entities", single: true, value: [{ value: "sensor.b", label: "Battery" }], queryKey: "query:roles.battery.entity" }));
  assert.equal(chosen.querySelector("input"), null);
  assert.ok(chosen.querySelector(".voc-field-label.voc-sr-only"));
  const searching = parse(document, renderField(context, { key: "requiredOn", label: "On", control: "entities", value: [], queryKey: "query:requiredOn", query: "do", matches: [{ value: "binary_sensor.door", label: "Door" }] }));
  const search = searching.querySelector("input[role=combobox]");
  assert.equal(search.getAttribute("aria-expanded"), "true");
  assert.equal(search.dataset.field, "query:requiredOn");
  assert.equal(searching.querySelector("[role=listbox] .voc-entity-match").dataset.action, "toggle-value");
});

test("a stepper disables the step that would leave its bounds", async () => {
  const { renderField } = await import("../../../src/views/controls/fields.js");
  const built = await modelFor("typical");
  const { document, context } = await renderContext(built.texts);
  const host = parse(document, renderField(context, { key: "passes", label: "Passes", control: "stepper", value: 1, min: 1, max: 10 }));
  const [down, up] = host.querySelectorAll("button");
  assert.equal(down.hasAttribute("disabled"), true);
  assert.equal(up.hasAttribute("disabled"), false);
  assert.equal(host.querySelector("input").value, "1");
});

test("every view renders keyed markup with named controls", async () => {
  const { VIEWS } = await import("../../../src/views/registry.js");
  const requests = { templates: { name: "templates", params: {} }, jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } }, runs: { name: "runs", params: { offset: 0, limit: 25 } }, diagnostics: { name: "diagnostics", params: {} }, trace: { name: "trace", params: {} } };
  for (const scenario of ["typical", "attention", "fresh", "empty"]) {
    const built = await modelFor(scenario, { requests });
    const { document, context } = await renderContext(built.texts);
    for (const view of VIEWS) {
      const options = Object.fromEntries(Object.entries(view.optionsSchema).map(([name, schema]) => [name, schema.default]));
      const vm = view.build({ ...built, options, config: { time_format: "auto", page_size: 25 }, ui: { choices: {} } });
      const host = parse(document, view.render(context, vm));
      assert.equal(host.firstElementChild.getAttribute("data-key"), `view:${view.key}`, `${scenario}/${view.key}`);
      assertMarkupContract(host, `${scenario}/${view.key}`);
    }
  }
});

// The row layout keys off `data-actions`: several actions form a bar on narrow cards, a single
// one stays beside the title, none leaves no empty container.
test("a job row states how many actions it carries and ends with the action that runs the job", async () => {
  const { viewFor } = await import("../../../src/views/registry.js");
  const queue = viewFor("queue");
  const options = { show_active: true, show_attention: true, show_templates: true };
  const layoutOf = async (scenario) => {
    const built = await modelFor(scenario, { requests: { templates: { name: "templates", params: {} } } });
    const { document, context } = await renderContext(built.texts);
    const host = parse(document, queue.render(context, queue.build({ ...built, options, config: { time_format: "auto" }, ui: { choices: {} } })));
    return Object.fromEntries([...host.querySelectorAll(".voc-job")].map((node) => {
      const actions = node.querySelector(".voc-job-actions");
      const sequence = actions ? [...actions.children].map((child) => child.dataset.action || child.className) : null;
      return [node.dataset.key, { layout: node.dataset.actions, sequence }];
    }));
  };
  const typical = await layoutOf("typical");
  assert.deepEqual(typical["job:job-kitchen"], { layout: "several", sequence: ["move-job", "move-job", "edit-job", "voc-job-actions-gap", "start-job"] });
  assert.deepEqual(typical["job:job-running"], { layout: "one", sequence: ["cancel-job"] });
  const attention = await layoutOf("attention");
  const attentionRow = Object.entries(attention).find(([, row]) => row.layout === "none");
  assert.ok(attentionRow, "a job that needs attention offers no row action");
  assert.equal(attentionRow[1].sequence, null);
});

// A room's release control keeps the trailing place and switches with the room's state.
test("a room card ends with the control that switches its release", async () => {
  const { viewFor } = await import("../../../src/views/registry.js");
  const rooms = viewFor("rooms");
  const built = await modelFor("typical");
  const { document, context } = await renderContext(built.texts);
  const host = parse(document, rooms.render(context, rooms.build({ ...built, options: { sort: "configured", show_disabled: false }, config: {}, ui: { choices: {}, expanded: [] } })));
  const actionsOf = (roomId) => [...host.querySelectorAll(`[data-key="room:${roomId}"] .voc-room-actions > button`)].map((node) => [node.dataset.action, node.classList.contains("voc-room-toggle")]);
  assert.deepEqual(actionsOf("room-kitchen"), [["create-job", false], ["revoke-room", true]]);
  assert.deepEqual(actionsOf("room-bathroom"), [["create-job", false], ["open-release", true]]);
});

// The detail footer follows the job row: destructive actions first and set apart, editing in the
// middle, the action that drives the run (start, cancel of a started job, retry) last.
test("the detail page keeps the run action last and the reordering beside the position", async () => {
  const { overlayFor } = await import("../../../src/views/registry.js");
  const detail = overlayFor("job-detail");
  const pageFor = async (jobId) => {
    const built = await modelFor("typical", { requests: { job: { name: "job", params: { jobId } }, execution: { name: "execution", params: { jobId } }, trace: { name: "trace", params: { jobId } } } });
    const { document, context } = await renderContext(built.texts);
    return parse(document, detail.render(context, detail.build({ ...built, overlay: { kind: "job-detail", jobId }, config: {}, ui: {} })));
  };
  const footer = (host) => [...host.querySelectorAll(".voc-overlay-actions > button")].map((node) => [node.dataset.action, node.classList.contains("voc-action-start")]);
  const waiting = await pageFor("job-bathroom");
  assert.deepEqual(footer(waiting), [["delete-job", false], ["cancel-job", true], ["edit-job", false], ["start-job", false]]);
  assert.deepEqual([...waiting.querySelectorAll('[data-key="position"] [data-action="move-job"]')].map((node) => JSON.parse(node.dataset.args).direction), ["top", "bottom"]);
  const running = await pageFor("job-running");
  assert.deepEqual(footer(running), [["cancel-job", false]]);
  assert.equal(running.querySelector('[data-key="position"]'), null);
  const failed = await pageFor("job-failed");
  assert.deepEqual(footer(failed), [["delete-job", true], ["retry-job", false]]);
});

test("every page renders inside the shared frame with a heading to focus", async () => {
  const { OVERLAYS } = await import("../../../src/views/registry.js");
  const { createDraft } = await import("../../../src/domain/job-draft.js");
  const { createRoomDraft } = await import("../../../src/domain/room-draft.js");
  const { createRobotDraft } = await import("../../../src/domain/robot-draft.js");
  const built = await modelFor("attention", { needsEntityCatalog: true, requests: { candidates: { name: "candidates", params: {} } } });
  const room = built.model.slots.rooms.data.items[0];
  const robot = built.model.slots.robots.data.items[1];
  const pages = {
    "job-editor": { draft: createDraft() },
    "job-detail": { jobId: "job-kitchen" },
    confirm: { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", jobId: "job-kitchen", command: {} },
    "start-job": { jobId: "job-kitchen" },
    recovery: { robotId: "robot-rocky", confirmStopped: false },
    "queue-settings": { minutes: 15 },
    release: { roomId: room.roomId, releaseKind: "timed" },
    "room-editor": { draft: createRoomDraft(room), bindingsOpen: true },
    "room-create": { name: "" },
    "robot-add": {},
    "robot-editor": { draft: createRobotDraft(robot), open: ["roles", "requirements", "optionMaps", "timeouts", "identity"] },
  };
  const { document, context } = await renderContext(built.texts);
  for (const overlay of OVERLAYS) {
    const vm = overlay.build({ ...built, overlay: { kind: overlay.key, ...pages[overlay.key] }, config: {}, ui: {} });
    const host = parse(document, overlay.render(context, vm));
    const frame = host.querySelector(".voc-overlay");
    assert.equal(frame.getAttribute("data-key"), `overlay:${overlay.key}`, overlay.key);
    assert.equal(frame.getAttribute("aria-labelledby"), "voc-overlay-title");
    assert.equal(host.querySelector("#voc-overlay-title").getAttribute("tabindex"), "-1");
    assert.ok(host.querySelector('[data-action="back"]'), `${overlay.key} can be left`);
    assertMarkupContract(host, overlay.key);
  }
});
