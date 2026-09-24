const ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}

export function truncateText(value, max) {
  const text = String(value ?? "");
  const limit = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : text.length;
  if (Array.from(text).length <= limit) return text;
  if (limit <= 1) return limit === 1 ? "…" : "";
  return `${Array.from(text).slice(0, limit - 1).join("")}…`;
}

export function joinList(items, separator = ", ") {
  return Array.from(items || [], (item) => String(item ?? "")).filter(Boolean).join(separator);
}
