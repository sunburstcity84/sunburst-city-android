/**
 * Sunburst City reply engine.
 * Primary: Google Gemini free tier (API key in localStorage, never committed).
 * Fallback: local heuristic — intent + topic extraction, history-aware
 * template composition in Mika's voice (no paid API required).
 *
 * localStorage keys:
 *   sc_ai_provider  — "mock" | "openai" | "gemini"
 *   sc_ai_api_key   — API key string (device-only)
 *   sc_ai_model     — optional model override
 *   sc_gemini_banner_dismissed — "1" after user dismisses the gentle banner
 *
 * Or set before load:
 *   window.SUNBURST_AI = { provider, apiKey, model }
 */

const HISTORY_LIMIT = 18;
const LOCAL_HISTORY = 10;

/** Free-tier friendly defaults; try next on 404/not found. */
const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
];

const STYLE_ADDON =
  "Reply like a real person texting on a phone: short (1–3 sentences), " +
  "specific to what they just said, reference earlier turns when it fits, " +
  "never generic filler (“That’s interesting!”, “Tell me more!” alone, " +
  "or vague pep talk). Sound human — varied cadence, concrete details, " +
  "stay in character as Mika. No markdown, no bullet lists, no AI disclaimers.";

function lsGet(key) {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch (_) {}
  return null;
}

function lsSet(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      if (value == null || value === "") localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch (_) {}
}

function getConfig() {
  const w =
    (typeof window !== "undefined" && window.SUNBURST_AI) ||
    (typeof globalThis !== "undefined" && globalThis.SUNBURST_AI) ||
    {};
  const apiKey = (w.apiKey || lsGet("sc_ai_api_key") || "").trim();
  let provider = (w.provider || lsGet("sc_ai_provider") || "").trim().toLowerCase();
  // Key present without provider → prefer Gemini (quality path).
  if (!provider) provider = apiKey ? "gemini" : "mock";
  if (apiKey && provider === "mock") provider = "gemini";
  return {
    provider,
    apiKey,
    model: (w.model || lsGet("sc_ai_model") || "").trim(),
  };
}

/** Persist Gemini (or clear). Never logs the key. */
export function saveGeminiKey(rawKey) {
  const key = (rawKey || "").trim();
  if (!key) {
    lsSet("sc_ai_api_key", null);
    lsSet("sc_ai_provider", "mock");
    return { ok: true, hasKey: false };
  }
  lsSet("sc_ai_api_key", key);
  lsSet("sc_ai_provider", "gemini");
  return { ok: true, hasKey: true };
}

export function clearGeminiKey() {
  return saveGeminiKey("");
}

export function hasGeminiKey() {
  return !!getConfig().apiKey;
}

export function isBannerDismissed() {
  return lsGet("sc_gemini_banner_dismissed") === "1";
}

export function dismissBanner() {
  lsSet("sc_gemini_banner_dismissed", "1");
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const STOP = new Set(
  (
    "a an the and or but if so to of in on at for from with about into over " +
    "after before as by is are was were be been being am do does did doing " +
    "have has had having i me my you your we our they them their it its " +
    "this that these those what which who whom how why when where " +
    "can could would should will just not no yes ok okay yeah nah " +
    "really very too also still even much many some any all " +
    "im ive id youre youve dont doesnt didnt wont cant " +
    "hey hi hello yo sup hola there here"
  ).split(/\s+/)
);

const TOPIC_HINTS = [
  {
    id: "beach",
    re: /\b(beach|sand|ocean|sea|wave|waves|swim|swimming|surf|boardwalk|palm|palms|shore|coast)\b/i,
    label: "the beach",
  },
  {
    id: "cafe",
    re: /\b(caf[eé]|coffee|drink|drinks|food|eat|eating|lunch|dinner|brunch|tea|snack|hungry)\b/i,
    label: "a café stop",
  },
  {
    id: "downtown",
    re: /\b(tower|nms|skyline|downtown|city|cities|neon|glass|district|street|streets)\b/i,
    label: "downtown",
  },
  {
    id: "weather",
    re: /\b(weather|sun|sunny|hot|heat|warm|breeze|wind|rain|humid|summer|evening|morning|night|sunset|sunrise)\b/i,
    label: "the weather",
  },
  {
    id: "mood",
    re: /\b(tired|stressed|stress|anxious|anxiety|sad|lonely|happy|excited|bored|busy|overwhelmed|calm|chill|relax|relaxed|rough|hard day|good day)\b/i,
    label: "how you're feeling",
  },
  {
    id: "work",
    re: /\b(work|job|school|study|studying|boss|meeting|deadline|class|homework|office)\b/i,
    label: "work stuff",
  },
  {
    id: "music",
    re: /\b(music|song|songs|playlist|band|concert|listen|listening)\b/i,
    label: "music",
  },
  {
    id: "walk",
    re: /\b(walk|walking|hike|run|running|stroll|bike|cycling)\b/i,
    label: "getting outside",
  },
  {
    id: "plans",
    re: /\b(plan|plans|tonight|weekend|tomorrow|later|hang|hangout|visit|trip|travel)\b/i,
    label: "plans",
  },
];

function extractTopics(text) {
  const found = [];
  for (const h of TOPIC_HINTS) {
    if (h.re.test(text)) found.push(h);
  }
  return found;
}

function extractKeyPhrases(text) {
  const raw = (text || "")
    .replace(/[“”"']/g, "")
    .replace(/[^\w\s'-]/g, " ")
    .toLowerCase();
  const words = raw.split(/\s+/).filter(Boolean);
  const phrases = [];
  const LIGHT = new Set(
    "get got getting go going went wanna want wanted need needs needing like liked love loved think thinking feel feeling make making take taking"
      .split(/\s+/)
  );
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (STOP.has(a) || STOP.has(b)) continue;
    if (LIGHT.has(a) || LIGHT.has(b)) continue;
    if (a.length < 3 || b.length < 3) continue;
    phrases.push(`${a} ${b}`);
  }
  const unigrams = words.filter(
    (w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)
  );
  const seen = new Set();
  const out = [];
  for (const p of [...phrases, ...unigrams]) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= 4) break;
  }
  return out;
}

function recentUserTopics(history) {
  const all = history || [];
  let end = all.length;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].role === "user") {
      end = i;
      break;
    }
  }
  const slice = all.slice(Math.max(0, end - LOCAL_HISTORY), end);
  const labels = [];
  const seen = new Set();
  for (const m of slice) {
    if (m.role !== "user") continue;
    for (const t of extractTopics(m.text || "")) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      labels.push(t.label);
    }
  }
  return labels;
}

/** Pull a short concrete callback from a prior user turn (not the latest). */
function priorUserSnippet(history) {
  const all = history || [];
  let skipLatest = true;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].role !== "user") continue;
    if (skipLatest) {
      skipLatest = false;
      continue;
    }
    const phrases = extractKeyPhrases(all[i].text || "");
    if (phrases[0]) return softQuote(phrases[0]);
    const topics = extractTopics(all[i].text || "");
    if (topics[0]) return topics[0].label;
  }
  return "";
}

function detectIntent(userText) {
  const t = (userText || "").toLowerCase().trim();
  const isQ =
    /\?$/.test(t) ||
    /^(what|where|when|why|how|who|which|can|could|would|will|do|does|did|are|is|am|should|have|has)\b/.test(
      t
    );

  if (/^(bye|goodbye|good night|goodnight|see ya|see you|later|gotta go|gtg)\b/.test(t)) {
    return "farewell";
  }
  if (
    /^(hi|hey|hello|yo|sup|hola)\b/.test(t) &&
    t.split(/\s+/).length <= 4 &&
    !isQ
  ) {
    return "greeting";
  }
  if (/how are you|how's it|how r u|how're you|whats up|what's up|how you doing/.test(t)) {
    return "howareyou";
  }
  if (/who are you|your name|about you|tell me about (yourself|you)\b/.test(t)) {
    return "identity";
  }
  if (/\b(thanks|thank you|thx|ty)\b/.test(t)) {
    return "thanks";
  }
  if (/^(yes|yeah|yep|yup|sure|ok|okay|alright|true|exactly|right)\b/.test(t)) {
    return "affirm";
  }
  if (/^(no|nope|nah|not really|never)\b/.test(t)) {
    return "deny";
  }
  if (/\b(love you|cute|pretty|beautiful|hot|gorgeous|date me|marry)\b/.test(t)) {
    return "flirt";
  }
  if (
    /\b(help|advice|suggest|recommend|what should|tell me about|explain|describe)\b/.test(t) ||
    isQ
  ) {
    return "question";
  }
  if (extractTopics(t).some((x) => x.id === "mood")) {
    return "mood";
  }
  return "chat";
}

function softQuote(phrase) {
  if (!phrase) return "";
  return phrase.replace(/\s+/g, " ").trim().slice(0, 48);
}

function landmark() {
  return pick([
    "palm shade near the promenade",
    "a quiet café off the boardwalk",
    "late sun on the glass skyline",
    "the beach with the towers in the distance",
    "a soft breeze downtown",
    "NMS Tower catching the last light",
  ]);
}

/** Avoid repeating the same opener across consecutive local replies. */
const OPENERS = ["Mm.", "Yeah.", "Okay.", "Honestly?", "Got it.", "Fair.", "Huh.", "Right."];
let lastOpener = "";

function opener() {
  const pool = OPENERS.filter((o) => o !== lastOpener);
  const o = pick(pool.length ? pool : OPENERS);
  lastOpener = o;
  return o;
}

let lastReplySig = "";

function dedupeReply(candidates) {
  const pool = (candidates || []).filter(Boolean);
  if (!pool.length) return "";
  const fresh = pool.filter((c) => c !== lastReplySig && !c.startsWith(lastOpener + " “"));
  const chosen = pick(fresh.length ? fresh : pool);
  lastReplySig = chosen;
  return chosen;
}

/**
 * Local heuristic reply: reads latest message + short history,
 * answers on-topic, stays in Mika voice. Never greets on a real question.
 * Varied cadence + callbacks to prior turns; avoids repeating openers.
 */
function mockReply(character, userText, history) {
  const raw = (userText || "").trim();
  const intent = detectIntent(raw);
  const topics = extractTopics(raw);
  const phrases = extractKeyPhrases(raw);
  const topicLabel = topics[0]?.label || "";
  const priorTopics = recentUserTopics(history);
  const prior = priorTopics.filter((l) => l !== topicLabel);
  const hook = softQuote(phrases[0] || "");
  const priorHook = prior[0] || priorUserSnippet(history) || "";
  const name = (character.display_name || "Mika").split(" ")[0];
  const turnCount = (history || []).filter((m) => m.role === "user").length;

  if (intent === "greeting") {
    if (turnCount > 1 && priorHook) {
      return dedupeReply([
        `Hey again. Still circling ${priorHook}, or something new?`,
        `Back. Last we touched ${priorHook} — pick that up, or switch?`,
      ]);
    }
    return pick(
      character.starter_greetings || [
        `Hey. It’s ${name}. What’s on your mind?`,
      ]
    );
  }

  if (intent === "farewell") {
    return dedupeReply([
      "Alright. I’ll be here when you’re back — take it easy.",
      "Go soft. Message me when you want company again.",
      "Later. Sunburst’ll keep the lights warm for you.",
    ]);
  }

  if (intent === "thanks") {
    return dedupeReply([
      "Anytime. I’m right here.",
      "You’re welcome. Keep talking if you want.",
      "No stress. Glad it helped.",
    ]);
  }

  if (intent === "howareyou") {
    return dedupeReply([
      "Pretty steady — warm light, nowhere urgent to be. You free for a bit?",
      "Quiet stretch of the day. Mood: grounded. Tell me something small about yours.",
      "I’m around. Perfect window for a real conversation — how’s your day looking?",
    ]);
  }

  if (intent === "identity") {
    const bio = character.bio || "";
    const short = bio
      ? bio.split(". ").slice(0, 2).join(". ")
      : `I’m ${name}. I live here in Sunburst.`;
    return short + " Anyway — enough about me. What’s on your mind?";
  }

  if (intent === "flirt") {
    return dedupeReply([
      "That’s sweet. I’ll take it quietly. Keep talking — I like the energy.",
      "Noted, low-key. No pressure. Want company for a walk or just the chat?",
      "Appreciate that. Now tell me something real — beach or downtown mood?",
    ]);
  }

  if (intent === "affirm") {
    if (priorHook) {
      return dedupeReply([
        `Cool — staying with ${priorHook} then. What part do you want to dig into?`,
        `Yeah. On ${priorHook}: want a practical next step, or just to vent a little more?`,
        `Alright. I’m with you on that. Say more about ${priorHook}?`,
      ]);
    }
    return dedupeReply([
      "Okay. I’m with you. Keep going.",
      "Got it. What feels like the next piece?",
      "Yeah. Tell me the part that matters most.",
    ]);
  }

  if (intent === "deny") {
    return dedupeReply([
      "Fair. We can drop that. What do you actually want to talk about?",
      "Okay — different lane. Beach air, downtown, or something personal?",
      "Noted. No push. Your call on where we go next.",
    ]);
  }

  if (
    intent === "question" &&
    topics.some((x) => x.id === "beach") &&
    topics.some((x) => x.id === "downtown")
  ) {
    return dedupeReply([
      "Easy: cut toward the water from the glass streets — you’ll hit the palm promenade in a few soft blocks. Want the scenic way or the quick one?",
      "From downtown to the boardwalk: follow the breeze downhill toward the palms. Late sun makes that walk nicer. Going now or later?",
    ]);
  }

  if (topics.some((x) => x.id === "beach")) {
    if (intent === "question") {
      return dedupeReply([
        hook
          ? `On ${hook}: I’d go early — softer light, quieter sand, skyline still waking up. You more sunrise or sunset?`
          : "Beach answer, short: salt air, soft waves, palms framing the towers. Quiet stretch or boardwalk energy?",
        "Local take: the quieter shore when the boardwalk gets loud. Want water, or just the breeze?",
        `Ocean’s calm enough today. ${hook ? `About “${hook}” — ` : ""}are you planning a swim or just a sit?`,
      ]);
    }
    return dedupeReply([
      hook
        ? `Beach + “${hook}” — that fits Sunburst. Salt air, soft waves. What’s pulling you toward it?`
        : "Beach day’s always easy here — salt air, soft waves, skyline peeking through the palms. Sunrise or sunset person?",
      priorHook
        ? `Beach mood after ${priorHook} earlier — good reset. Quiet sand or boardwalk chatter?`
        : "I like the quieter stretch. You wanting water, or just the breeze?",
    ]);
  }

  if (topics.some((x) => x.id === "cafe")) {
    if (intent === "question") {
      return dedupeReply([
        hook
          ? `For ${hook}: quieter café a couple blocks off the boardwalk — soft light, decent iced drinks. That vibe, or closer to downtown?`
          : "Café pick: softer light off the boardwalk, or glass-and-neon closer in?",
        "Food mission — beach-adjacent or downtown? I’ll match the mood.",
      ]);
    }
    return dedupeReply([
      hook
        ? `“${hook}” and a café stop sounds right. Coffee first, then we figure the rest?`
        : "There’s a quieter café off the boardwalk — soft light, decent iced drinks. Want that, or downtown?",
      "Coffee first, then we figure out the rest. Deal?",
    ]);
  }

  if (topics.some((x) => x.id === "downtown")) {
    if (intent === "question") {
      if (/\b(nms|tower)\b/i.test(raw)) {
        return dedupeReply([
          "NMS Tower’s everyday skyline scenery here — glass catching late sun, not a mystery. Best view is from the promenade when the light goes gold. Want a walk that way?",
          "It’s part of the glass skyline, not a tour stop in my head. Looks sharp at sunset from the beach side. Curious about the view, or just the vibe?",
        ]);
      }
      return dedupeReply([
        hook
          ? `About ${hook}: late sun on the glass downtown is unfairly pretty. Exploring or people-watching?`
          : "Downtown answer: vacation ease meets big-city pace. Which corner feels right — skyline walk or a terrace?",
        "NMS Tower’s just everyday scenery from here. Want a route with better light, or a quieter street?",
      ]);
    }
    return dedupeReply([
      hook
        ? `Downtown + “${hook}” — yeah, that tracks. Soft night after a warm day. What’s the vibe you’re after?`
        : "Late sun on the glass downtown is unfairly pretty. Exploring or just people-watching?",
      "Skyline nights go soft after a warm day. Forever-summer makes picking a favorite hard. Yours?",
    ]);
  }

  if (topics.some((x) => x.id === "weather")) {
    return dedupeReply([
      hook
        ? `On the weather / “${hook}”: forever-summer here — warm, a little breeze off the water. Are you leaning into it or hiding in shade?`
        : "Weather’s classic Sunburst — warm light, soft breeze. Shade or sun for you right now?",
      "Golden and easy outside. Good excuse for a slow walk if you want one.",
    ]);
  }

  if (topics.some((x) => x.id === "work") || intent === "mood") {
    return dedupeReply([
      hook
        ? `Hearing you on “${hook}”. No rush — unload it. Want a practical angle, or just someone listening?`
        : "That sounds heavy enough to set down for a minute. I’m here. What part’s weighing most?",
      priorHook
        ? `Between that and ${priorHook} earlier… you’re carrying a lot. One thing at a time — which first?`
        : "Rough edges happen. Sunburst tip: step outside for two minutes of air, then we sort it. Want that, or keep talking here?",
    ]);
  }

  if (topics.some((x) => x.id === "music")) {
    return dedupeReply([
      hook
        ? `Music mood: “${hook}”. Soft evening playlist or something with more pulse?`
        : "Music’s a good reset. Soft evening or something with pulse?",
      "I like low volume with the window cracked — city hum underneath. What are you playing?",
    ]);
  }

  if (topics.some((x) => x.id === "walk") || topics.some((x) => x.id === "plans")) {
    return dedupeReply([
      hook
        ? `On “${hook}”: promenade for breeze, or downtown glass for people-watching?`
        : `Plans — I’m easy. ${landmark()}. What window are you thinking?`,
      priorHook
        ? `We can fold that into ${priorHook} from earlier, or keep it separate. Your call.`
        : "A slow loop sounds right. Beach air or skyline streets?",
    ]);
  }

  if (intent === "question") {
    if (hook) {
      return dedupeReply([
        `${opener()} On “${hook}” — short version: stay curious, don’t overcomplicate it. Want my local take or a blunt gut-check?`,
        `Good question about ${hook}. I’d keep it simple and human. What’s the constraint — time, energy, or nerves?`,
        `Hmm. Honest answer on ${hook}: start smaller than you think, then adjust. What are you aiming for?`,
      ]);
    }
    if (priorHook) {
      return dedupeReply([
        `Tying that to ${priorHook} from earlier — I’d stay calm and pick one next step. Want help naming it?`,
        `Given what you said about ${priorHook}, my take is: don’t force a big answer tonight. What’s the smallest useful move?`,
      ]);
    }
    return dedupeReply([
      `${opener()} I’d lean toward ${landmark()} for thinking space — but give me a little more of what you’re aiming for?`,
      "Good question. Short version: Sunburst rewards unhurried curiosity. Want my local take?",
      "Hmm. Honest answer stays calm and optimistic. Planning or daydreaming?",
    ]);
  }

  if (hook) {
    const bridge = priorHook
      ? pick([
          `Kinda connects to ${priorHook} earlier.`,
          `Different from ${priorHook}, but I’m tracking.`,
          "",
        ])
      : "";
    return dedupeReply([
      `${opener()} “${hook}” — that paints a picture. ${bridge} Reminds me of ${landmark()}. What happened next?`.replace(
        /\s{2,}/g,
        " "
      ),
      `I’m with you on “${hook}”. ${bridge} This city makes ordinary moments feel worth keeping. Dig in, or switch scenery?`.replace(
        /\s{2,}/g,
        " "
      ),
      `${opener()} “${hook}” sounds like a whole mood. I’ve got time — breeze, soft light, no rush. Tell me the part that sticks.`,
      // Short cadence variant
      hook.length < 20
        ? `“${hook}.” Okay — say the next sentence.`
        : `Got “${hook}.” Keep going; I’m listening.`,
    ]);
  }

  if (priorHook) {
    return dedupeReply([
      `Still thinking about ${priorHook} from before — or is this a new thread?`,
      `Okay. Circling back or fresh start? Either way, I’m here.`,
      `Got it. If this ties to ${priorHook}, say how; if not, just keep going.`,
    ]);
  }

  return dedupeReply([
    `${opener()} That landed. I’ve got time — breeze, soft light, no rush. What’s the detail you’re sitting with?`,
    "Okay. I like where this is going. Keep it coming — I’m right here.",
    `I’m with you on that. Reminds me of ${landmark()}. What happened next?`,
    "Say more — one concrete thing. I’ll meet you there.",
  ]);
}

async function callOpenAI(character, history, apiKey, model) {
  const messages = [
    {
      role: "system",
      content: `${character.system_prompt}\n\n${STYLE_ADDON}`,
    },
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
      temperature: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callGeminiOnce(character, history, apiKey, model) {
  const contents = history.slice(-HISTORY_LIMIT).map((h) => ({
    role: h.role === "user" ? "user" : "model",
    parts: [{ text: h.text }],
  }));
  // Gemini requires contents non-empty and typically starting with user.
  if (!contents.length) {
    contents.push({ role: "user", parts: [{ text: "Hey" }] });
  }
  const systemText = `${character.system_prompt || "You are Mika in Sunburst City."}\n\n${STYLE_ADDON}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents,
      generationConfig: {
        maxOutputTokens: 240,
        temperature: 0.9,
        topP: 0.95,
      },
    }),
  });
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    err.status = res.status;
    try {
      err.body = await res.text();
    } catch (_) {}
    throw err;
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  if (!text) throw new Error("Gemini empty response");
  return text;
}

async function callGemini(character, history, apiKey, model) {
  const preferred = model || GEMINI_MODEL_CANDIDATES[0];
  const queue = [preferred, ...GEMINI_MODEL_CANDIDATES.filter((m) => m !== preferred)];
  let lastErr = null;
  for (const m of queue) {
    try {
      return await callGeminiOnce(character, history, apiKey, m);
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const body = String(err?.body || err?.message || "");
      const notFound =
        status === 404 ||
        /NOT_FOUND|no longer available|is not found/i.test(body);
      if (notFound) continue;
      throw err;
    }
  }
  throw lastErr || new Error("Gemini failed");
}

/**
 * @param {object} character — from character-pack.json
 * @param {string} userText
 * @param {{role:string,text:string}[]} history — prior turns including the new user message
 * @returns {Promise<string>}
 */
export async function generateReply(character, userText, history) {
  const cfg = getConfig();
  const thinkMs = 450 + Math.random() * 700;

  try {
    if (cfg.provider === "openai" && cfg.apiKey) {
      await delay(280);
      const text = await callOpenAI(character, history, cfg.apiKey, cfg.model);
      if (text) return text;
    }
    if (cfg.provider === "gemini" && cfg.apiKey) {
      await delay(280);
      const text = await callGemini(character, history, cfg.apiKey, cfg.model);
      if (text) return text;
    }
  } catch (err) {
    console.warn("API reply failed, falling back to local engine:", err?.message || err);
  }

  await delay(thinkMs);
  return mockReply(character, userText, history || []);
}

export function getAiStatus() {
  const cfg = getConfig();
  if (cfg.provider === "gemini" && cfg.apiKey) return "gemini (live)";
  if (cfg.provider === "openai" && cfg.apiKey) return "openai (live)";
  return "local heuristic";
}

export function getMaskedKeyHint() {
  const key = getConfig().apiKey;
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
