// The card shell as data: accent line, header, warning block, main panel, tab row, body, the
// card dialog above them and the per-card notice. View, page and dialog content is built by their
// own renderers and handed in, so the shell stays view-agnostic. A page replaces the view with its
// panel and tabs; a dialog leaves what is below it in place. See internal dev doc §8 "Shell".

import { decide } from "../../domain/affordances.js";
import { failureText, t } from "../common/texts.js";
import { buildHeader } from "./header.js";
import { buildNotices, buildWarningBlock, hintText, withHint } from "./notices.js";
import { buildOnboarding } from "./onboarding.js";
import { buildPanel } from "./panel.js";
import { cardStatus, toneFor } from "./status.js";

function primaryAction(tabs, definitions, model, texts, context) {
  const definition = definitions.find((entry) => entry.key === tabs.active);
  const spec = tabs.activeTab?.available ? definition?.primary : null;
  if (!spec) return null;
  return { action: spec.action, icon: spec.icon, label: t(texts, spec.labelKey), decision: decide(context, { operation: spec.operation, target: spec.target ?? null }) };
}

function noticeFor(ui, texts) {
  const notice = ui?.notice;
  if (!notice) return null;
  if (notice.kind === "error") return { kind: "error", text: failureText(texts, notice.failure), operation: notice.operation };
  return { kind: notice.kind, text: t(texts, notice.messageKey, notice.vars) };
}

export function buildCardViewModel({ model = {}, config = {}, texts, ui = {}, tabs, definitions = [], context, viewContent = null, page = null, dialog = null, scheme = "light" } = {}) {
  const status = cardStatus(model);
  const tone = toneFor(status);
  const notices = buildNotices({ configDiagnostics: config._configDiagnostics || [], diagnostics: [...(model.diagnostics?.warnings || []), ...(model.diagnostics?.hints || [])] });
  const header = withHint(buildHeader({ model, config, texts, status }), hintText(notices.hints, texts));
  const onboarding = buildOnboarding({ model, texts });
  const ready = !onboarding;

  let body;
  if (onboarding) body = { kind: "onboarding", content: onboarding };
  else if (page) body = { kind: "overlay", key: page.key, content: page.content };
  else if (tabs.activeTab?.available && viewContent) body = { kind: "view", key: tabs.active, content: viewContent };
  else if (tabs.activeTab) body = { kind: "unavailable", key: tabs.active, message: t(texts, "view.unavailable", { view: tabs.activeTab.label }) };
  else body = { kind: "empty", message: t(texts, "view.none") };

  return {
    status,
    tone: tone.key,
    toneStyle: tone.style,
    accentLine: config.show?.accent_line !== false,
    accentLinePosition: config.accent_line === "bottom" ? "bottom" : "top",
    header,
    warning: buildWarningBlock({ config, notices, texts }),
    notices,
    panel: ready && !page ? buildPanel({ model, config, texts, context }) : { visible: false },
    tabs: { ...tabs, visible: ready && !page && tabs.visible },
    primary: ready && !page ? primaryAction(tabs, definitions, model, texts, context) : null,
    body,
    dialog: ready && dialog ? { kind: "overlay", key: dialog.key, content: dialog.content } : null,
    scheme: scheme === "dark" ? "dark" : "light",
    notice: noticeFor(ui, texts),
    liveMessage: ui?.notice ? noticeFor(ui, texts).text : "",
  };
}
