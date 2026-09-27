(() => {
  if (window !== window.top) return;
  if (!document.documentElement) return;
  try {
    if (!chrome.runtime?.id) return;
  } catch {
    return;
  }

  const control = document.createElement("button");
  control.className = "select-to-read-control";
  control.type = "button";
  control.textContent = "■ Stop";
  control.setAttribute("aria-label", "Stop reading");
  control.hidden = true;
  document.documentElement.append(control);

  let selectionTimer;
  let lastSent = "";
  let ignoreSelectionUntil = 0;
  let disconnected = false;
  let port = null;

  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("keyup", onKeyUp, true);
  document.addEventListener("keydown", onKeyDown, true);

  control.addEventListener("pointerdown", (event) => event.preventDefault());
  control.addEventListener("click", () => {
    if (control.textContent === "ลองใหม่") {
      lastSent = "";
      readCurrentSelection(true);
      return;
    }
    stopReading();
  });

  function onPointerUp(event) {
    if (!extensionAlive()) return disconnectStaleScript();
    if (control.contains(event.target) || Date.now() < ignoreSelectionUntil) return;
    queueSelection();
  }

  function onKeyUp(event) {
    if (!extensionAlive()) return disconnectStaleScript();
    if (event.key === "Shift" || event.key.startsWith("Arrow") || event.shiftKey) queueSelection();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") stopReading();
  }

  function onExtensionMessage(message) {
    if (message?.type !== "PLAYBACK_STATUS") return;
    if (message.status === "error") {
      lastSent = "";
      control.textContent = "ลองใหม่";
      control.title = message.error || "อ่านไม่สำเร็จ";
      return;
    }
    if (message.status === "idle" && !currentSelectionText()) hideControl();
  }

  function queueSelection() {
    if (Date.now() < ignoreSelectionUntil) return;
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(() => {
      try {
        readCurrentSelection(false);
      } catch {
        disconnectStaleScript();
      }
    }, 120);
  }

  function readCurrentSelection(restart) {
    const text = currentSelectionText();
    if (!text) {
      if (!restart) hideControl();
      return;
    }
    if (!restart && text === lastSent) return;

    showControl(window.getSelection().getRangeAt(0).getBoundingClientRect());
    lastSent = text;
    sendToExtension({ type: "READ_SELECTION", text, restart }, (result) => {
      if (result?.ok) return;
      lastSent = "";
      control.textContent = "ลองใหม่";
      control.title = result?.error || "อ่านไม่สำเร็จ";
    });
  }

  function currentSelectionText() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "password") return "";
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!text || !selection?.rangeCount) return "";
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return "";
    return text;
  }

  function showControl(rect) {
    control.hidden = false;
    control.disabled = false;
    control.textContent = "■ Stop";
    control.title = "หยุดอ่าน";
    control.style.left = `${Math.min(window.innerWidth - 88, Math.max(8, rect.right + 8))}px`;
    control.style.top = `${Math.min(window.innerHeight - 40, Math.max(8, rect.bottom + 8))}px`;
  }

  function stopReading() {
    ignoreSelectionUntil = Date.now() + 500;
    lastSent = "";
    sendToExtension({ type: "STOP" });
    hideControl();
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function runtimeError() {
    try {
      return chrome.runtime.lastError || null;
    } catch (error) {
      disconnectStaleScript();
      return error;
    }
  }

  function connectPort() {
    if (port || disconnected || !extensionAlive()) return;
    try {
      port = chrome.runtime.connect({ name: "select-to-read" });
      port.onMessage.addListener(onExtensionMessage);
      port.onDisconnect.addListener(() => {
        port = null;
        const error = runtimeError();
        if (!extensionAlive() || isInvalidated(error)) disconnectStaleScript();
      });
    } catch {
      port = null;
      disconnectStaleScript();
    }
  }

  function sendToExtension(message, callback) {
    if (!extensionAlive()) return disconnectStaleScript();
    connectPort();
    try {
      chrome.runtime.sendMessage(message, (result) => {
        const error = runtimeError();
        if (!extensionAlive()) return disconnectStaleScript();
        try {
          callback?.(error ? { ok: false, error: error.message } : result);
        } catch {
          disconnectStaleScript();
        }
      });
    } catch {
      disconnectStaleScript();
    }
  }

  function disconnectStaleScript() {
    if (disconnected) return;
    disconnected = true;
    window.clearTimeout(selectionTimer);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("keyup", onKeyUp, true);
    document.removeEventListener("keydown", onKeyDown, true);
    try {
      port?.disconnect();
    } catch {
      // The extension context is already gone.
    }
    port = null;
    control.remove();
  }

  function isInvalidated(error) {
    return /invalidated/i.test(String(error?.message || error));
  }

  function hideControl() {
    window.clearTimeout(selectionTimer);
    control.hidden = true;
    control.disabled = false;
  }

  connectPort();
})();
