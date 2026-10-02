// Card defaults for the optional top-level options. The `show:` defaults live in show.js, view
// option defaults in each view's schema.

export const DEFAULT_CONFIG = Object.freeze({
  title: Object.freeze({ text: null, overflow: "wrap" }),
  subtitle: Object.freeze({ text: null, overflow: "clip" }),
  icon: null,
  accent_line: "top",
  language: "auto",
  page_size: 25,
  time_format: "auto",
  confirm_destructive: true,
});

export const PAGE_SIZE_RANGE = Object.freeze({ min: 5, max: 100 });
