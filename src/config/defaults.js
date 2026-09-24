export const DEFAULT_CONFIG = Object.freeze({
  title: Object.freeze({ text: null, overflow: "wrap" }),
  subtitle: Object.freeze({ text: null, overflow: "clip" }),
  icon: null,
  accent_line: "top",
  language: "auto",
  page_size: 25,
  time_format: "auto",
  density: "auto",
  confirm_destructive: true,
  tap_action: Object.freeze({ action: "none" }),
  hold_action: Object.freeze({ action: "none" }),
});
