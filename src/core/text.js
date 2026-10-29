const ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

// Joins the phrases of one line of card text, in code and in the translations (I18N-02).
export const PHRASE_SEPARATOR = " · ";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPE_MAP[character]);
}
