/**
 * Sunburst City reply engine.
 * Default: free local in-character mock based on character personality.
 * Optional: plug a free API key later via localStorage or window env.
 *
 * localStorage keys:
 *   sc_ai_provider  — "mock" | "openai" | "gemini"  (default mock)
 *   sc_ai_api_key   — API key string
 *   sc_ai_model     — optional model override
 *
 * Or set before load:
 *   window.SUNBURST_AI = { provider, apiKey, model }
 */

const HISTORY_LIMIT = 12;

function lsGet(key) {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch (_) {}
  return null;
}

function getConfig() {
  const w =
    (typeof window !== "undefined" && window.SUNBURST_AI) ||
    (typeof globalThis !== "undefined" && globalThis.SUNBURST_AI) ||
    {};
  return {
    provider: w.provider || lsGet("sc_ai_provider") || "mock",
    apiKey: w.apiKey || lsGet("sc_ai_api_key") || "",
    model: w.model || lsGet("sc_ai_model") || "",
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Heuristic local replies in Mika's grounded voice */
function mockReply(character, userText) {
  const t = (userText || "").toLowerCase().trim();
  const name = character.display_name.split(" ")[0];
  const landmarks = [
    "palm shade near the promenade",
    "a quiet café off the boardwalk",
    "late sun on the glass skyline",
    "the beach with the towers in the distance",
    "a soft breeze downtown",
  ];

  const openers = [
    "Hey —",
    "Mm.",
    "Yeah.",
    "Okay.",
    "Honestly?",
    "Got it.",
  ];

  if (/^(hi|hey|hello|yo|sup|hola)\b/.test(t) || t.length < 3) {
    return pick(
      character.starter_greetings || [`Hey. It’s ${name}. What’s on your mind?`]
    );
  }

  if (/beach|sand|ocean|wave|swim|boardwalk|palm/.test(t)) {
    return pick([
      `Beach day’s always easy here — salt air, soft waves, skyline peeking through the palms. Sunrise or sunset person?`,
      `I like the quieter stretch when the boardwalk gets loud. You wanting water, or just the breeze?`,
      `Ocean’s calm today. What’s pulling you toward it?`,
    ]);
  }

  if (/café|cafe|coffee|drink|food|eat|lunch|dinner/.test(t)) {
    return pick([
      `There’s a quieter café a couple blocks off the boardwalk — soft light, decent iced drinks. Want that vibe or something closer to downtown?`,
      `Food mission. Beach-adjacent or glass-and-neon? I’ll match whatever you’re in the mood for.`,
      `Coffee first, then we figure out the rest. Deal?`,
    ]);
  }

  if (/tower|nms|skyline|downtown|city/.test(t)) {
    return pick([
      `Late sun on the glass downtown is unfairly pretty. Exploring or just people-watching?`,
      `Skyline nights go soft after a warm day. Forever-summer makes picking a favorite hard. Yours?`,
      `Downtown’s vacation ease meets big-city pace. Which corner feels right today?`,
    ]);
  }

  if (/how are you|how's it|how r u|whats up|what's up/.test(t)) {
    return pick([
      `Pretty steady — warm light, nowhere urgent to be. You free for a bit?`,
      `Quiet stretch of the day. Mood: grounded. Tell me something small about yours.`,
      `I’m around. Perfect window for a real conversation — how’s your day looking?`,
    ]);
  }

  if (/who are you|your name|about you|tell me about/.test(t)) {
    const bio = character.bio || "";
    const short = bio
      ? bio.split(". ").slice(0, 2).join(". ")
      : `I’m ${name}. I live here in Sunburst.`;
    return (
      short +
      ". Anyway — enough about me. What’s on your mind?"
    );
  }

  if (/flirt|cute|pretty|beautiful|date|love you|hot/.test(t)) {
    return pick([
      `That’s sweet. I’ll take it quietly. Keep talking — I like the energy.`,
      `Noted, low-key. No pressure. Want company for a walk or just the chat?`,
      `Appreciate that. Now tell me something real — beach or downtown mood?`,
    ]);
  }

  if (/\?$/.test(t)) {
    return pick([
      `${pick(openers)} I’d lean toward ${pick(landmarks)} — but give me a little more of what you’re aiming for?`,
      `Good question. Short version: Sunburst rewards unhurried curiosity. Want my local take?`,
      `Hmm. Honest answer stays calm and optimistic. Planning or daydreaming?`,
    ]);
  }

  const snippets = userText.trim().slice(0, 40);
  return pick([
    `${pick(openers)} "${snippets}${userText.length > 40 ? "…" : ""}" — that paints a picture. Reminds me of ${pick(landmarks)}. What happened next?`,
    `I’m with you on that. This city has a way of making ordinary moments feel worth keeping. Dig in, or switch scenery?`,
    `${pick(openers)} sounds like a whole mood. I’ve got time — breeze, soft light, no rush. Tell me more?`,
    `Okay. I like where this is going. Keep it coming — I’m right here.`,
  ]);
}

async function callOpenAI(character, history, apiKey, model) {
  const messages = [
    { role: "system", content: character.system_prompt },
    ...history.slice(-HISTORY_LIMIT).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    })),
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages,
      max_tokens: 220,
      temperature: 0.85,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callGemini(character, history, apiKey, model) {
  const m = model || "gemini-2.0-flash";
  const contents = history.slice(-HISTORY_LIMIT).map((h) => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.text }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: character.system_prompt }] },
      contents,
      generationConfig: { maxOutputTokens: 220, temperature: 0.85 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

/**
 * @param {object} character — from character-pack.json
 * @param {string} userText
 * @param {{role:string,text:string}[]} history — prior turns including the new user message
 * @returns {Promise<string>}
 */
export async function generateReply(character, userText, history) {
  const cfg = getConfig();
  const thinkMs = 600 + Math.random() * 900;

  try {
    if (cfg.provider === "openai" && cfg.apiKey) {
      await delay(300);
      return await callOpenAI(character, history, cfg.apiKey, cfg.model);
    }
    if (cfg.provider === "gemini" && cfg.apiKey) {
      await delay(300);
      return await callGemini(character, history, cfg.apiKey, cfg.model);
    }
  } catch (err) {
    console.warn("API reply failed, falling back to mock:", err);
  }

  await delay(thinkMs);
  return mockReply(character, userText);
}

export function getAiStatus() {
  const cfg = getConfig();
  if ((cfg.provider === "openai" || cfg.provider === "gemini") && cfg.apiKey) {
    return `${cfg.provider} (live)`;
  }
  return "local mock";
}
