// Reduced motion: no transition or animation anywhere in the card.

export const MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
  .voc-root *, .voc-root *::before, .voc-root *::after { transition: none !important; animation: none !important; }
}
`;
