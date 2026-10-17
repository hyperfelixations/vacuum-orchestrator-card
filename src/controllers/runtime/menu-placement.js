// Where an open menu opens: below its button, or above it when below there is less room in the
// region it scrolls in than the menu needs and above there is more. Measured after each render;
// see internal dev doc §9 "Menüs".

export function placeMenus(root) {
  for (const menu of root?.querySelectorAll?.(".voc-menu") ?? []) {
    menu.removeAttribute("data-placement");
    const anchor = menu.parentElement?.getBoundingClientRect?.();
    const region = (menu.closest("[data-scroll]") ?? root.host)?.getBoundingClientRect?.();
    const own = menu.getBoundingClientRect?.();
    if (!anchor || !region || !own?.height) continue;
    const below = region.bottom - anchor.bottom;
    const above = anchor.top - region.top;
    if (below < own.height && above > below) menu.setAttribute("data-placement", "above");
  }
}
