import { normalizeForSpeech } from "./normalizer.js";
import { DEFAULT_VOICE, migrateVoiceSetting } from "./tts-settings.js";

const DEFAULT_SETTINGS = {
  voice: DEFAULT_VOICE,
  rate: "+0%"
};
const MAX_SELECTION_CHARS = 100_000;
const OFFSCREEN_PATH = "offscreen.html";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: "read-selection",
    title: "Read selected text",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "stop-reading",
    title: "Stop reading",
    contexts: ["all"]
  });

  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({
    voice: migrateVoiceSetting(stored.voice),
    rate: stored.rate || DEFAULT_SETTINGS.rate
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "stop-reading") {
    void stopEverywhere(tab?.id);
    return;
  }
  if (info.menuItemId === "read-selection") {
    void prepareAndSpeak(info.selectionText ?? "", { tabId: tab?.id, restart: true });
  }
});

const readerPorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "select-to-read") return;
  readerPorts.add(port);
  port.onDisconnect.addListener(() => {
    readerPorts.delete(port);
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen") return undefined;

  if (message?.type === "PLAYBACK_STATUS") {
    for (const port of readerPorts) {
      try {
        port.postMessage(message);
      } catch {
        readerPorts.delete(port);
      }
    }
    return undefined;
  }

  if (message?.type === "READ_SELECTION") {
    prepareAndSpeak(message.text, { tabId: sender.tab?.id, restart: Boolean(message.restart) })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "STOP") {
    stopEverywhere(sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return undefined;
});

async function prepareAndSpeak(rawText, flags = {}) {
  if (typeof rawText !== "string") throw new Error("The selected text is invalid.");
  if (rawText.length > MAX_SELECTION_CHARS) {
    throw new Error("Select at most 100,000 characters at a time.");
  }

  const text = normalizeForSpeech(rawText);
  if (!text) throw new Error("There is no readable text in this selection.");

  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const payload = {
    type: "SPEAK",
    text,
    restart: Boolean(flags.restart),
    settings: {
      voice: migrateVoiceSetting(stored.voice),
      rate: stored.rate || DEFAULT_SETTINGS.rate
    }
  };

  await sendToPlayer(payload);
  return { characterCount: text.length };
}

async function stopEverywhere() {
  await sendToPlayer({ type: "STOP" });
}

async function sendToPlayer(message) {
  await ensureOffscreenDocument();
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await chrome.runtime.sendMessage({ target: "offscreen", ...message });
      if (response?.ok) return response;
      lastError = new Error("Audio player did not accept the request.");
    } catch (error) {
      lastError = error;
      await delay(40 * (attempt + 1));
    }
  }
  throw new Error(lastError?.message || "Audio player is not ready. Reload the extension.");
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error("This extension needs a current Chromium-based Edge or Chrome version.");
  }
  if (await chrome.offscreen.hasDocument()) return;

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play Google TTS audio for the selected text."
    });
  } catch (error) {
    if (String(error?.message ?? error).includes("single offscreen document")) return;
    throw error;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
