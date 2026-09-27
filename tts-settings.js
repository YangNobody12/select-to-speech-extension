export const DEFAULT_VOICE = "auto";

export function migrateVoiceSetting(value) {
  return value === "th" || value === "en" ? value : DEFAULT_VOICE;
}
