let packCache = null;

export async function loadCharacterPack() {
  if (packCache) return packCache;
  const res = await fetch("data/character-pack.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to load character pack");
  packCache = await res.json();
  return packCache;
}

export function getCharacter(pack, id = "lila_solano") {
  const list = pack?.characters || [];
  return list.find((c) => c.id === id) || list[0] || null;
}

export function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
