const MESSAGES = Object.freeze({
  "config.not_object": () => "the card configuration must be a YAML object.",
  "config.unknown_key": ({ key, suggestion }) => `${key} is not an option of this card.${suggestion ? ` Did you mean ${suggestion}?` : ""}`,
  "config.must_be_list": ({ key }) => `${key} must be a list.`,
  "config.must_be_object": ({ key }) => `${key} must be an object.`,
  "config.duplicate_section": ({ key }) => `${key} names a section more than once.`,
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

export class ConfigValueError extends Error {
  constructor(path, value) {
    super(`${path}: invalid value`);
    this.name = "ConfigValueError";
    this.path = path;
    this.value = value;
  }
}

export function rejectConfiguration(code, params = {}) {
  throw new ConfigError(code, params);
}

export function rejectValue(path, value) {
  throw new ConfigValueError(path, value);
}
