/**
 * Free spoken replies via Web Speech API (speechSynthesis).
 * Voice quality depends on the device; prefers a female-ish voice when available.
 */

const LS_AUTO = "sc_tts_auto";

let preferredVoice = null;
let voicesReady = false;
let currentUtterance = null;
let onSpeakEnd = null;

function loadVoices() {
  if (!("speechSynthesis" in window)) return [];
  const voices = speechSynthesis.getVoices() || [];
  if (!voices.length) return [];
  voicesReady = true;

  const scored = voices.map((v) => {
    let score = 0;
    const n = `${v.name} ${v.lang}`.toLowerCase();
    if (/en(-|_)?(us|gb|au|in)?/.test(n) || v.lang?.toLowerCase().startsWith("en")) score += 3;
    if (/female|woman|girl|samantha|victoria|karen|moira|tessa|fiona|zira|susan|hazel|google uk english female|salli|joanna|ivy|kimberly|kendra|emma|amy/.test(n))
      score += 5;
    if (/male|david|daniel|arthur|thomas|fred|alex|google uk english male/.test(n)) score -= 4;
    if (v.default) score += 1;
    return { v, score };
  });
  scored.sort((a, b) => b.score - a.score);
  preferredVoice = scored[0]?.v || voices[0];
  return voices;
}

export function isTtsSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getAutoSpeak() {
  try {
    const v = localStorage.getItem(LS_AUTO);
    if (v === null) return true;
    return v !== "0";
  } catch (_) {
    return true;
  }
}

export function setAutoSpeak(on) {
  try {
    localStorage.setItem(LS_AUTO, on ? "1" : "0");
  } catch (_) {}
}

export function stopSpeaking() {
  if (!isTtsSupported()) return;
  try {
    speechSynthesis.cancel();
  } catch (_) {}
  currentUtterance = null;
  if (onSpeakEnd) {
    const cb = onSpeakEnd;
    onSpeakEnd = null;
    cb();
  }
}

/**
 * Speak text. Returns a promise that resolves when speech ends (or immediately if unsupported).
 * @param {string} text
 * @param {{ onStart?: () => void, onEnd?: () => void }} [hooks]
 */
export function speak(text, hooks = {}) {
  if (!isTtsSupported() || !text?.trim()) {
    hooks.onEnd?.();
    return Promise.resolve();
  }

  stopSpeaking();
  if (!voicesReady) loadVoices();

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text.trim());
    u.rate = 1.02;
    u.pitch = 1.08;
    u.volume = 1;
    if (preferredVoice) u.voice = preferredVoice;
    if (preferredVoice?.lang) u.lang = preferredVoice.lang;
    else u.lang = "en-US";

    const finish = () => {
      if (currentUtterance === u) currentUtterance = null;
      onSpeakEnd = null;
      hooks.onEnd?.();
      resolve();
    };

    u.onstart = () => hooks.onStart?.();
    u.onend = finish;
    u.onerror = finish;

    currentUtterance = u;
    onSpeakEnd = finish;
    try {
      speechSynthesis.speak(u);
    } catch (_) {
      finish();
    }
  });
}

export function isSpeaking() {
  return isTtsSupported() && speechSynthesis.speaking;
}

/** Warm up voice list (Chrome loads async). */
export function initVoice() {
  if (!isTtsSupported()) return;
  loadVoices();
  if (typeof speechSynthesis.onvoiceschanged !== "undefined") {
    speechSynthesis.onvoiceschanged = () => loadVoices();
  }
  // Some Android Chrome builds need a tick
  setTimeout(loadVoices, 250);
}
