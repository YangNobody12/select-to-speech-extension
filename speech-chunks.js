// Google Translate TTS rejects requests longer than about 200 characters.
const MAX_CHUNK_CHARS = 180;

function splitSpeechChunks(text, lang = "th") {
  const value = String(text || "").trim();
  if (!value) return [];

  const pieces = [];
  for (const sentence of value.split(/(?<=[.!?。？！,;:])\s+/)) {
    if (sentence.length <= MAX_CHUNK_CHARS) {
      pieces.push(sentence);
      continue;
    }
    for (const phrase of sentence.split(/\s+/)) {
      if (phrase.length <= MAX_CHUNK_CHARS) pieces.push(phrase);
      else pieces.push(...splitByWords(phrase, lang));
    }
  }

  const chunks = [];
  let buffer = "";
  for (const piece of pieces) {
    if (!piece.trim()) continue;
    const joined = buffer ? `${buffer} ${piece}` : piece;
    if (joined.length <= MAX_CHUNK_CHARS) {
      buffer = joined;
    } else {
      if (buffer) chunks.push(buffer);
      buffer = piece;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.map((chunk) => chunk.trim()).filter((chunk) => /[\p{L}\p{N}]/u.test(chunk));
}

function splitByWords(sentence, lang) {
  const words = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(lang, { granularity: "word" }).segment(sentence)].map((part) => part.segment)
    : sentence.split(/(\s+)/);
  const parts = [];
  let buffer = "";
  for (const word of words) {
    if (buffer.length + word.length > MAX_CHUNK_CHARS && buffer.trim()) {
      parts.push(buffer.trim());
      buffer = "";
    }
    buffer += word;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

function speechLanguage(text, preferred) {
  if (preferred === "th" || preferred === "en") return preferred;
  const thai = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return thai > 0 && thai * 3 >= latin ? "th" : latin > 0 ? "en" : "th";
}
