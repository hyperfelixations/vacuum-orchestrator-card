// Everything a renderer may reach: the document it draws into, the text port, the UI route
// and the two narrow lookups that need Home Assistant. Renderers never see hass itself.
export function createRenderContext(ownerDocument, extras = {}) {
  if (!ownerDocument) throw new TypeError("render context requires an ownerDocument");
  return {
    ownerDocument,
    defaultView: ownerDocument.defaultView,
    createElement: (tagName) => ownerDocument.createElement(tagName),
    htmlToElement: (html) => htmlToElementIn(ownerDocument, html),
    htmlToNodes: (html) => htmlToNodesIn(ownerDocument, html),
    texts: extras.texts || null,
    ui: extras.ui || null,
    capabilities: extras.capabilities || {},
    canCommand: extras.canCommand === true,
    // Resolves an image entity the backend named to a URL the browser may load.
    resolveImage: extras.resolveImage || (() => null),
  };
}

export function htmlToElementIn(ownerDocument, html) {
  const wrapper = ownerDocument.createElement("div");
  wrapper.innerHTML = String(html ?? "").trim();
  return wrapper.firstElementChild;
}

export function htmlToNodesIn(ownerDocument, html) {
  const wrapper = ownerDocument.createElement("div");
  wrapper.innerHTML = String(html ?? "");
  return Array.from(wrapper.childNodes);
}
