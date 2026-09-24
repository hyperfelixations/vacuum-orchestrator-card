// Correlation ids for in-flight commands. A monotonic counter per factory is enough: ids only
// have to be unique within one card instance, and a deterministic id keeps tests readable.

export function createIdFactory(prefix = "voc") {
  let sequence = 0;
  return {
    nextCommandId() {
      sequence += 1;
      return `${prefix}-${sequence}`;
    },
  };
}
