// A command's life (UI-16, UI-17): sent from the page or dialog on top, checked first when it is
// a form's, asked first when it is destructive, and answered in that page, that dialog or the
// card's notice. See internal dev doc §9 "Command-Lebenszyklus".

import { isTransportFailure } from "../../../domain/backend-errors.js";
import { formErrors } from "../../../domain/validation.js";
import { ALL } from "./shared.js";

export function createLifecycle({ ui, getSession, getConfig, isDialog }) {
  // The page or dialog on top when a command is sent is its origin: it is busy until the answer
  // and, on success, leaves with `closeOverlay` layers (true one, a number that many, "all" every
  // page) only while it is still on top. A refusal stays in a dialog origin, else it becomes the
  // card's notice; without an answer the result is unknown, the session reloads and nothing is
  // sent again.
  async function run(operation, parameters, { target = operation, invalidates = ALL, success = null, closeOverlay = false } = {}) {
    const session = getSession();
    if (!session) return null;
    const origin = ui.overlay;
    ui.setNotice(null);
    if (origin) ui.patchOverlay(origin.id, { busy: true, failure: null });
    const result = await session.command(operation, parameters, { target, invalidates });
    const open = origin ? ui.find(origin.id) : null;
    if (open) ui.patchOverlay(origin.id, { busy: false });
    const onTop = Boolean(open) && ui.overlay.id === origin.id;
    if (result?.ok) {
      if (onTop && closeOverlay === ALL) ui.closeAllOverlays();
      else if (onTop && closeOverlay) ui.closeOverlay(closeOverlay === true ? 1 : closeOverlay);
      if (success) ui.setNotice({ kind: "success", messageKey: success.key, vars: success.vars || null });
    } else if (result) {
      if (open && isDialog(origin.kind)) ui.patchOverlay(origin.id, { failure: result });
      else if (isTransportFailure(result)) ui.setNotice({ kind: "warning", messageKey: "notice.outcomeUnknown" });
      else ui.setNotice({ kind: "error", operation, failure: result });
      if (onTop) ui.requestFocus(isDialog(origin.kind) ? "#voc-dialog-title" : "#voc-overlay-title");
    }
    return result;
  }

  // A form's command: the integration checks the input first; errors stay on the page at their
  // fields and nothing is sent. `fieldOf(path)` names the page's field for an error path. The page
  // is busy from the check on.
  async function submit(operation, parameters, fieldOf, options) {
    const session = getSession();
    if (!session) return null;
    const page = ui.overlay;
    ui.setNotice(null);
    if (page) ui.patchOverlay(page.id, { busy: true });
    const verdict = await session.validate(operation, parameters);
    if (page) ui.patchOverlay(page.id, { busy: false });
    // The page left meanwhile: what was checked is no longer shown.
    if (ui.overlay?.id !== page?.id) return null;
    if (!verdict?.ok) {
      ui.setNotice({ kind: "error", operation, failure: verdict });
      return verdict;
    }
    if (!verdict.data.valid) {
      ui.updateOverlay(formErrors(verdict.data, fieldOf));
      return null;
    }
    if (page?.errors || page?.formError) ui.updateOverlay({ errors: null, formError: null });
    return run(operation, parameters, options);
  }

  // A destructive command asks first; the confirmation page carries the command.
  function confirmOr(command, confirmation) {
    if (getConfig()?.confirm_destructive === false) return run(command.operation, command.parameters, command.options);
    ui.openOverlay({ kind: "confirm", ...confirmation, command });
    return null;
  }

  // A start below the battery minimum asks first; the dialog carries the start (JOB-27).
  function confirmLowBattery(robotId, command) {
    ui.openOverlay({ kind: "low-battery-start", robotId, command });
  }

  return { run, submit, confirmOr, confirmLowBattery };
}

export function lifecycleActions({ ui, lifecycle, holds }) {
  const { run } = lifecycle;
  return {
    // The confirmation waits for the answer and then leaves with what its command closes (the
    // page it interrupted, or every page); a discard leaves that page at once. A deletion whose
    // hold has lapsed asks again under a new hold, beside the integration's reason.
    "confirm-command": async () => {
      const dialog = ui.overlay;
      const command = dialog?.command;
      if (!command) return null;
      if (command.discard) {
        const editor = ui.snapshot.overlays.at(-2);
        ui.closeOverlay(2);
        if (editor?.holdId) holds.releaseHold(editor.holdId);
        return null;
      }
      const closes = command.options?.closeOverlay;
      const parameters = dialog.holdId ? { ...command.parameters, hold_id: dialog.holdId } : command.parameters;
      const result = await run(command.operation, parameters, { ...command.options, closeOverlay: closes === ALL ? ALL : closes ? 2 : 1 });
      if (result?.code === "hold_expired" && ui.find(dialog.id)) {
        ui.patchOverlay(dialog.id, { holdId: null });
        await holds.holdForDeletion(dialog.id, dialog.jobId);
      }
      return result;
    },
  };
}
