// Holds on waiting jobs (JOB-19 to JOB-22): a deletion's dialog and an editor hold their job so
// it cannot start meanwhile; one timer renews every editor's hold while the card is attached. The
// renewal timer is the only state of the action modules. See internal dev doc §9 "Aktionsvertrag".

import { jobTarget } from "../../../domain/affordances.js";
import { QUEUE_SCOPES } from "./shared.js";

// An editor renews its hold well within the integration's 90 s lease.
export const HOLD_RENEW_MS = 30000;

export function createHolds({ ui, getSession, platform }) {
  let renewal = null;
  let paused = false;
  const heldEditors = () => ui.snapshot.overlays.filter((overlay) => overlay.kind === "job-editor" && overlay.holdId);

  // A release has nothing to show: if it fails, the hold ends with its lease. It has a target of
  // its own, so the job's controls stay usable meanwhile and focus can return to them.
  function releaseHold(holdId) {
    void getSession()?.command("release_job_hold", { hold_id: holdId }, { target: `hold:${holdId}`, invalidates: QUEUE_SCOPES });
  }

  // The dialog owns the hold: it sends `hold_id` with the deletion and releases the hold when it
  // is left without deleting, which restarts the start delay (QUE-11). A hold that arrives after
  // the dialog is gone is released at once.
  async function holdForDeletion(dialogId, jobId) {
    const result = await getSession()?.command("hold_job", { job_id: jobId, purpose: "confirm" }, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES });
    if (!result) return;
    if (!ui.find(dialogId)) {
      if (result.ok) releaseHold(result.data.hold_id);
    } else if (result.ok) ui.patchOverlay(dialogId, { holdId: result.data.hold_id });
    else ui.patchOverlay(dialogId, { failure: result });
  }

  // The editor is busy until the hold arrives; a hold that arrives after the editor is gone is
  // released at once. An editor refused its first hold closes with the reason; one that lost its
  // hold stays with its draft and says why.
  async function holdForEditing(editorId, jobId, { first = false } = {}) {
    const result = await getSession()?.command("hold_job", { job_id: jobId, purpose: "edit" }, { target: jobTarget(jobId), invalidates: QUEUE_SCOPES });
    if (!result) return null;
    if (!ui.find(editorId)) {
      if (result.ok) releaseHold(result.data.hold_id);
      return result;
    }
    if (result.ok) {
      ui.patchOverlay(editorId, { busy: false, holdId: result.data.hold_id, holdLost: false, holdFailure: null });
      keepHolds();
    } else if (first && ui.overlay?.id === editorId) {
      ui.closeOverlay();
      ui.setNotice({ kind: "error", operation: "hold_job", failure: result });
    } else ui.patchOverlay(editorId, { busy: false, holdId: null, holdLost: true, holdFailure: result });
    return result;
  }

  // The timer stops once no editor holds a job, and while the card is detached, so a hold nobody
  // looks at lapses (JOB-20).
  function keepHolds() {
    if (!renewal && !paused && heldEditors().length) renewal = platform?.setTimeout?.(renewHolds, HOLD_RENEW_MS) ?? null;
  }

  async function renewHolds() {
    renewal = null;
    const editors = heldEditors();
    keepHolds();
    for (const editor of editors) {
      const result = await getSession()?.command("renew_job_hold", { hold_id: editor.holdId }, { target: `hold:${editor.holdId}`, invalidates: [] });
      if (result && !result.ok && result.code === "hold_expired" && ui.find(editor.id)) ui.patchOverlay(editor.id, { holdId: null, holdLost: true, holdFailure: null });
    }
  }

  return {
    releaseHold,
    holdForDeletion,
    holdForEditing,
    pause() {
      paused = true;
      platform?.clearTimeout?.(renewal);
      renewal = null;
    },
    // Back on screen the card renews at once: a hold that lapsed meanwhile shows in its editor.
    resume() {
      paused = false;
      return heldEditors().length ? renewHolds() : null;
    },
  };
}
