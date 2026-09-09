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

/** Heuristic local replies that stay in Lila's voice */
function mockReply(character, userText) {
  const t = (userText || "").toLowerCase().trim();
  const name = character.display_name.split(" ")[0];
  const landmarks = [
    "the palm promenade",
    "a quiet café two blocks off the boardwalk",
    "NMS Tower catching late sun",
    "the beachfront glass skyline",
    "golden-hour light on downtown",
  ];

  const openers = [
    "Hey —",
    "Okay so —",
    "Honestly?",
    "Love that.",
    "Ha —",
    "Mm,",
  ];

  if (/^(hi|hey|hello|yo|sup|hola)\b/.test(t) || t.length < 3) {
    return pick(
      character.starter_greetings || [`Hey — ${name} here. What's good?`]
    );
  }

  if (/photo|shoot|camera|picture|pic/.test(t)) {
    return pick([
      `Photography brain activated. ${pick(landmarks)} is calling my name right now. What kind of shot are you chasing?`,
      `If you're asking for photo tips — golden hour here is unfairly pretty. Want a quiet corner or full skyline drama?`,
      `I just wrapped a shoot by the palms. Tell me your vibe and I'll mentally frame it.`,
    ]);
  }

  if (/beach|sand|ocean|wave|swim|boardwalk/.test(t)) {
    return pick([
      `Beach first, always — salt in the air, soft waves, skyline peeking behind the palms. You more sunrise or sunset person?`,
      `Boardwalk energy today feels perfect. There's a quieter stretch if you want less crowds. Coming with?`,
      `Ocean breeze + café noise is my favorite combo. What's pulling you toward the water?`,
    ]);
  }

  if (/café|cafe|coffee|drink|food|eat|lunch|dinner/.test(t)) {
    return pick([
      `I know a quieter café two blocks from the boardwalk — soft light, good iced drinks, zero tourist rush. Want the mental map?`,
      `Food mission accepted. Beach-adjacent or downtown glass-and-neon? I'll match the vibe.`,
      `Coffee first, then we negotiate beach vs skyline. Deal?`,
    ]);
  }

  if (/tower|nms|skyline|downtown|city/.test(t)) {
    return pick([
      `NMS Tower in late sun is basically cheating for photos. Downtown glass just… glows. You exploring or people-watching?`,
      `Skyline nights here go soft neon after rain. Forever-summer days, warm nights — hard to pick a favorite. Yours?`,
      `Sunburst downtown is vacation ease meets big-city ambition. What corner should we claim?`,
    ]);
  }

  if (/how are you|how's it|how r u|whats up|what's up/.test(t)) {
    return pick([
      `Pretty good — catching the last gold on the skyline and pretending my to-do list doesn't exist. You free for a bit?`,
      `Warm breeze, camera bag half-zipped, mood: optimistic. Tell me something good about your day.`,
      `I'm floating between shoot and café. Perfect window for a chat — how's your day looking?`,
    ]);
  }

  if (/who are you|your name|about you|tell me about/.test(t)) {
    return (
      character.bio?.split(". ").slice(0, 2).join(". ") +
      ". Anyway — enough about me. What's your Sunburst mood today?"
    );
  }

  if (/flirt|cute|pretty|beautiful|date|love you|hot/.test(t)) {
    return pick([
      `Careful — sunsets here already do enough damage. Keep talking though; I like the energy.`,
      `That's sweet. I'll take the compliment and raise you a golden-hour walk. No pressure — just good light.`,
      `Noted, playfully filed. Now tell me something real — beach or downtown first?`,
    ]);
  }

  if (/\?$/.test(t)) {
    return pick([
      `${pick(openers)} I'd say ${pick(landmarks)} is a solid answer — but give me a little more of what you're aiming for?`,
      `Good question. Short version: Sunburst rewards curiosity. Want my local take or the tourist-gloss version?`,
      `Hmm. My honest answer leans beachy and optimistic. What's driving the question — planning or daydreaming?`,
    ]);
  }

  const snippets = userText.trim().slice(0, 40);
  return pick([
    `${pick(openers)} "${snippets}${userText.length > 40 ? "…" : ""}" — that paints a picture. Reminds me of ${pick(landmarks)}. What happened next?`,
    `I'm with you on that. Sunburst has this way of making ordinary moments feel like a frame worth keeping. Want to dig into it or switch scenery?`,
    `${pick(openers)} sounds like a whole mood. I've got time — beach air, soft light, no rush. Tell me more?`,
    `Okay I like where this is going. Keep it coming — and if you need a local tip mid-story, I'm right here.`,
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
