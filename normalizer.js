/**
 * Turns browser-selection text into predictable plain speech text. This runs
 * before any text is handed to the TTS transport, never after it.
 */
export function normalizeForSpeech(value) {
  if (typeof value !== "string") return "";

  return value
    .normalize("NFC")
    // Invisible selection artifacts and unsupported control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g, "")
    // Non-breaking and narrow spaces are common in copied web content.
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    // Make copied typography easier for voices to pronounce consistently.
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—]/g, ", ")
    .replace(/…/g, ". ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n+ */g, ", ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
