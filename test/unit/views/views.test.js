// The view layer: the registry's declarations, form fields with their ARIA ties, and every view
// and page renderer producing keyed, escaped markup whose controls name an action.

const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { modelFor } = require("../../helpers/model.js");

const BUSY = "A busy afternoon";
const busy = (options = {}) => modelFor("showcase", { from: BUSY, ...options });
const TEMPLATES = { templates: { name: "templates", params: {} } };
const jobRequests = (jobId) => ({ job: { name: "job", params: { jobId } }, execution: { name: "execution", params: { jobId } }, trace: { name: "trace", params: { jobId } } });
const roomId = (model, name) => model.slots.rooms.data.items.find((room) => room.name === name).roomId;
const jobIn = (model, name) => {
  const id = roomId(model, name);
  return [...model.slots.queue.data.jobs, ...model.slots.openJobs.data.jobs].find((job) => job.roomIds.includes(id));
};

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
  assert.equal(OVERLAYS.length, 16);
  assert.equal(overlayFor("setup-guide").key, "setup-guide");
  assert.equal(overlayFor("cancel-job").key, "cancel-job");
  assert.equal(overlayFor("queue-end").key, "queue-end");
  assert.equal(overlayFor("save-template").key, "save-template");
  assert.equal(overlayFor("job-defaults").key, "job-defaults");
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
  const built = await busy();
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
  const muted = parse(document, renderField(context, { key: "rooms", label: "Rooms", control: "chips", value: ["all"], options: [{ value: "all", label: "All" }, { value: "b", label: "B", muted: true }] }));
  assert.deepEqual([...muted.querySelectorAll("[role=option]")].map((option) => [option.classList.contains("is-muted"), option.getAttribute("aria-selected")]), [[false, "true"], [true, "false"]]);
  assert.equal(renderField(context, { key: "x", control: "text", hidden: true }), "");
  // A11Y-05: a chosen option shows a check in place of its icon, not only a colour.
  const icons = (fragment) => [...fragment.querySelectorAll(".voc-option")].map((option) => option.querySelector("ha-icon")?.getAttribute("icon") ?? null);
  assert.deepEqual(icons(parse(document, renderField(context, { key: "mode", label: "Mode", control: "segmented", value: "mop", options: [{ value: "vacuum", label: "Vacuum", icon: "mdi:robot-vacuum" }, { value: "mop", label: "Mop", icon: "mdi:water" }] }))), ["mdi:robot-vacuum", "mdi:check"]);
  assert.deepEqual(icons(parse(document, renderField(context, { key: "rooms", label: "Rooms", control: "chips", value: ["b"], options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }))), [null, "mdi:check"]);
});

test("an inline field puts label and hint beside the control; a single entity hides its search once chosen", async () => {
  const { renderField } = await import("../../../src/views/controls/fields.js");
  const built = await busy();
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
  const built = await busy();
  const { document, context } = await renderContext(built.texts);
  const host = parse(document, renderField(context, { key: "passes", label: "Passes", control: "stepper", value: 1, min: 1, max: 10 }));
  const [down, up] = host.querySelectorAll("button");
  assert.equal(down.hasAttribute("disabled"), true);
  assert.equal(up.hasAttribute("disabled"), false);
  assert.equal(host.querySelector("input").value, "1");
});

test("every view renders keyed markup with named controls", async () => {
  const { VIEWS } = await import("../../../src/views/registry.js");
  // The busy afternoon with history and diagnostics; the other homes read what a card reads first.
  const history = { jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } }, runs: { name: "runs", params: { offset: 0, limit: 25 } }, diagnostics: { name: "diagnostics", params: {} }, trace: { name: "trace", params: {} } };
  const homes = [
    ["showcase", BUSY, { ...TEMPLATES, ...history }],
    ["attention", "The station needs attention", TEMPLATES],
    ["recovery", "The job needs clarification", TEMPLATES],
    ["no_robot", "The card opens", TEMPLATES],
    ["queue_end", "The card opens", TEMPLATES],
  ];
  for (const [name, from, requests] of homes) {
    const scenario = `${name}/${from}`;
    const built = await modelFor(name, { from, requests });
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

// The row layout keys off `data-actions`. The main action of the job's state comes first, set apart
// from the managing icons that end the row; on a narrow card the menu holding them takes their place
// (LAY-09).
test("a job row states how many actions it carries: its main action, the managing icons, their menu", async () => {
  const { viewFor } = await import("../../../src/views/registry.js");
  const queue = viewFor("queue");
  const options = { show_active: true, show_attention: true, show_templates: true };
  const layoutOf = async (name, from) => {
    const built = await modelFor(name, { from, requests: TEMPLATES });
    const { document, context } = await renderContext(built.texts);
    const host = parse(document, queue.render(context, queue.build({ ...built, options, config: { time_format: "auto" }, ui: { choices: {} } })));
    const rows = Object.fromEntries([...host.querySelectorAll(".voc-job")].map((node) => {
      const actions = node.querySelector(".voc-job-actions");
      const sequence = actions ? [...actions.children].map((child) => child.dataset.action || child.className.replace("voc-button voc-button--text ", "").replace("voc-button voc-button--danger ", "")) : null;
      const manage = [...node.querySelectorAll(".voc-job-manage > button")].map((child) => child.dataset.action);
      const menu = [...node.querySelectorAll(".voc-menu-anchor > button")].map((child) => [child.dataset.action, child.getAttribute("aria-expanded")]);
      return [node.dataset.key, { layout: node.dataset.actions, sequence, manage, menu }];
    }));
    return { rows, built };
  };
  const { rows: either, built: choice } = await layoutOf("robot_choice", "Either robot can start the dining room");
  assert.deepEqual(either[`job:${jobIn(choice.model, "Dining Room").jobId}`], { layout: "several", sequence: ["start-job", "voc-job-actions-gap", "voc-job-manage", "voc-menu-anchor"], manage: ["move-job", "move-job", "edit-job"], menu: [["toggle-menu", "false"]] });
  const { rows: busyRows, built } = await layoutOf("showcase", BUSY);
  assert.deepEqual(busyRows[`job:${jobIn(built.model, "Studio").jobId}`], { layout: "one", sequence: ["cancel-job"], manage: [], menu: [] });
  const { rows: stuck } = await layoutOf("recovery", "The job needs clarification");
  const attentionRow = Object.entries(stuck).find(([, row]) => row.layout === "none");
  assert.ok(attentionRow, "a job that needs clarification offers no row action");
  assert.equal(attentionRow[1].sequence, null);
});

// A room's release control keeps the trailing place and switches with the room's state.
test("a room card ends with the control that switches its release", async () => {
  const { viewFor } = await import("../../../src/views/registry.js");
  const rooms = viewFor("rooms");
  const built = await busy();
  const { document, context } = await renderContext(built.texts);
  const host = parse(document, rooms.render(context, rooms.build({ ...built, options: { sort: "configured", show_disabled: false }, config: {}, ui: { choices: {}, expanded: [] } })));
  const actionsOf = (roomId) => [...host.querySelectorAll(`[data-key="room:${roomId}"] .voc-room-actions > button`)].map((node) => [node.dataset.action, node.classList.contains("voc-room-toggle")]);
  assert.deepEqual(actionsOf(roomId(built.model, "Dining Room")), [["create-job", false], ["revoke-room", true]]);
  assert.deepEqual(actionsOf(roomId(built.model, "Conservatory")), [["create-job", false], ["open-release", true]]);
});

// UI-20: locking a released room and excluding a room are undone in one step, so neither is a
// destructive action in the error colour.
test("locking and excluding a room are not destructive actions", async () => {
  const { overlayFor } = await import("../../../src/views/registry.js");
  const { createRoomDraft } = await import("../../../src/domain/room-draft.js");
  const built = await busy({ needsEntityCatalog: true });
  const { document, context } = await renderContext(built.texts);
  const studio = roomId(built.model, "Studio");
  const release = overlayFor("release");
  const releaseHost = parse(document, release.render(context, release.build({ ...built, overlay: { kind: "release", roomId: studio } })));
  const lock = releaseHost.querySelector('[data-action="revoke-room"]');
  assert.ok(lock, "a released room can be locked from its release dialog");
  assert.ok(!lock.classList.contains("voc-button--danger"));
  const editor = overlayFor("room-editor");
  const editorHost = parse(document, editor.render(context, editor.build({ ...built, overlay: { kind: "room-editor", roomId: studio, draft: createRoomDraft(built.model.slots.rooms.data.items.find((room) => room.roomId === studio)) }, config: {}, ui: {} })));
  const exclude = editorHost.querySelector('[data-action="disable-room"]');
  assert.ok(exclude);
  assert.ok(!exclude.classList.contains("voc-button--danger"));
});

// The detail footer follows the job row: destructive actions first and set apart, editing in the
// middle, the action that drives the run (start, cancel of a started job, retry) last.
// LAY-18, JOB-08: the destructive action stands apart on the left — a waiting job is deleted, a
// started one cancelled, never both — and starting or creating again stays last.
test("the detail page sets its one destructive action apart, ends with the run action and reorders beside the position", async () => {
  const { overlayFor } = await import("../../../src/views/registry.js");
  const detail = overlayFor("job-detail");
  // The open or finished job of a room at a mark, with its detail as a card reads it.
  // A finished job is found in the job log, which only a recording with history holds.
  const pageFor = async (name, from, room, { finished = false } = {}) => {
    const plain = await modelFor(name, { from, requests: finished ? { jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } } } : {} });
    const id = roomId(plain.model, room);
    const jobs = [...plain.model.slots.queue.data.jobs, ...plain.model.slots.openJobs.data.jobs, ...(plain.model.slots.jobLog?.data?.jobs ?? [])];
    const { jobId } = jobs.find((job) => job.roomIds.includes(id));
    const built = await modelFor(name, { from, requests: jobRequests(jobId) });
    const { document, context } = await renderContext(built.texts);
    return parse(document, detail.render(context, detail.build({ ...built, overlay: { kind: "job-detail", jobId }, config: {}, ui: {} })));
  };
  const footer = (host) => [...host.querySelectorAll(".voc-overlay-actions > button")].map((node) => [node.dataset.action, node.classList.contains("voc-action-start")]);
  const waiting = await pageFor("robot_choice", "Either robot can start the dining room", "Dining Room");
  assert.deepEqual(footer(waiting), [["delete-job", true], ["open-save-template", false], ["edit-job", false], ["start-job", false]]);
  assert.deepEqual([...waiting.querySelectorAll('[data-key="position"] [data-action="move-job"]')].map((node) => JSON.parse(node.dataset.args).direction), ["top", "bottom"]);
  const running = await pageFor("showcase", BUSY, "Studio");
  assert.deepEqual(footer(running), [["cancel-job", true], ["open-save-template", false]]);
  assert.equal(running.querySelector('[data-key="position"]'), null);
  const corrected = await pageFor("recovery", "The library job is corrected", "Library", { finished: true });
  assert.deepEqual(footer(corrected), [["delete-job", true], ["open-save-template", false], ["retry-job", false]]);
});

test("every page renders inside the shared frame, every dialog in the dialog frame, each with a heading to focus", async () => {
  const { OVERLAYS, isDialog } = await import("../../../src/views/registry.js");
  const { createDraft } = await import("../../../src/domain/job-draft.js");
  const { createRoomDraft } = await import("../../../src/domain/room-draft.js");
  const { createRobotDraft } = await import("../../../src/domain/robot-draft.js");
  const built = await busy({ needsEntityCatalog: true });
  const room = built.model.slots.rooms.data.items[0];
  const robot = built.model.slots.robots.data.items[0];
  const library = jobIn(built.model, "Library").jobId;
  const pages = {
    "job-editor": { draft: createDraft() },
    "job-detail": { jobId: library },
    confirm: { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", jobId: library, command: {} },
    "start-job": { jobId: library },
    recovery: { robotId: robot.robotId, confirmStopped: false },
    "queue-settings": { minutes: 15 },
    release: { roomId: room.roomId, releaseKind: "timed" },
    "room-editor": { draft: createRoomDraft(room), bindingsOpen: true },
    "room-create": { name: "" },
    "robot-add": {},
    "robot-editor": { draft: createRobotDraft(robot), open: ["roles", "requirements", "optionMaps", "timeouts", "identity"] },
  };
  const { document, context } = await renderContext(built.texts);
  const dialogs = OVERLAYS.filter((overlay) => isDialog(overlay.key)).map((overlay) => overlay.key);
  assert.deepEqual(dialogs.sort(), ["cancel-job", "confirm", "queue-end", "queue-settings", "recovery", "release", "save-template", "start-job"]);
  for (const overlay of OVERLAYS) {
    const vm = overlay.build({ ...built, overlay: { kind: overlay.key, ...pages[overlay.key] }, config: {}, ui: {} });
    const host = parse(document, overlay.render(context, vm));
    if (isDialog(overlay.key)) {
      const dialog = host.querySelector(".voc-dialog");
      assert.equal(dialog.getAttribute("data-key"), `overlay:${overlay.key}`, overlay.key);
      assert.deepEqual([dialog.getAttribute("role"), dialog.getAttribute("aria-labelledby"), dialog.getAttribute("aria-modal")], ["dialog", "voc-dialog-title", null], overlay.key);
      assert.equal(host.querySelector("#voc-dialog-title").getAttribute("tabindex"), "-1");
      assert.equal(host.querySelector(".voc-back"), null, `${overlay.key} has no back control of its own`);
      assert.ok(host.querySelector('.voc-dialog-actions [data-action="back"]'), `${overlay.key} can be left from its actions`);
      const parts = [...dialog.querySelector(":scope > fieldset.voc-layer").children].map((child) => child.className);
      assert.deepEqual(parts, ["voc-dialog-title", "voc-dialog-scroll", "voc-dialog-actions"], `${overlay.key}: heading, content, actions`);
      assert.equal(dialog.querySelector(".voc-layer").disabled, false, overlay.key);
      assert.ok(dialog.querySelector(".voc-dialog-scroll").hasAttribute("data-scroll"));
      assertMarkupContract(host, overlay.key);
      continue;
    }
    const frame = host.querySelector(".voc-overlay");
    assert.equal(frame.getAttribute("data-key"), `overlay:${overlay.key}`, overlay.key);
    assert.deepEqual([frame.getAttribute("role"), frame.getAttribute("aria-labelledby")], ["region", "voc-overlay-title"], overlay.key);
    assert.equal(host.querySelector("#voc-overlay-title").getAttribute("tabindex"), "-1");
    assert.ok(host.querySelector('[data-action="back"]'), `${overlay.key} can be left`);
    const parts = [...frame.querySelector(":scope > fieldset.voc-layer").children].map((child) => child.className);
    assert.deepEqual(parts, ["voc-overlay-head", "voc-overlay-scroll", "voc-overlay-actions"], `${overlay.key}: heading, one region that scrolls, the footer`);
    assert.equal(frame.querySelector(".voc-layer").disabled, false, overlay.key);
    assert.ok(frame.querySelector(".voc-overlay-scroll").hasAttribute("data-scroll"));
    assertMarkupContract(host, overlay.key);
  }
});

// UI-16, UI-17: while its command waits, a page or dialog is busy and all its controls are
// disabled together; a dialog shows its command's failure itself, a missing answer as a warning.
test("a page or dialog waiting for its command disables its controls, and a dialog shows its failure", async () => {
  const { frame } = await import("../../../src/views/overlays/frame.js");
  const { dialog } = await import("../../../src/views/overlays/dialog.js");
  const { document, context } = await renderContext(null);
  const actions = '<button data-action="back">B</button><button data-action="confirm-command">C</button>';
  const busy = { ...context, layer: { busy: true, failure: null } };
  for (const host of [parse(document, frame(busy, { key: "x", title: "X", content: "<input>", actions })), parse(document, dialog(busy, { key: "x", title: "X", lead: "L", actions }))]) {
    const section = host.querySelector("section");
    assert.equal(section.getAttribute("aria-busy"), "true");
    assert.equal(section.querySelector(":scope > fieldset.voc-layer").disabled, true);
    assert.ok([...section.querySelectorAll("button, input")].every((control) => control.matches(":disabled")), "every control waits");
  }
  const refused = parse(document, dialog({ ...context, layer: { busy: false, failure: { kind: "error", text: "Refused" } } }, { key: "x", title: "X", lead: "L", invalid: "Checked", actions }));
  assert.equal(refused.querySelector("section").hasAttribute("aria-busy"), false);
  assert.deepEqual([...refused.querySelectorAll(".voc-dialog-scroll > *")].map((node) => [node.className, node.textContent]), [["voc-overlay-lead", "L"], ["voc-notice voc-notice--error", "Refused"]], "the failure, not an earlier verdict");
  const unknown = parse(document, dialog({ ...context, layer: { busy: false, failure: { kind: "warning", text: "Unknown" } } }, { key: "x", title: "X", actions }));
  assert.equal(unknown.querySelector('[data-key="invalid"]').className, "voc-notice voc-notice--warning");
  assert.equal(unknown.querySelector('[data-key="invalid"] ha-icon').getAttribute("icon"), "mdi:alert-outline");
});

test("a page frame without lead and content has no region to scroll; without actions its footer leads back", async () => {
  const { frame } = await import("../../../src/views/overlays/frame.js");
  const { document, context } = await renderContext(null);
  const bare = parse(document, frame(context, { key: "x", title: "X", actions: "<button data-action=\"back\">B</button>" }));
  assert.equal(bare.querySelector(".voc-overlay-scroll"), null);
  assert.deepEqual([...parse(document, frame(context, { key: "x", title: "X" })).querySelectorAll(".voc-overlay-actions > button")].map((node) => node.dataset.action), ["back"]);
  const lead = parse(document, frame(context, { key: "x", title: "X", lead: "<b>" }));
  assert.equal(lead.querySelector(".voc-overlay-scroll > .voc-overlay-lead").textContent, "<b>");
});
