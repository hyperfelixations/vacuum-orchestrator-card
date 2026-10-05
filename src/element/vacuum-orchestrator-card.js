// The custom element: Home Assistant's lifecycle and the render pipeline. It owns config, hass,
// the shadow DOM, this card's UI state and its hold on the shared session; the controllers own
// everything else. Import direction is enforced by test/architecture/source-architecture.test.js.

import { CARD_NAME } from "../core/card-metadata.js";
import { normalizeConfig } from "../config/normalize-config.js";
import { ConfigError } from "../config/errors.js";
import { isSupportedLanguage, resolveLanguage, resolveMessageLanguage, translate } from "../i18n/translate.js";
import { textService } from "../i18n/text-service.js";
import { DEFAULT_LANGUAGE } from "../i18n/locales.js";
import { affordanceContext } from "../domain/affordances.js";
import { acquireSession } from "../backend/session-registry.js";
import { buildCardDomainModel } from "../application/card-domain-model.js";
import { readHomeAssistant } from "../backend/home-assistant.js";
import { buildCardViewModel } from "../presentation/shell/card-view-model.js";
import { buildTabs } from "../presentation/shell/tabs.js";
import { messageForConfigError, renderMessage } from "../presentation/shell/notices.js";
import { createRenderContext } from "../render/primitives/render-context.js";
import { captureFocus, focusRingShown, focusSelector, restoreFocus } from "../render/primitives/focus.js";
import { renderCard, renderFailure } from "../render/composition/card-shell.js";
import { createShadowMount } from "../render/composition/shadow-mount.js";
import { buildStyles } from "../styles/index.js";
import { createBrowserPlatform } from "../controllers/runtime/browser-platform.js";
import { createDiagnosticsReporter } from "../controllers/runtime/diagnostics-reporter.js";
import { createInteractionRuntime } from "../controllers/runtime/interaction-runtime.js";
import { createKeyboardRuntime } from "../controllers/runtime/keyboard-runtime.js";
import { createTabStripRuntime } from "../controllers/runtime/tab-strip-runtime.js";
import { createUIState } from "../controllers/runtime/ui-state.js";
import { createActionRouter } from "../controllers/runtime/action-router.js";
import { createRenderController } from "../controllers/render/render-controller.js";
import { VIEWS, VIEW_CSS, VIEW_TYPES, handleControlKeydown, optionSchemaForView, overlayFor, renderBody, viewFor } from "../views/index.js";

const CARD_SIZE_ROW_PX = 50;
const CARD_SIZE_MAX_ROWS = 14;
const COLLABORATORS = Object.freeze({ isSupportedLanguage, viewTypes: VIEW_TYPES, optionSchemaForView });
const STYLES = buildStyles({ viewCss: VIEW_CSS });
let ownerSequence = 0;

function resolvedOptions(definition, requested = {}) {
  const resolved = {};
  for (const [name, descriptor] of Object.entries(definition?.optionsSchema || {})) resolved[name] = requested[name] === undefined ? descriptor.default : requested[name];
  return resolved;
}

export class VacuumOrchestratorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._owner = `card-${++ownerSequence}`;
    this._config = null;
    this._configVersion = 0;
    this._lovelaceConfig = null;
    this._hass = null;
    this._hold = null;
    this._unsubscribe = null;
    this._model = null;
    this._platform = createBrowserPlatform(() => this.ownerDocument);
    this._mount = createShadowMount(this.shadowRoot);
    this._ui = createUIState();
    this._ui.subscribe(() => this._scheduleRender());
    this._diagnostics = createDiagnosticsReporter({ platform: this._platform, describe: (entry) => renderMessage(entry, (key, vars) => translate(DEFAULT_LANGUAGE, key, vars)) });
    this._router = createActionRouter({
      ui: this._ui,
      getSession: () => this._hold?.session ?? null,
      getModel: () => this._model,
      getConfig: () => this._config,
      platform: this._platform,
    });
    this._interaction = createInteractionRuntime({ root: this.shadowRoot, onAction: (event) => this._onInteraction(event) });
    this._keyboard = createKeyboardRuntime({
      root: this.shadowRoot,
      onView: (view) => this._ui.setView(view),
      // Escape is the page's Back control, including its question about unsaved changes.
      onEscape: () => {
        if (!this._ui.overlay) return false;
        this._router.handle("back");
        return true;
      },
      onControlKey: handleControlKeydown,
    });
    this._tabStrip = createTabStripRuntime({ root: this.shadowRoot, platform: this._platform });
    this._renderer = createRenderController({ computeViewModel: () => this._computeViewModel(), renderView: (viewModel) => this._renderView(viewModel) });
  }

  static getStubConfig() {
    return {};
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "subtitle", selector: { text: {} } },
        { name: "start_view", selector: { select: { mode: "dropdown", options: VIEW_TYPES } } },
        { name: "language", selector: { select: { mode: "dropdown", options: ["auto", "en", "de"] } } },
      ],
      computeLabel: (entry) => {
        const key = `config.${entry.name}`;
        const label = translate(DEFAULT_LANGUAGE, key);
        return label === key ? entry.name : label;
      },
      assertConfig: (config) => normalizeConfig(config, COLLABORATORS),
    };
  }

  // The configuration as written, read by frontend modules such as card-mod.
  get config() {
    return this._lovelaceConfig;
  }

  // Normalization runs first and writes nothing; Home Assistant's YAML editor calls this on
  // every keystroke, so a refusal must leave the card untouched.
  setConfig(config) {
    const normalized = this._normalizeConfig(config);
    this._config = normalized;
    this._lovelaceConfig = config;
    this._configVersion += 1;
    this._renderer.invalidate();
    this._renderSafely();
  }

  set hass(value) {
    this._hass = value;
    try {
      this._syncSession();
    } catch (error) {
      this._diagnostics.reportRenderFailure(error);
    }
    this._scheduleRender();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._interaction.connect();
    this._keyboard.connect();
    this._tabStrip.connect();
    this._syncSession();
    this._renderSafely();
  }

  disconnectedCallback() {
    this._interaction.disconnect();
    this._keyboard.disconnect();
    this._tabStrip.disconnect();
    this._releaseSession();
  }

  // Masonry rows of 50 px: the rendered height once there is one, else header, panel and tab
  // row plus one row per listed job.
  getCardSize() {
    const height = this.shadowRoot?.querySelector("ha-card")?.getBoundingClientRect?.().height ?? 0;
    if (height > 0) return Math.max(1, Math.ceil(height / CARD_SIZE_ROW_PX));
    const queue = this._model?.slots?.queue?.data;
    const rows = (queue?.jobs?.length ?? 0) + (this._model?.slots?.openJobs?.data?.jobs?.length ?? 0);
    return Math.min(CARD_SIZE_MAX_ROWS, 4 + rows);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, max_columns: 12 };
  }

  _normalizeConfig(config) {
    try {
      return normalizeConfig(config, COLLABORATORS);
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      const language = resolveMessageLanguage(config?.language, this.ownerDocument?.documentElement?.getAttribute("lang"));
      const localized = new ConfigError(error.code, error.params);
      localized.message = renderMessage(messageForConfigError(error), (key, vars) => translate(language, key, vars));
      throw localized;
    }
  }

  // The session belongs to the Home Assistant connection, shared with every other card on it.
  _syncSession() {
    if (!this._hass || !this.isConnected) return;
    if (this._hold && this._holdConnection !== this._hass.connection) this._releaseSession();
    if (!this._hold) {
      this._hold = acquireSession({ hass: this._hass, platform: this._platform });
      this._holdConnection = this._hass.connection;
      // A new session has not heard this card's demand yet.
      this._lastRequests = null;
      this._unsubscribe = this._hold.session.subscribe(() => this._scheduleRender());
    }
    this._hold.updateHass(this._hass);
  }

  _releaseSession() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._hold?.release(this._owner);
    this._hold = null;
    this._holdConnection = null;
    this._lastRequests = null;
  }

  // The scopes this card reads, by slot. The base set serves the shell; the active view and the
  // top overlay add their own.
  _requests(tabs) {
    const ui = this._ui.snapshot;
    const pageSize = this._config.page_size;
    const requests = {
      queue: { name: "queue", params: { offset: ui.pages.queue ?? 0, limit: pageSize } },
      openJobs: { name: "openJobs", params: {} },
      rooms: { name: "rooms", params: {} },
      robots: { name: "robots", params: {} },
      candidates: { name: "candidates", params: {} },
      registry: { name: "registry", params: {} },
      errorTexts: { name: "errorTexts", params: { language: this._language() } },
    };
    const add = (list) => {
      for (const request of list || []) requests[request.slot || request.name] = { name: request.name, params: request.params || {} };
    };
    const definition = viewFor(tabs?.active);
    if (definition?.scopes) add(definition.scopes({ ui, options: resolvedOptions(definition, tabs.activeTab?.options), config: this._config }));
    const overlay = this._ui.overlay;
    const overlayDefinition = overlay ? overlayFor(overlay.kind) : null;
    if (overlayDefinition?.scopes) add(overlayDefinition.scopes({ ui, overlay, config: this._config }));
    return requests;
  }

  _language() {
    return resolveLanguage(this._config?.language || "auto", this._hass);
  }

  // The integration's own error texts arrive as a scope in the card language.
  _texts(model) {
    return textService(this._language(), { backend: model?.errorTexts ?? null });
  }

  // Model, tabs and scope demand settle together: the active view decides the demand, and the
  // demand decides what the model holds.
  _computeModel() {
    const snapshot = this._hold?.session.getSnapshot() ?? null;
    const overlay = this._ui.overlay;
    const needsEntityCatalog = Boolean(overlay && overlayFor(overlay.kind)?.needsEntityCatalog);
    let model = buildCardDomainModel({ snapshot, requests: this._lastRequests || {}, home: readHomeAssistant(this._hass), nowMs: this._platform.now(), needsEntityCatalog });
    let texts = this._texts(model);
    const tabs = buildTabs({ definitions: VIEWS, model, config: this._config, ui: this._ui.snapshot, texts });
    this._model = model;
    const requests = this._requests(tabs);
    if (this._hold && JSON.stringify(requests) !== JSON.stringify(this._lastRequests)) {
      this._lastRequests = requests;
      this._hold?.session.setDemand(this._owner, Object.values(requests));
      model = buildCardDomainModel({ snapshot: this._hold?.session.getSnapshot() ?? null, requests, home: readHomeAssistant(this._hass), nowMs: this._platform.now(), needsEntityCatalog });
      texts = this._texts(model);
    }
    this._model = model;
    return { model, tabs: buildTabs({ definitions: VIEWS, model, config: this._config, ui: this._ui.snapshot, texts }), texts };
  }

  _signature({ model, texts }) {
    return JSON.stringify({
      session: this._hold?.session.getSnapshot().version ?? null,
      config: this._configVersion,
      language: texts.language,
      minute: Math.floor(model.nowMs / 60000),
      ui: this._ui.snapshot,
      hass: [model.robotsLive, model.entityReadings, model.areas, model.operations, model.permissions, model.entityCatalog.length],
    });
  }

  _computeViewModel() {
    const { model, tabs, texts } = this._pending;
    const context = affordanceContext({ canCommand: model.permissions.canCommand, operations: model.operations, pending: model.pending });
    const config = this._config;
    let viewContent = null;
    const definition = viewFor(tabs.active);
    if (definition && tabs.activeTab?.available && model.phase === "ready") {
      viewContent = definition.build({ model, texts, context, options: resolvedOptions(definition, tabs.activeTab.options), config, ui: this._ui.snapshot });
    }
    let overlay = null;
    const top = this._ui.overlay;
    const overlayDefinition = top ? overlayFor(top.kind) : null;
    if (overlayDefinition && model.phase === "ready") {
      overlay = { key: overlayDefinition.key, content: overlayDefinition.build({ model, texts, context, overlay: top, config, ui: this._ui.snapshot }) };
    }
    const viewModel = buildCardViewModel({ model, config, texts, ui: this._ui.snapshot, tabs, definitions: VIEWS, context, viewContent, overlay });
    return { viewModel, texts };
  }

  _renderView({ viewModel, texts }) {
    const context = createRenderContext(this.ownerDocument, { texts, resolveUrl: (path) => (typeof this._hass?.hassUrl === "function" ? this._hass.hassUrl(path) : path) });
    const held = captureFocus(this.shadowRoot);
    const ring = { visible: focusRingShown(this.shadowRoot) };
    const depth = this._ui.snapshot.overlays.length;
    const previousDepth = this._overlayDepth ?? 0;
    // Opening a page moves focus into it and remembers the control that opened it; closing it
    // gives focus back to that control.
    if (depth > previousDepth) this._focusReturns = [...(this._focusReturns || []), held];
    this._mount.mount(context, { css: STYLES, html: renderCard(context, viewModel, renderBody) });
    const requested = this._ui.consumeFocus();
    if (requested) focusSelector(this.shadowRoot, requested, ring);
    else if (depth > previousDepth && held) focusSelector(this.shadowRoot, "[data-autofocus], #voc-overlay-title", ring);
    else if (depth < previousDepth && held) {
      const returns = this._focusReturns || [];
      const target = returns.slice(depth).find(Boolean) || null;
      this._focusReturns = returns.slice(0, depth);
      if (!target || !focusSelector(this.shadowRoot, target, ring)) restoreFocus(this.shadowRoot, ".voc-root", ring);
    } else restoreFocus(this.shadowRoot, held, ring);
    this._overlayDepth = depth;
    this._tabStrip.sync();
    this._diagnostics.reportWarnings(viewModel.notices.warnings);
    this._diagnostics.reportRenderSuccess();
  }

  // Session, UI and hass changes arrive in bursts; one render per microtask answers them all.
  _scheduleRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    Promise.resolve().then(() => {
      this._renderScheduled = false;
      this._renderSafely();
    });
  }

  // A render can cause another (a new scope demand notifies synchronously); the nested request
  // is replayed after the outer render instead of interleaving with it.
  _renderSafely() {
    if (!this._config) return;
    if (this._rendering) {
      this._renderAgain = true;
      return;
    }
    this._rendering = true;
    try {
      do {
        this._renderAgain = false;
        this._renderOnce();
      } while (this._renderAgain);
    } finally {
      this._rendering = false;
    }
  }

  _renderOnce() {
    try {
      const pending = this._computeModel();
      this._pending = pending;
      this._renderer.render({ signature: this._signature(pending) });
    } catch (error) {
      this._renderer.markFailed();
      this._diagnostics.reportRenderFailure(error);
      const language = resolveMessageLanguage(this._config?.language, this.ownerDocument?.documentElement?.getAttribute("lang"));
      const text = translate(language, "error.renderFailed");
      try {
        this._mount.mount(createRenderContext(this.ownerDocument), { css: STYLES, html: renderFailure(text) });
      } catch (_ignored) {
        this._mount.showText(`${CARD_NAME}: ${text}`);
      }
    }
  }

  _onInteraction(event) {
    if (event.type === "view") {
      this._ui.requestFocus(`[role="tab"][data-view="${event.view}"]`);
      this._ui.setView(event.view);
      return;
    }
    if (event.type === "input" || event.type === "change") {
      const target = event.target;
      const value = target.type === "checkbox" ? target.checked : target.type === "number" ? (target.value === "" ? null : Number(target.value)) : target.value;
      this._router.input(event.field, value);
      return;
    }
    void this._router.handle(event.action, event.args);
  }
}
