const GOOGLE_TTS_URL = "https://translate.google.com/translate_tts";

const audio = new Audio();
let requestVersion = 0;
let pending = [];
let pumping = false;
let stopCurrentClip = null;
let settings = { voice: "auto", rate: "+0%" };

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return undefined;

  if (message.type === "STOP") {
    stopPlayback();
    sendResponse({ ok: true });
    return undefined;
  }
  if (message.type === "SPEAK") {
    speak(message.text, message.settings);
    sendResponse({ ok: true });
    return undefined;
  }
  return undefined;
});

function speak(text, nextSettings) {
  stopPlayback();
  if (nextSettings) settings = { voice: nextSettings.voice || "auto", rate: nextSettings.rate || "+0%" };
  const version = requestVersion;
  const lang = speechLanguage(text, settings.voice);
  pending = splitSpeechChunks(text, lang).map((chunk) => ({ text: chunk, lang, task: null }));
  if (!pending.length) return;
  notify({ type: "PLAYBACK_STATUS", status: "loading" });
  void pump(version);
}

function prefetch(version) {
  for (const item of pending.slice(0, 3)) {
    if (!item.task) {
      item.task = fetchChunk(item, version).then(
        (blob) => ({ ok: true, blob }),
        (error) => ({ ok: false, error })
      );
    }
  }
}

async function pump(version) {
  if (pumping) return;
  pumping = true;
  try {
    while (pending.length && version === requestVersion) {
      prefetch(version);
      const result = await pending[0].task;
      if (version !== requestVersion) return;
      if (!result.ok) throw result.error;
      pending.shift();
      prefetch(version);
      await playBlob(result.blob, version);
    }
    if (version === requestVersion) notify({ type: "PLAYBACK_STATUS", status: "idle" });
  } catch (error) {
    if (version !== requestVersion) return;
    pending = [];
    notify({ type: "PLAYBACK_STATUS", status: "error", error: error?.message || "อ่านไม่สำเร็จ" });
  } finally {
    pumping = false;
  }
}

async function fetchChunk(item, version) {
  const url = `${GOOGLE_TTS_URL}?ie=UTF-8&client=tw-ob&tl=${item.lang}&q=${encodeURIComponent(item.text)}`;
  let response;
  try {
    response = await fetch(url, { cache: "force-cache", credentials: "omit" });
  } catch {
    throw new Error("เชื่อมต่อ Google TTS ไม่ได้ — ตรวจอินเทอร์เน็ต");
  }
  if (version !== requestVersion) throw new Error("Reading was cancelled.");
  if (!response.ok) throw new Error(`Google TTS ตอบ HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.size < 100) throw new Error("Google TTS ส่งเสียงว่างกลับมา");
  return blob;
}

function playBlob(blob, version) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (stopCurrentClip === finish) stopCurrentClip = null;
      URL.revokeObjectURL(url);
      if (error && version === requestVersion) reject(error);
      else resolve();
    };
    const onEnded = () => finish();
    const onError = () => finish(new Error("เล่นเสียงไม่สำเร็จ"));
    stopCurrentClip = () => finish();
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.src = url;
    audio.playbackRate = playbackRate(settings.rate);
    audio.play().then(() => {
      if (version === requestVersion) notify({ type: "PLAYBACK_STATUS", status: "playing" });
    }).catch((error) => finish(error?.name === "AbortError" ? null : error));
  });
}

function playbackRate(rate) {
  const match = /^([+-])(\d+)%$/.exec(rate || "+0%");
  if (!match) return 1;
  const amount = Number(match[2]) / 100;
  return Math.min(2, Math.max(0.5, match[1] === "-" ? 1 - amount : 1 + amount));
}

function stopPlayback() {
  requestVersion += 1;
  pending = [];
  stopCurrentClip?.();
  stopCurrentClip = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function notify(message) {
  try {
    void chrome.runtime.sendMessage(message).catch(() => {});
  } catch {
    // The extension was reloaded.
  }
}
