const defaults = { voice: "auto", rate: "+0%" };
const voice = document.querySelector("#voice");
const rate = document.querySelector("#rate");
const stop = document.querySelector("#stop");
const status = document.querySelector("#status");

void load();
voice.addEventListener("change", save);
rate.addEventListener("change", save);
stop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP" }, () => {
    status.textContent = "หยุดการอ่านแล้ว";
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "PLAYBACK_STATUS") return;
  if (message.status === "loading") status.textContent = "กำลังโหลดเสียง…";
  if (message.status === "playing") status.textContent = "กำลังอ่าน";
  if (message.status === "idle") status.textContent = "อ่านจบแล้ว";
  if (message.status === "error") status.textContent = `อ่านไม่สำเร็จ: ${message.error}`;
});

async function load() {
  const settings = await chrome.storage.sync.get(defaults);
  const mapped = settings.voice === "th" || settings.voice === "en" ? settings.voice : "auto";
  voice.value = mapped;
  rate.value = settings.rate || defaults.rate;
  if (mapped !== settings.voice) await chrome.storage.sync.set({ voice: mapped });
  status.textContent = "พร้อมแล้ว — เลือกข้อความบนหน้าเว็บเพื่อฟังเสียง";
}

async function save() {
  await chrome.storage.sync.set({ voice: voice.value, rate: rate.value });
  status.textContent = "บันทึกแล้ว";
}
