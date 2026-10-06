// The templates view: each stored template with its intent, whether it is enabled and creates
// jobs automatically, and the rooms whose current due period already produced a job.
// See internal dev doc §8 "Vorlagen".

import { CREATE_TARGET, decide, templateAffordances } from "../../domain/affordances.js";
import { list, roomIndex, roomName, slotData } from "../common/lookups.js";
import { modeLabel, t } from "../common/texts.js";
import { MODE_ICONS, settingChips } from "./job-row.js";

export function buildTemplatesView({ model, texts, context }) {
  const status = model.slots?.templates?.status;
  const data = slotData(model, "templates");
  const index = roomIndex(model);
  const rooms = (ids) => list(ids).map((roomId) => roomName(roomId, index, model)).join(", ");
  return {
    key: "templates",
    loading: !data && (status === "loading" || status === "idle"),
    error: !data ? model.slots?.templates?.error ?? null : null,
    create: decide(context, { operation: "save_template", target: CREATE_TARGET }),
    templates: list(data?.items).map((template) => {
      const intent = template.intent;
      return {
        key: template.templateId,
        templateId: template.templateId,
        name: template.name,
        tone: !template.enabled ? "muted" : template.automatic ? "running" : "neutral",
        modeIcon: MODE_ICONS[intent.mode] || "mdi:robot-vacuum",
        modeLabel: modeLabel(texts, intent.mode),
        rooms: intent.allRooms ? t(texts, "field.allRooms") : rooms(intent.areas),
        badges: [
          template.enabled ? null : { key: "disabled", text: t(texts, "templates.disabled"), tone: "muted" },
          template.enabled && template.automatic ? { key: "automatic", text: t(texts, "templates.automatic"), tone: "running" } : null,
        ].filter(Boolean),
        settings: settingChips(intent, texts, { defaults: slotData(model, "queue")?.jobDefaults }),
        suppressed: template.automatic && template.suppressedRoomIds.length ? t(texts, "templates.suppressed", { rooms: rooms(template.suppressedRoomIds) }) : null,
        actions: templateAffordances(template, context),
      };
    }),
  };
}
