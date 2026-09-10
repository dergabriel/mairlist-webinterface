// Row background per playlist item type, keyed off item.type/item.containerType.
//
// Whether an item is a container can NOT be read reliably off `type` alone —
// e.g. a disguised news container reports type "news", indistinguishable
// from a plain news item by type. `containerType` is the reliable signal:
// container classes end in "Container" or "ContainerMarker" (Container,
// HookContainer, AutoHookContainer, NewsContainer, RegionContainer,
// AutoHookContainerMarker, ...) — see apiItems.js's isContainerClass(). Mock
// mode uses its own free-text containerType subtype ("hook"/"regio"/"news"/
// "generic") and an honest type: "container", which also satisfies this
// check via the type fallback below.
const CONTAINER_CLASS_RE = /(?:Container|ContainerMarker)$/i;

export function isContainerItem(item) {
  if (!item) return false;
  if (CONTAINER_CLASS_RE.test(item.containerType || "")) return true;
  return (item.type || "").toLowerCase() === "container";
}

// Background applied to a container row, keyed by its containerType where
// that hints at a familiar type family (news/regio => amber, like News),
// falling back to a generic container tint otherwise.
function containerBackgroundClass(item) {
  const hint = (item.containerType || "").toLowerCase();
  if (hint.includes("news")) return "bg-amber-500/10";
  return "bg-violet-500/10";
}

// Very low opacity per type family, applied as the whole row's background.
const TYPE_BACKGROUND = {
  voice: "bg-green-500/10",
  moderation: "bg-green-500/10",
  show: "bg-green-500/10",
  news: "bg-amber-500/10",
  weather: "bg-blue-500/10",
  traffic: "bg-blue-500/10",
  advertising: "bg-amber-500/20",
  package: "bg-violet-500/10",
  jingle: "bg-orange-500/10",
  sweeper: "bg-orange-500/10",
  drop: "bg-orange-500/10",
  trailer: "bg-violet-500/10",
  promo: "bg-amber-500/10",
  sponsorship: "bg-amber-500/10",
  stationid: "bg-orange-500/10",
  bed: "bg-cyan-500/10",
  stream: "bg-cyan-500/10",
  command: "bg-red-500/10",
  break: "bg-red-500/10",
  silence: "bg-zinc-700/30",
  error: "bg-red-500/25",
  dummy: "bg-zinc-800/40 italic text-zinc-500",
};

// Container gets its own border-based treatment (checked first, regardless
// of type — a container disguised as News must not fall through to the
// News row color alone). Everything else falls back to TYPE_BACKGROUND,
// defaulting to no background for unknown/unlisted types.
export function itemRowClass(item) {
  if (!item) return "";
  if (isContainerItem(item)) {
    return `${containerBackgroundClass(item)} border-l-2 border-l-violet-500/50`;
  }
  const type = (item.type || "").toLowerCase();
  return TYPE_BACKGROUND[type] || "";
}
