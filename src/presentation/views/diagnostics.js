// The diagnostics view: versions, the runtime the card talks to, the setup status and the
// integration's volatile trace. The full anonymized export stays Home Assistant's diagnostics
// download. See internal dev doc §8 "Diagnose".

import { list, slotData } from "../common/lookups.js";
import { dateTime, number, t } from "../common/texts.js";
import { traceRows } from "../common/trace.js";
import { INTEGRATION_PAGE_PATH } from "../common/links.js";

export const TRACE_ROWS = 40;
// The newest entries; the rest on request.
export const TRACE_PREVIEW = 10;
const TRACE_MORE_KEY = "diagnostics:trace";

const SUBSCRIPTION_TONE = Object.freeze({ live: "ready", connecting: "neutral", reconnecting: "attention", failed: "attention", idle: "muted" });

// A problem the view itself names; it also turns the automatic tab on.
export function diagnosticsNeeded(model) {
  return (model.diagnostics?.warnings?.length ?? 0) > 0 || model.subscription === "failed";
}

// When the assistant was finished, or that it is still open.
function setupFact(texts, setup) {
  if (!setup) return null;
  if (setup.completedAt !== null) return t(texts, "diagnostics.setupCompleted", { when: dateTime(texts, setup.completedAt) });
  return t(texts, "diagnostics.setupPending");
}

function count(texts, value) {
  return Number.isInteger(value) ? number(texts, value) : null;
}

function traceOf(model, texts, options, ui) {
  if (options.show_trace === false) return { trace: null, traceMore: null };
  const rows = traceRows(slotData(model, "trace")?.records, { model, texts, limit: TRACE_ROWS, withJob: true });
  if (rows.length <= TRACE_PREVIEW) return { trace: rows, traceMore: null };
  const open = list(ui?.expanded).includes(TRACE_MORE_KEY);
  const count = rows.length - TRACE_PREVIEW;
  return {
    trace: open ? rows : rows.slice(0, TRACE_PREVIEW),
    traceMore: { key: TRACE_MORE_KEY, open, count, label: t(texts, open ? "diagnostics.traceLess" : "diagnostics.traceMore", { count }) },
  };
}

export function buildDiagnosticsView({ model, texts, options = {}, ui = {} }) {
  const summary = slotData(model, "diagnostics");
  const status = model.slots?.diagnostics?.status;
  const traceWindow = summary?.traceWindow;
  const subscription = model.subscription || "idle";
  return {
    key: "diagnostics",
    loading: !summary && (status === "loading" || status === "idle"),
    error: !summary ? model.slots?.diagnostics?.error ?? null : null,
    connection: { label: t(texts, `diagnostics.subscription.${subscription}`), tone: SUBSCRIPTION_TONE[subscription] || "muted" },
    facts: [
      { label: t(texts, "diagnostics.integrationVersion"), value: model.integrationVersion || summary?.version || null },
      { label: t(texts, "diagnostics.apiVersion"), value: count(texts, model.apiVersion ?? summary?.apiVersion) },
      { label: t(texts, "diagnostics.storeVersion"), value: count(texts, summary?.storeVersion) },
      { label: t(texts, "diagnostics.runtime"), value: summary?.runtimeId || model.runtime?.id || null },
      { label: t(texts, "diagnostics.commit"), value: count(texts, summary?.commitId ?? model.runtime?.commitId) },
      { label: t(texts, "diagnostics.sequence"), value: count(texts, summary?.runtimeSequence ?? model.runtime?.sequence) },
      { label: t(texts, "diagnostics.totals"), value: summary ? t(texts, "diagnostics.totalsValue", { jobs: count(texts, summary.totals.jobs) ?? "—", rooms: count(texts, summary.totals.rooms) ?? "—" }) : null },
      {
        label: t(texts, "diagnostics.traceWindow"),
        value: traceWindow && Number.isFinite(traceWindow.retained) ? t(texts, "diagnostics.traceWindowValue", { retained: number(texts, traceWindow.retained), recorded: number(texts, traceWindow.recorded ?? 0), dropped: number(texts, traceWindow.dropped ?? 0) }) : null,
      },
      { label: t(texts, "diagnostics.setup"), value: setupFact(texts, model.setup) },
    ],
    sinkFailures: Number.isInteger(summary?.sinkFailures) && summary.sinkFailures > 0 ? t(texts, "diagnostics.sinkFailures", { count: summary.sinkFailures }) : null,
    ...traceOf(model, texts, options, ui),
    traceLoading: options.show_trace !== false && !slotData(model, "trace") && model.slots?.trace?.status !== "error",
    download: model.permissions?.isAdmin ? { path: INTEGRATION_PAGE_PATH } : null,
  };
}
