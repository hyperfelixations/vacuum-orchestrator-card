export function verifyTranslationKeyParity(translations, referenceLanguage) {
  const reference = new Set(Object.keys(translations[referenceLanguage] || {}));
  const mismatches = [];
  for (const [language, values] of Object.entries(translations)) {
    if (language === referenceLanguage) continue;
    const keys = new Set(Object.keys(values));
    const missing = [...reference].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !reference.has(key));
    if (missing.length || extra.length) mismatches.push({ language, missing, extra });
  }
  if (mismatches.length) {
    for (const mismatch of mismatches) {
      console.warn(`Vacuum Orchestrator Card: translation key mismatch for ${mismatch.language}`,
        mismatch);
    }
  }
  return mismatches;
}
