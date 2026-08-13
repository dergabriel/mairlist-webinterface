// Mock data for the mAirList webinterface.
//
// This structure is now aligned with the real TubeLive interface (see the
// screenshots). Field names and the full cue point list are taken from there.
// It is still a PLACEHOLDER for the data itself: once we have the real DB,
// only repository.js changes.
//
// IMPORTANT unit note:
//   duration / length is in SECONDS with a fractional part (e.g. 140.533),
//   exactly as shown in the interface. Cue point values below use the same
//   unit. Whether mAirList stores it this way internally is a Phase 1
//   question, to be confirmed with the diff method.

const storages = [
  { id: 1, name: "Musik", location: "C:\\Audio\\Musik" },
  { id: 2, name: "Verpackung", location: "C:\\Audio\\Verpackung" },
  { id: 3, name: "Beitraege", location: "C:\\Audio\\Beitraege" },
];

// Virtual folder tree, modelled after the real library tree in the screenshots.
const folders = [
  { id: 1, name: "# Import", parentId: null },
  { id: 10, name: "Beiträge", parentId: null },
  { id: 11, name: "aktuell", parentId: 10 },
  { id: 12, name: "zeitlos", parentId: 10 },
  { id: 20, name: "Musik", parentId: null },
  { id: 21, name: "A - Heavy Current", parentId: 20 },
  { id: 22, name: "B - Medium Current", parentId: 20 },
  { id: 23, name: "C - Light", parentId: 20 },
  { id: 24, name: "D - Recurrent", parentId: 20 },
  { id: 25, name: "E - 2010s", parentId: 20 },
  { id: 26, name: "N - New Music", parentId: 20 },
  { id: 27, name: "V - Virale Songs", parentId: 20 },
  { id: 30, name: "Verpackung", parentId: null },
  { id: 31, name: "Meme Dropper", parentId: 30 },
  { id: 32, name: "Showopener", parentId: 30 },
  { id: 33, name: "Sweeper", parentId: 30 },
  { id: 34, name: "Themes", parentId: 30 },
  { id: 35, name: "Vollblock Halbblock", parentId: 30 },
];

// Item types as seen in mAirList. Finer distinctions (Dropper vs. Station ID
// vs. Promo etc.) are handled via folders and attributes, not separate types.
const ITEM_TYPES = [
  { key: "music",       label: "Music",       note: "Regulärer Musiktitel" },
  { key: "jingle",      label: "Jingle",      note: "Kennung, Soundeffekt, Dropper, Station ID, Promo, Trailer" },
  { key: "advertising", label: "Advertising", note: "Werbespot, kommerzieller Einschub" },
  { key: "news",        label: "News",        note: "Nachrichtenbeitrag, Nachrichten-Enhancer" },
  { key: "weather",     label: "Weather",     note: "Wetterbericht, Wetterbett" },
  { key: "traffic",     label: "Traffic",     note: "Verkehrsmeldung" },
  { key: "moderation",  label: "Moderation",  note: "Gesprochener Beitrag, Voice Track" },
  { key: "bed",         label: "Bed",         note: "Unterlegmusik für Wortbeiträge" },
  { key: "stream",      label: "Stream",      note: "Live-Stream, externe Audio-Quelle" },
  { key: "container",   label: "Container",   note: "Dynamischer Container (Hook, Regio, News, generisch)" },
  { key: "dummy",       label: "Dummy",       note: "Platzhalter, nicht abspielbar" },
  { key: "silence",     label: "Silence",     note: "Stille, definierte Pause" },
];

// Container subtypes. A container is resolved at runtime (random pick, regional
// split, live insert). These are the ones the station actually uses.
const CONTAINER_TYPES = [
  { key: "hook", label: "Hook Container", note: "zufälliger Hook aus einem Pool" },
  { key: "regio", label: "Regio Container", note: "regionale Auseinanderschaltung" },
  { key: "news", label: "Nachrichten Container", note: "lädt zur vollen Stunde die News" },
  { key: "generic", label: "Container", note: "sonstiger dynamischer Container" },
];

// The full cue point set from the Cue Editor screenshot, with the marker
// colours used in the UI. This drives the cue editor cards later.
// Colours are our best read of the coloured dots in the interface.
const CUE_POINTS = [
  { key: "cueIn", label: "Cue In", color: "#22c55e" },
  { key: "fadeIn", label: "Fade In", color: "#3b82f6" },
  { key: "ramp1", label: "Ramp 1", color: "#eab308" },
  { key: "ramp2", label: "Ramp 2", color: "#eab308" },
  { key: "ramp3", label: "Ramp 3", color: "#eab308" },
  { key: "loopIn", label: "Loop In", color: "#f97316" },
  { key: "loopOut", label: "Loop Out", color: "#f97316" },
  { key: "hookIn", label: "Hook In", color: "#ec4899" },
  { key: "hookFade", label: "Hook Fade", color: "#ec4899" },
  { key: "hookOut", label: "Hook Out", color: "#ec4899" },
  { key: "outro", label: "Outro", color: "#22c55e" },
  { key: "startNext", label: "Start Next", color: "#9ca3af" },
  { key: "fadeOut", label: "Fade Out", color: "#3b82f6" },
  { key: "fadeEnd", label: "Fade End", color: "#3b82f6" },
  { key: "cueOut", label: "Cue Out", color: "#ef4444" },
  { key: "preroll", label: "Preroll", color: "#f97316" },
  { key: "anchor", label: "Anchor", color: "#f97316" },
];

// Helper to build a cue object with all keys, unset ones as null.
function cue(values = {}) {
  const base = {};
  for (const cp of CUE_POINTS) base[cp.key] = null;
  return { ...base, ...values };
}

// Items use the fields from the item editor: title, artist (Interpret), type,
// duration (Länge in seconds), endTime (Ende), internalId, externalId,
// comment, color, cover. The list ID equals internalId.
const items = [
  {
    id: "476",
    internalId: 476,
    externalId: null,
    type: "music",
    title: "Mood",
    artist: "24kGoldn & Iann Dior",
    duration: 140.533,
    endTime: null,
    storageId: 1,
    relativePath: "A-Heavy-Current\\24kgoldn-mood.wav",
    folderId: 21,
    comment: "",
    color: null,
    cover: "el-dorado.jpg",
    cue: cue({ cueIn: 0.3, fadeOut: 136.0, cueOut: 140.533, hookIn: 45.0, hookOut: 75.0 }),
    attributes: { Energy: "high", Mood: "uplifting", BPM: "91" },
    updatedAt: "2023-12-19T22:52:59",
  },
  {
    id: "492",
    internalId: 492,
    externalId: null,
    type: "music",
    title: "Your Love (9PM)",
    artist: "ATB & Topic & A7S",
    duration: 150.053,
    endTime: null,
    storageId: 1,
    relativePath: "A-Heavy-Current\\atb-your-love-9pm.wav",
    folderId: 21,
    comment: "",
    color: null,
    cover: null,
    cue: cue({ cueIn: 0.0, fadeOut: 146.0, cueOut: 150.053 }),
    attributes: { Energy: "high", BPM: "126" },
    updatedAt: "2023-12-19T22:34:10",
  },
  {
    id: "598",
    internalId: 598,
    externalId: null,
    type: "music",
    title: "Sweet Dreams",
    artist: "Alan Walker & Imanbek",
    duration: 138.819,
    endTime: null,
    storageId: 1,
    relativePath: "B-Medium-Current\\alan-walker-sweet-dreams.wav",
    folderId: 22,
    comment: "",
    color: null,
    cover: null,
    cue: cue({ cueIn: 0.5, fadeOut: 134.0, cueOut: 138.819 }),
    attributes: { Energy: "medium", BPM: "128" },
    updatedAt: "2023-12-19T23:02:56",
  },
  {
    id: "477",
    internalId: 477,
    externalId: null,
    type: "music",
    title: "When I'm Gone",
    artist: "Alesso & Katy Perry",
    duration: 161.267,
    endTime: null,
    storageId: 1,
    relativePath: "A-Heavy-Current\\alesso-when-im-gone.wav",
    folderId: 21,
    comment: "",
    color: null,
    cover: null,
    cue: cue({ cueIn: 0.2, fadeOut: 157.0, cueOut: 161.267 }),
    attributes: { Energy: "high", BPM: "125" },
    updatedAt: "2023-12-19T23:04:41",
  },
  {
    id: "701",
    internalId: 701,
    externalId: null,
    type: "jingle",
    title: "Showopener Kurz",
    artist: "",
    duration: 4.2,
    endTime: null,
    storageId: 2,
    relativePath: "showopener-kurz.wav",
    folderId: 32,
    comment: "Standard Opener",
    color: null,
    cover: null,
    cue: cue({ cueIn: 0.0, cueOut: 4.2 }),
    attributes: { Category: "opener" },
    updatedAt: "2023-12-18T14:10:00",
  },
  {
    id: "845",
    internalId: 845,
    externalId: null,
    type: "advertising",
    title: "Autohaus Becker Spot",
    artist: "",
    duration: 30.0,
    endTime: null,
    storageId: 3,
    relativePath: "autohaus-becker-30s.wav",
    folderId: 30,
    comment: "Kampagne Frühjahr 2026",
    color: null,
    cover: null,
    cue: cue({ cueIn: 0.0, cueOut: 30.0 }),
    attributes: { Campaign: "Fruehjahr 2026", Customer: "Autohaus Becker" },
    updatedAt: "2026-01-05T09:00:00",
  },
  {
    id: "901",
    internalId: 901,
    externalId: null,
    type: "container",
    containerType: "hook",
    title: "Hook Pool Heavy Current",
    artist: "",
    duration: 15.0,
    endTime: null,
    storageId: null,
    relativePath: null,
    folderId: 20,
    comment: "Zufälliger Hook aus A - Heavy Current",
    color: null,
    cover: null,
    cue: cue({}),
    attributes: {},
    updatedAt: "2026-02-01T10:00:00",
  },
  {
    id: "902",
    internalId: 902,
    externalId: null,
    type: "container",
    containerType: "regio",
    title: "Regio Auseinanderschaltung",
    artist: "",
    duration: 120.0,
    endTime: null,
    storageId: null,
    relativePath: null,
    folderId: null,
    comment: "Regionale Werbung und Verkehr",
    color: null,
    cover: null,
    cue: cue({}),
    attributes: {},
    updatedAt: "2026-02-01T10:05:00",
  },
  {
    id: "903",
    internalId: 903,
    externalId: null,
    type: "container",
    containerType: "news",
    title: "Nachrichten zur vollen Stunde",
    artist: "",
    duration: 180.0,
    endTime: null,
    storageId: null,
    relativePath: null,
    folderId: null,
    comment: "Lädt aktuelle News beim Abspielen",
    color: null,
    cover: null,
    cue: cue({}),
    attributes: {},
    updatedAt: "2026-02-01T10:10:00",
  },
];

module.exports = { storages, folders, items, ITEM_TYPES, CONTAINER_TYPES, CUE_POINTS };
