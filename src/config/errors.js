const MESSAGES = Object.freeze({
  "config.not_object": () => "the card configuration must be a YAML object.",
  "config.unknown_key": ({ key, suggestion }) => `${key} is not an option of this card.${suggestion ? ` Did you mean ${suggestion}?` : ""}`,
});

export const CONFIG_ERROR_CODES = Object.freeze(Object.keys(MESSAGES));

export class ConfigError extends Error {
  constructor(code, params = {}) {
    const message = MESSAGES[code] ? MESSAGES[code](params) : "invalid card configuration.";
    super(`Invalid configuration: ${message}`);
    this.name = "ConfigError";
    this.code = code;
    this.params = params;
  }
}

export function rejectConfiguration(code, params = {}) {
  throw new ConfigError(code, params);
}
