// The card shell as data: header, notices, stats, tab strip and the body slot. Section and
// overlay content is built by their own renderers and handed in, so the shell stays
// view-agnostic. See internal dev doc §5 "Shell-Viewmodel".

import { buildHeader, composeAutomaticSubtitle } from "./header.js";
import { buildNotices, buildWarningBlock, composeSubtitle, hintText } from "./notices.js";
import { buildCardControls } from "./controls.js";
import { buildShellState } from "./empty-states.js";
import { buildStats } from "./stats.js";
import { buildTabs } from "./tabs.js";
import { resolveTone, toneStyleDeclaration } from "./tone.js";

export function buildCardViewModel({
  model = {},
  config = {},
  texts,
  ui = {},
  sectionDefinitions = [],
  sectionContent = null,
  overlay = null,
} = {}) {
  const tone = resolveTone(model);
  const notices = buildNotices({
    configDiagnostics: config._configDiagnostics || [],
    diagnostics: [...(model.diagnostics?.warnings || []), ...(model.diagnostics?.hints || [])],
    texts,
  });
  const header = {
    ...buildHeader({ model, config, texts }),
    ...composeSubtitle({ config, automatic: composeAutomaticSubtitle(model, texts), hint: hintText(notices.hints, texts) }),
  };
  const shellState = buildShellState(model, texts);
  const tabs = buildTabs({ sectionDefinitions, model, config, ui, texts });
  const hasSection = shellState.available && Boolean(tabs.active);

  let body;
  if (overlay) body = { kind: "overlay", overlay: overlay.key, content: overlay.content };
  else if (hasSection) body = { kind: "section", section: tabs.active, content: sectionContent };
  else body = { kind: "empty", message: shellState.available ? texts.t("unavailable.noSection") : shellState.message };

  return {
    empty: !shellState.available,
    shellState,
    tone: tone.key,
    toneStyle: toneStyleDeclaration(tone),
    header,
    warning: buildWarningBlock({ config, notices, texts }),
    notices,
    stats: buildStats(model, texts),
    hasStats: config.show?.stats !== false && !overlay,
    tabs,
    hasTabs: tabs.visible && !overlay,
    body,
    accentLine: config.show?.accent_line !== false,
    accentLinePosition: config.accent_line || "top",
    density: config.density || "auto",
    controls: buildCardControls({ model, config, texts, overlay }),
    noSectionMessage: texts.t("unavailable.noSection"),
    liveMessage: model.lastCommandError ? texts.t("warning.commandFailed", { code: model.lastCommandError.code }) : "",
  };
}
