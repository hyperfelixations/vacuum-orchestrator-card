// The card dialog: a short question with its answers above the view or page that opened it. The
// shell lays it over the card and makes everything below inert; the dashboard stays usable, so
// the dialog is not `aria-modal`. Heading, then lead, the integration's verdict on a rejected
// input and content in the one region that scrolls when the card is short, then the actions.
// Leaving it is one of its actions; it has no back control of its own.

import { e } from "../../render/primitives/markup.js";
import { invalidNotice } from "./frame.js";

export function dialog({ key, title, lead = "", invalid = null, content = "", actions = "" }) {
  const notice = invalidNotice(invalid);
  const body = lead || notice || content ? `<div class="voc-dialog-scroll" data-scroll>${lead ? `<p class="voc-overlay-lead">${e(lead)}</p>` : ""}${notice}${content}</div>` : "";
  return `<section class="voc-dialog" data-key="overlay:${e(key)}" role="dialog" aria-labelledby="voc-dialog-title"><h2 class="voc-dialog-title" id="voc-dialog-title" tabindex="-1">${e(title)}</h2>${body}<div class="voc-dialog-actions">${actions}</div></section>`;
}
