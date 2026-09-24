const shellMarkup = (css, bodyHtml) => `\n<style>${css}</style>\n<ha-card class="voc-card">${bodyHtml}</ha-card>\n`;
const bodyMarkup = (bodyHtml) => `\n${bodyHtml}\n`;

export function createShadowMount(root) {
  let style = null;
  let surface = null;
  let outer = [];
  let body = [];

  const mounted = () => Boolean(style && surface && style.parentNode === root && surface.parentNode === root);
  const containers = () => mounted() ? [root, surface] : [root];

  function insert(container, nodes, before) {
    const fragment = container.ownerDocument.createDocumentFragment();
    nodes.forEach((node) => fragment.appendChild(node));
    container.insertBefore(fragment, before || null);
  }

  function removeOwned(container, nodes) {
    nodes.forEach((node) => {
      if (node.parentNode === container) container.removeChild(node);
    });
  }

  function anchor(container, oldNodes) {
    return oldNodes.find((node) => node.parentNode === container) || container.firstChild;
  }

  return {
    mount(context, { css, bodyHtml }) {
      if (!mounted()) {
        const nodes = context.htmlToNodes(shellMarkup(css, bodyHtml));
        insert(root, nodes, anchor(root, outer));
        removeOwned(root, outer);
        outer = nodes;
        style = nodes.find((node) => node.localName === "style");
        surface = nodes.find((node) => node.localName === "ha-card");
        body = surface ? Array.from(surface.childNodes) : [];
        return;
      }
      if (style.textContent !== css) style.textContent = css;
      const nodes = context.htmlToNodes(bodyMarkup(bodyHtml));
      insert(surface, nodes, anchor(surface, body));
      removeOwned(surface, body);
      body = nodes;
    },
    showText(text) {
      const node = root.ownerDocument.createTextNode(String(text ?? ""));
      insert(root, [node], anchor(root, outer));
      removeOwned(root, outer);
      outer = [node];
      style = null;
      surface = null;
      body = [];
    },
    containers,
    foreignNodes() {
      const owned = new Set([...outer, ...body]);
      return containers().flatMap((container) => Array.from(container.childNodes).filter((node) => !owned.has(node)));
    },
  };
}
