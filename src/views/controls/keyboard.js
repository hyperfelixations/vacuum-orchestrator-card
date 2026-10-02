// Keyboard behaviour of the card's own controls, by event delegation. Choice groups are roving
// tab stops: arrow keys move between options, and in a single-choice group also select. From an
// entity search field, ArrowDown enters the match list.

const OPTION = "[role='radio'], [role='option']";

function enabled(nodes) {
  return nodes.filter((node) => !node.disabled && node.getAttribute("aria-disabled") !== "true");
}

function move(event, options, index, select) {
  if (!options.length) return false;
  event.preventDefault();
  const target = options[(index + options.length) % options.length];
  target.focus?.();
  if (select) target.click?.();
  return true;
}

export function handleControlKeydown(event) {
  const target = event?.target;
  if (!target?.closest) return false;
  const group = target.closest("[data-control='choice']");
  if (group && target.matches(OPTION)) {
    const options = enabled([...group.querySelectorAll(OPTION)]);
    const index = options.indexOf(target);
    const select = target.getAttribute("role") === "radio";
    if (event.key === "ArrowRight" || event.key === "ArrowDown") return move(event, options, index + 1, select);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") return move(event, options, index - 1, select);
    if (event.key === "Home") return move(event, options, 0, select);
    if (event.key === "End") return move(event, options, options.length - 1, select);
    return false;
  }
  const picker = target.closest("[data-control='entities']");
  if (picker) {
    const matches = [...picker.querySelectorAll(".voc-entity-match")];
    if (target.matches("input") && event.key === "ArrowDown") return move(event, matches, 0, false);
    if (target.matches(".voc-entity-match")) {
      const index = matches.indexOf(target);
      if (event.key === "ArrowDown") return move(event, matches, index + 1, false);
      if (event.key === "ArrowUp") {
        if (index === 0) {
          event.preventDefault();
          picker.querySelector("input")?.focus();
          return true;
        }
        return move(event, matches, index - 1, false);
      }
    }
  }
  return false;
}
