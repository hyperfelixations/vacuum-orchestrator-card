// The header lines on a narrow card (UI-34): a clipped subtitle shows as much of its text as fits
// and ends with an ellipsis, so no part disappears whole; a wrapping one breaks between its parts.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard } = require("../../helpers/browser-helpers.js");

// The station's dirty water tank is full; on a compact card the subtitle naming robot and fault
// ("Rocky · Schmutzwassertank voll") is wider than its column.
const STATION = { recording: "attention", from: "The station needs attention" };
const COMPACT = 320;

const subtitleOf = (card) => card.evaluate((element) => {
  const line = element.shadowRoot.querySelector(".voc-subtitle");
  const phrases = [...line.querySelectorAll(".voc-phrase")];
  return { overflows: line.scrollWidth > line.clientWidth, lines: Math.round(line.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(line).lineHeight)), displays: phrases.map((phrase) => getComputedStyle(phrase).display), count: phrases.length };
});

test("a clipped subtitle cuts characters, not whole parts", async ({ page }) => {
  const card = await mountCard(page, { ...STATION, width: COMPACT, language: "de", config: { language: "de" } });
  const clipped = await subtitleOf(card);
  expect(clipped.count).toBeGreaterThan(1);
  expect(clipped.overflows).toBe(true);
  expect(clipped.lines).toBe(1);
  // An inline phrase lets the ellipsis cut inside it; an atomic one would be dropped as a whole.
  expect(clipped.displays.every((display) => display === "inline")).toBe(true);
});

test("a wrapping subtitle breaks between its parts and shows all of them", async ({ page }) => {
  const card = await mountCard(page, { ...STATION, width: COMPACT, language: "de", config: { language: "de", subtitle: "wrap" } });
  const wrapped = await subtitleOf(card);
  expect(wrapped.overflows).toBe(false);
  expect(wrapped.lines).toBeGreaterThan(1);
  expect(wrapped.displays.every((display) => display === "inline-block")).toBe(true);
});
