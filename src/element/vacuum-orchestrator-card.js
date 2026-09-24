// The custom element: Home Assistant's lifecycle, the render pipeline and the transitions
// between them. It owns config, hass, the shadow DOM and the wiring of backend, model, view
// model and renderers; the controllers own everything else.
//
// Import direction, enforced by test/architecture/source-architecture.test.js:
//   core -> config / i18n / domain -> backend -> application
//        -> presentation -> render + styles -> sections -> controllers -> this file -> index.js

import { clamp } from "../core/numbers.js";
import { normalizeConfig } from "../config/normalize-config.js";
import { ConfigError } from "../config/errors.js";
import { isSupportedLanguage, resolveLanguage, resolveMessageLanguage, translate } from "../i18n/translate.js";
import { formatDateTime, formatDuration, formatNumber, formatRelative } from "../i18n/formatters.js";
import { DEFAULT_LANGUAGE } from "../i18n/locales.js";
import { applyDraftChange, createDraft } from "../domain/job-draft.js";
import { buildCardDomainModel } from "../application/card-domain-model.js";
import { buildCardViewModel } from "../presentation/shell/card-view-model.js";
import { messageForConfigError, renderMessage } from "../presentation/shell/notices.js";
import { createRenderContext } from "../render/primitives/render-context.js";
import { captureFocus, focusSelector, restoreFocus } from "../render/primitives/focus.js";
import { cardStructureSignature, patchCardBody, renderCardBody, renderFailureBody, resolveSectionLayouts } from "../render/composition/card-shell.js";
import { createShadowMount } from "../render/composition/shadow-mount.js";
import { buildStyles } from "../styles/index.js";
import { createBrowserPlatform } from "../controllers/runtime/browser-platform.js";
import { createDiagnosticsReporter } from "../controllers/runtime/diagnostics-reporter.js";
import { createInteractionRuntime } from "../controllers/runtime/interaction-runtime.js";
import { createKeyboardRuntime } from "../controllers/runtime/keyboard-runtime.js";
import { createResizeRuntime } from "../controllers/runtime/resize-runtime.js";
import { createSurfaceWatch } from "../controllers/runtime/surface-watch.js";
import { createUIState } from "../controllers/runtime/ui-state.js";
import { createRenderController } from "../controllers/render/render-controller.js";
import { dataSignature, structuralConfigSignature } from "../controllers/render/render-signatures.js";
import { createOrchestratorBackend } from "../backend/index.js";
import { findJob } from "../presentation/sections/helpers.js";
import {
  OVERLAY_RENDERERS,
  SECTION_CSS,
  SECTION_DEFINITIONS,
  SECTION_RENDERERS,
  filterEntityOptions,
  handleControlKeydown,
  optionSchemaForSection,
} from "../sections/index.js";

const SECTION_TYPES = SECTION_DEFINITIONS.map((definition) => definition.key);
const ALL_RENDERERS = [...SECTION_RENDERERS, ...OVERLAY_RENDERERS];

function textService(language) {
  const t = (key, vars) => translate(language, key, vars);
  return {
    language,
    t,
    formatNumber: (value, digits = 0, options) => formatNumber(language, value, digits, options),
    formatDateTime: (value, options) => formatDateTime(language, value, options),
    formatRelative: (nowMs, thenMs) => formatRelative(language, nowMs, thenMs),
    formatDuration: (value) => formatDuration(language, value, t),
  };
}

export class VacuumOrchestratorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._lovelaceConfig = null;
    this._hass = null;
    this._backend = null;
    this._model = null;
    this._renderContext = null;
    this._platform = createBrowserPlatform(() => this.ownerDocument);
    this._shadowMount = createShadowMount(this.shadowRoot);
    this._ui = createUIState();
    this._ui.subscribe(() => this._renderSafely());
    this._diagnostics = createDiagnosticsReporter({
      platform: this._platform,
      describe: (entry) => renderMessage(entry, (key, vars) => translate(DEFAULT_LANGUAGE, key, vars)),
    });
    this._interaction = createInteractionRuntime({
      root: this.shadowRoot,
      onAction: (event) => this._handleInteraction(event),
    });
    this._keyboard = createKeyboardRuntime({ root: this.shadowRoot, ui: this._ui, onControlKey: handleControlKeydown });
    this._resize = createResizeRuntime({
      platform: this._platform,
      onMeasure: () => resolveSectionLayouts(this._renderContext, this.shadowRoot, this._renderController.lastViewModel, ALL_RENDERERS),
    });
    this._surface = createSurfaceWatch({
      platform: this._platform,
      onChange: () => this._renderSafely(),
      getStyleContainers: () => this._shadowMount.containers(),
      getForeignNodes: () => this._shadowMount.foreignNodes(),
    });
    this._renderController = createRenderController({
      computeViewModel: () => this._computeViewModel(),
      computeStructureSignature: (viewModel) => cardStructureSignature(viewModel, ALL_RENDERERS),
      renderAll: (viewModel) => this._renderAll(viewModel),
      updateEmpty: (viewModel) => this._updateContent(viewModel),
      updateContent: (viewModel) => this._updateContent(viewModel),
    });
  }

  // The card needs no options at all: one Vacuum Orchestrator installation is discovered
  // through Home Assistant itself.
  static getStubConfig() {
    return {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "subtitle", selector: { text: {} } },
        { name: "language", selector: { select: { mode: "dropdown", options: ["auto", "en", "de"] } } },
        { name: "start_section", selector: { select: { mode: "dropdown", options: SECTION_TYPES } } },
        { name: "page_size", selector: { number: { min: 5, max: 100, step: 1, mode: "box" } } },
        { name: "time_format", selector: { select: { mode: "dropdown", options: ["auto", "relative", "absolute"] } } },
        { name: "density", selector: { select: { mode: "dropdown", options: ["auto", "comfortable", "compact"] } } },
        { name: "confirm_destructive", selector: { boolean: {} } },
      ],
      // A missing translation returns its own key, which would put "config.page_size" in the
      // editor; the option name is the better answer.
      computeLabel: (entry) => {
        const key = `config.${entry.name}`;
        const label = translate(DEFAULT_LANGUAGE, key, undefined);
        return label === key ? entry.name : label;
      },
      assertConfig: (config) => {
        normalizeConfig(config, { isSupportedLanguage, sectionTypes: SECTION_TYPES, optionSchemaForSection });
      },
    };
  }

  get config() {
    return this._lovelaceConfig;
  }

  // Strong exception safety: normalization writes nothing, and the commit phase cannot throw
  // because a failing render shows its own message. Home Assistant calls this on every
  // keystroke in the YAML editor, so a refusal must leave the card untouched.
  setConfig(config) {
    const normalized = this._normalizeConfig(config);
    this._config = normalized;
    this._lovelaceConfig = config;
    this._backend?.setPageSize(normalized.page_size);
    this._renderController.invalidateDataSignature();
    this._renderSafely();
  }

  // Home Assistant sets this on every state change, so it may never throw into the frontend:
  // a failure here ends in the card's own failure shell like any other.
  set hass(value) {
    this._hass = value;
    try {
      this._syncBackend();
    } catch (error) {
      this._diagnostics.reportRenderFailure(error);
    }
    this._renderSafely();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._interaction.connect();
    this._keyboard.connect();
    this._resize.connect(this);
    this._surface.observe(this);
    this._renderSafely();
  }

  disconnectedCallback() {
    this._interaction.disconnect();
    this._keyboard.disconnect();
    this._resize.disconnect();
    this._surface.disconnect();
  }

  // An upper bound for the masonry layout: header, stats, tab strip and the rows the active
  // section will draw.
  getCardSize() {
    const model = this._model;
    const rows = model ? model.queue.pending.length + model.active.jobs.length : 0;
    return Math.min(14, 4 + Math.max(0, rows));
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12 };
  }

  _normalizeConfig(config) {
    try {
      return normalizeConfig(config, { isSupportedLanguage, sectionTypes: SECTION_TYPES, optionSchemaForSection });
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      // Home Assistant shows this before any hass exists, so the language comes from the card
      // option or the page.
      const language = resolveMessageLanguage(config?.language, this.ownerDocument?.documentElement?.getAttribute("lang"));
      const text = renderMessage(messageForConfigError(error), (key, vars) => translate(language, key, vars));
      const localized = new ConfigError(error.code, error.params);
      localized.message = text;
      throw localized;
    }
  }

  // The backend is created once and then reads `hass` lazily: Home Assistant replaces that
  // object on every state update, and binding it would freeze the card on the first one.
  _syncBackend() {
    if (!this._hass) return;
    if (!this._backend) {
      this._backend = createOrchestratorBackend({
        getHass: () => this._hass,
        platform: this._platform,
        clock: this._platform,
        onChange: () => this._renderSafely(),
        pageSize: this._config?.page_size,
      });
      void this._backend.connect();
      return;
    }
    this._backend.syncHass();
  }

  _computeModel() {
    this._model = buildCardDomainModel({
      backendState: this._backend?.getState() ?? {},
      areaRegistry: this._hass?.areas ?? null,
      states: this._hass?.states ?? null,
      user: this._hass?.user ?? null,
      nowMs: this._platform.now(),
    });
    return this._model;
  }

  _sectionOptions(key) {
    const requested = (this._config.sections || []).find((entry) => entry.type === key)?.options || {};
    const schema = optionSchemaForSection(key) || {};
    const resolved = {};
    for (const [name, descriptor] of Object.entries(schema)) {
      resolved[name] = requested[name] === undefined ? descriptor.default : requested[name];
    }
    return {
      ...resolved,
      pageSize: this._config.page_size,
      timeFormat: this._config.time_format,
      nowMs: this._platform.now(),
    };
  }

  // An image entity the backend named, resolved against this Home Assistant instance.
  _imageUrl(entityId) {
    const picture = this._hass?.states?.[entityId]?.attributes?.entity_picture;
    if (typeof picture !== "string" || !picture) return null;
    return typeof this._hass.hassUrl === "function" ? this._hass.hassUrl(picture) : picture;
  }

  _overlayContent(model, texts) {
    const overlay = this._ui.overlay;
    if (!overlay) return null;
    const renderer = OVERLAY_RENDERERS.find((entry) => entry.key === overlay.kind);
    if (!renderer) return null;
    const job = overlay.jobId ? findJob(model, overlay.jobId) : null;
    const options = { ...overlay, job, confirmDestructive: this._config.confirm_destructive };
    return { key: renderer.key, content: renderer.build(model, texts, options, this._ui) };
  }

  _computeViewModel() {
    const model = this._computeModel();
    const language = resolveLanguage(this._config?.language || "auto", this._hass);
    const texts = textService(language);
    this._renderContext = createRenderContext(this.ownerDocument, {
      texts,
      ui: this._ui,
      capabilities: model.capabilities,
      canCommand: model.permissions.canCommand,
      resolveImage: (entityId) => this._imageUrl(entityId),
    });
    const overlay = this._overlayContent(model, texts);
    const viewModel = buildCardViewModel({
      model,
      config: this._config,
      texts,
      ui: this._ui,
      sectionDefinitions: SECTION_DEFINITIONS,
      overlay,
    });
    if (viewModel.body.kind === "section") {
      const renderer = SECTION_RENDERERS.find((entry) => entry.key === viewModel.body.section);
      viewModel.body = {
        ...viewModel.body,
        content: renderer ? renderer.build(model, texts, this._sectionOptions(viewModel.body.section), this._ui) : null,
      };
    }
    return viewModel;
  }

  _renderAll(viewModel) {
    const heldFocus = captureFocus(this.shadowRoot);
    this._shadowMount.mount(this._renderContext, {
      css: buildStyles({ sectionCss: SECTION_CSS }),
      bodyHtml: renderCardBody(this._renderContext, viewModel, ALL_RENDERERS),
    });
    this._interaction.connect();
    this._keyboard.connect();
    this._surface.observe(this);
    const requested = this._ui.consumeFocus();
    if (requested) focusSelector(this.shadowRoot, requested);
    else restoreFocus(this.shadowRoot, heldFocus);
    this._diagnostics.reportWarnings(viewModel.notices.warnings);
    this._diagnostics.reportRenderSuccess();
  }

  _updateContent(viewModel) {
    patchCardBody(this._renderContext, this.shadowRoot, viewModel, ALL_RENDERERS);
    this._diagnostics.reportWarnings(viewModel.notices.warnings);
  }

  _renderSafely() {
    if (!this._config) return;
    try {
      const model = this._computeModel();
      const language = resolveLanguage(this._config.language, this._hass);
      this._renderController.render({
        dataSignature: dataSignature({
          model,
          config: this._config,
          language,
          surface: this._platform.prefersReducedMotion() ? "reduced" : "normal",
          ui: this._ui,
          nowMs: this._platform.now(),
        }),
        structuralConfigSignature: structuralConfigSignature(this._config),
      });
    } catch (error) {
      this._renderController.markFailed();
      this._diagnostics.reportRenderFailure(error);
      const language = resolveMessageLanguage(this._config?.language, this.ownerDocument?.documentElement?.getAttribute("lang"));
      const text = translate(language, "error.renderFailed");
      try {
        this._shadowMount.mount(this._renderContext, { css: buildStyles({ sectionCss: [] }), bodyHtml: renderFailureBody(text) });
      } catch (_ignored) {
        this._shadowMount.showText(text);
      }
    }
  }

  // Every control the sections render carries its command as data attributes; this is the one
  // place that turns them into backend calls. See internal dev doc §5 "Aktionsvertrag".
  _handleInteraction({ type, key, target }) {
    if (type === "input") {
      filterEntityOptions(target.closest("[data-control]"), target.value);
      return;
    }
    if (type === "change") {
      this._updateDraft(target);
      return;
    }
    if (type === "section") {
      // The tab strip is rebuilt by the render this triggers, so the focus has to be asked
      // for rather than kept.
      this._ui.requestFocus(`[role="tab"][data-section="${key}"]`);
      this._ui.setSection(key);
      return;
    }
    const action = target?.dataset?.action;
    const jobId = target?.dataset?.jobId || null;
    const direction = target?.dataset?.direction || null;
    const needsConfirm = target?.dataset?.confirm === "true" && this._config.confirm_destructive !== false;
    if (needsConfirm) {
      this._ui.openOverlay({ kind: "confirm", action, jobId, ...confirmKeysFor(action), jobName: this._jobName(jobId) });
      return;
    }
    this._dispatch(action, { jobId, direction, target });
  }

  _jobName(jobId) {
    const job = this._model ? findJob(this._model, jobId) : null;
    return job?.name || job?.areas?.join(", ") || jobId || "";
  }

  _dispatch(action, { jobId, direction, target } = {}) {
    const backend = this._backend;
    switch (action) {
      case "open-detail":
        return this._ui.openOverlay({ kind: "detail", jobId });
      case "create-job":
        return this._ui.openOverlay({ kind: "editor", mode: "create", draft: createDraft(null) });
      case "edit-job":
        return this._ui.openOverlay({ kind: "editor", mode: "edit", jobId, draft: createDraft(this._model ? findJob(this._model, jobId) : null) });
      case "back":
      case "cancel":
        return this._ui.closeOverlay();
      case "dismiss":
        return this._ui.closeOverlay({ resume: true });
      case "update-draft":
        return this._updateDraft(target);
      case "save-job":
        return this._saveDraft();
      case "move-up":
      case "move-down":
      case "move-top":
      case "move-bottom":
        return this._run(backend?.moveJob(jobId, direction));
      case "delete-job":
        return this._run(backend?.deleteJob(jobId));
      case "start-job":
        return this._run(backend?.startJob(jobId));
      case "cancel-job":
        return this._run(backend?.cancelJob(jobId));
      case "retry-job":
        return this._run(backend?.retryJob(jobId));
      case "run-queue":
        return this._run(backend?.runQueue());
      case "pause-queue":
        return this._run(backend?.pauseQueue());
      case "resume-queue":
        return this._run(backend?.resumeQueue());
      case "load-more":
      case "load-previous":
        return this._loadPage(target);
      case "toggle-release":
        return this._toggleRelease(target?.dataset?.entityId);
      default:
        return undefined;
    }
  }

  // Turns one control interaction into the next draft through the domain reducer, so the draft
  // keeps its baseline and validation stays the domain's.
  _updateDraft(target) {
    const draft = this._ui.draft;
    const path = target?.dataset?.fieldPath;
    if (!draft || !path) return undefined;
    const control = target.closest("[data-control]");
    const next = nextDraftValue(control?.dataset?.control, control, target, draft[path]);
    if (next === undefined) return undefined;
    return this._ui.setDraft(applyDraftChange(draft, path, next));
  }

  _run(promise) {
    if (!promise) return undefined;
    return promise.then((result) => {
      if (result?.ok) this._ui.closeOverlay();
      this._renderSafely();
      return result;
    });
  }

  _saveDraft() {
    const overlay = this._ui.overlay;
    const draft = this._ui.draft;
    if (!overlay || !draft || !this._backend) return undefined;
    const content = this._renderController.lastViewModel?.body?.content;
    if (!content?.payload) return undefined;
    const promise = overlay.mode === "edit" ? this._backend.updateJob(overlay.jobId, content.payload) : this._backend.createJob(content.payload);
    return this._run(promise);
  }

  // The release switch belongs to an entity the backend declared; toggling it is an ordinary
  // Home Assistant action, not cleaning logic.
  _toggleRelease(entityId) {
    if (!entityId || typeof this._hass?.callService !== "function") return undefined;
    return this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
  }

  _loadPage(target) {
    const nav = target?.closest?.(".voc-pagination");
    const offset = Number(nav?.dataset?.offset ?? 0);
    const limit = Number(nav?.dataset?.limit ?? this._config.page_size);
    const next = target.dataset.pageDirection === "previous" ? Math.max(0, offset - limit) : offset + limit;
    // The pressed control names its own section; the UI route is still empty while a single
    // section is on screen without a tab strip.
    const scope = target?.closest?.("[data-section]")?.dataset?.section === "history" ? "history" : "queue";
    return this._backend?.loadPage(scope, next).then(() => this._renderSafely());
  }
}

function confirmKeysFor(action) {
  if (action === "cancel-job") {
    return { titleKey: "confirm.cancelJob.title", textKey: "confirm.cancelJob.text", confirmKey: "confirm.cancelJob.confirm" };
  }
  return { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm" };
}

function toggled(list, value) {
  const current = Array.isArray(list) ? list : [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

// The value a control interaction asks for, in the draft's own vocabulary. `undefined` means
// the interaction changes nothing. An empty choice or text is "not set", which is null.
function nextDraftValue(kind, control, target, current) {
  const value = target.dataset.vocValue;
  if (kind === "entity-combobox") {
    if (target.dataset.comboboxRemove !== undefined) return (current || []).filter((item) => item !== target.dataset.comboboxRemove);
    return value === undefined ? undefined : toggled(current, value);
  }
  if (kind === "chip-select") {
    if (value === undefined) return undefined;
    if (control.dataset.multiple === "true") return toggled(current, value);
    return value === "" ? null : value;
  }
  if (kind === "segmented") return value === undefined ? undefined : value === "" ? null : value;
  if (kind === "stepper") {
    const input = control.querySelector("input");
    const min = Number(input?.min ?? 1);
    const max = Number(input?.max ?? 10);
    const base = Number.isInteger(current) ? current : min;
    if (target.dataset.stepperAction === "increment") return Math.min(max, base + 1);
    if (target.dataset.stepperAction === "decrement") return Math.max(min, base - 1);
    // A number field reports an unreadable entry as an empty string; that is a half-typed
    // value, not a request for zero, so the draft keeps what it had.
    if (target.value === "") return undefined;
    const typed = Number(target.value);
    return Number.isInteger(typed) ? clamp(typed, min, max) : undefined;
  }
  if (kind === "text-field") return target.value.trim() === "" ? null : target.value;
  return undefined;
}
