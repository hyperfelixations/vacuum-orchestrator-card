// Everything a renderer may reach: the document it draws into, the text port and the one
// lookup that needs Home Assistant (an image URL). Renderers never see hass itself.

export function createRenderContext(ownerDocument, { texts = null, resolveUrl = null } = {}) {
  if (!ownerDocument) throw new TypeError("render context requires an ownerDocument");
  const t = (key, vars) => (texts && typeof texts.t === "function" ? texts.t(key, vars) : key);
  return Object.freeze({
    ownerDocument,
    texts,
    t,
    // The sentence for an affordance decision's reason, or "": the integration words its own
    // reasons, the card its client-local ones.
    reason: (decision) => {
      if (decision?.state !== "disabled" || !decision.reason) return "";
      if (decision.source !== "integration") return t(`affordance.${decision.reason}`);
      return texts?.backend?.(decision.reason, { detail: decision.detail }) || t("affordance.unavailable");
    },
    resolveUrl: typeof resolveUrl === "function" ? resolveUrl : () => null,
    fragment: (html) => fragmentIn(ownerDocument, html),
  });
}

export function fragmentIn(ownerDocument, html) {
  const template = ownerDocument.createElement("template");
  template.innerHTML = String(html ?? "");
  return template.content;
}
