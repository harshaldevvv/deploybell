// Runs inside the offscreen document. Plays a sound on request from the
// service worker. Each request creates a fresh Audio element so overlapping
// notifications don't cut each other off.

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== "offscreen" || msg.type !== "cfpn-play") return;
  try {
    const audio = new Audio(msg.url);
    audio.volume = Math.max(0, Math.min(1, Number(msg.volume) || 0.8));
    audio.play().catch((err) => console.warn("[CFPN] audio.play failed", err));
  } catch (e) {
    console.warn("[CFPN] offscreen play error", e);
  }
});
