// A table's own entry for a key from outside the card, such as an integration value, an error
// path or an action named in the page: "constructor" or "__proto__" name no entry, not the
// prototype's member.

export function own(table, key) {
  if (!table || (typeof key !== "string" && typeof key !== "number")) return undefined;
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
