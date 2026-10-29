// The robot map (UI-10), enlarged on its page and in a robot's card: turned a quarter when that shows it more than 15 % larger in its
// box, laid out with width and height swapped rather than only transformed, and decided again only
// when the box changes by more than 10 %. Measured after each render and once a picture loads; see
// internal dev doc §9 "Kartenbild".

export const ROTATE_GAIN = 1.15;
export const RESIZE_HYSTERESIS = 0.1;
// The share of the viewport the enlarged map may take up; in the card's fixed frame at most the
// region that scrolls, so the whole map stays in view.
export const MAP_VIEWPORT_SHARE = 0.7;

export function shouldRotate({ boxWidth, boxHeight, imageWidth, imageHeight }) {
  if (![boxWidth, boxHeight, imageWidth, imageHeight].every((value) => value > 0)) return false;
  const upright = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const turned = Math.min(boxWidth / imageHeight, boxHeight / imageWidth);
  return turned > ROTATE_GAIN * upright;
}

export function mapLayout({ boxWidth, boxHeight, imageWidth, imageHeight, rotate }) {
  const scale = rotate ? Math.min(boxWidth / imageHeight, boxHeight / imageWidth) : Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { rotate, width, height, stageHeight: rotate ? width : height };
}

export function changedEnough(previous, next) {
  if (!previous) return true;
  const ratio = (before, after) => Math.abs(after - before) / Math.max(before, 1);
  return ratio(previous.boxWidth, next.boxWidth) > RESIZE_HYSTERESIS || ratio(previous.boxHeight, next.boxHeight) > RESIZE_HYSTERESIS;
}

// The last decision per picture, so a render that rebuilds the stage keeps it.
const decisions = new Map();

function place(stage, image, viewportHeight) {
  const region = stage.closest?.("[data-frame]") ? stage.closest("[data-scroll]") : null;
  const share = Math.round(viewportHeight * MAP_VIEWPORT_SHARE);
  // A stage in a robot's card has its own fixed height.
  const fixed = Number(stage.dataset.maxHeight);
  // In a page's region the map has what is left below what stands above it (the page's lead).
  const above = region ? stage.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop : 0;
  const box = { boxWidth: stage.clientWidth, boxHeight: fixed > 0 ? fixed : region?.clientHeight > 0 ? Math.min(share, region.clientHeight - above) : share };
  const size = { imageWidth: image.naturalWidth, imageHeight: image.naturalHeight };
  if (!(box.boxWidth > 0 && box.boxHeight > 0 && size.imageWidth > 0 && size.imageHeight > 0)) return;
  const key = image.getAttribute("src");
  const previous = decisions.get(key);
  const allowed = stage.dataset.rotation !== "none";
  const rotate = allowed && (changedEnough(previous, box) ? shouldRotate({ ...box, ...size }) : previous.rotate);
  decisions.set(key, changedEnough(previous, box) ? { ...box, rotate } : { ...previous, rotate });
  const layout = mapLayout({ ...box, ...size, rotate });
  const px = (value) => `${Math.round(value)}px`;
  // Only what changed is written: a write lays the page out again (UI-31).
  const set = (node, property, value) => {
    if (node.style[property] !== value) node.style[property] = value;
  };
  if (stage.dataset.rotated !== String(rotate)) stage.dataset.rotated = String(rotate);
  set(stage, "height", px(layout.stageHeight));
  set(image, "width", px(layout.width));
  set(image, "height", px(layout.height));
  set(image, "left", px((box.boxWidth - layout.width) / 2));
  set(image, "top", px(rotate ? (layout.width - layout.height) / 2 : 0));
  set(image, "transform", rotate ? "rotate(90deg)" : "");
}

export function placeMaps(root, { viewportHeight }) {
  for (const stage of root?.querySelectorAll?.("[data-map-stage]") ?? []) {
    const image = stage.querySelector("img");
    if (!image) continue;
    if (image.complete && image.naturalWidth) place(stage, image, viewportHeight);
    else if (!image.dataset.waiting) {
      image.dataset.waiting = "true";
      image.addEventListener("load", () => place(stage, image, viewportHeight), { once: true });
    }
  }
}
