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

// Predefined attribute schema for the item editor's Attribute tab. This is a
// fixed catalogue of fields the editor knows how to render (select, number,
// checkbox, ...). Keys match the casing used in items[].attributes below
// (and in docs/SCHEMA.md's real item_attributes examples, e.g. "BPM", "Jahr")
// so the editor can actually read/write the freeform values items carry.
const ATTRIBUTE_DEFINITIONS = [
  { key: "Energy", label: "Energy", type: "select", options: ["low", "medium", "high"] },
  { key: "Mood", label: "Mood", type: "select", options: ["happy", "uplifting", "driving", "melancholic", "calm"] },
  { key: "BPM", label: "BPM", type: "number" },
  { key: "Key", label: "Tonart", type: "text" },
  { key: "Explicit", label: "Explicit", type: "checkbox" },
  { key: "OnlineOnly", label: "Nur online", type: "checkbox" },
  { key: "Category", label: "Kategorie", type: "multiselect", options: ["Pop", "Rock", "Dance", "Hip-Hop", "R&B", "Latin"] },
  { key: "Notes", label: "Notizen", type: "textarea" },
];

// Helper to build a cue object with all keys, unset ones as null.
function cue(values = {}) {
  const base = {};
  for (const cp of CUE_POINTS) base[cp.key] = null;
  return { ...base, ...values };
}

// Default playback settings (Wiedergabe tab): gain in dB and segue mode.
// Fade and loop are cue points (see CUE_POINTS: fadeIn/fadeOut/loopIn/loopOut),
// not item-level settings, so they live in `cue`, not here.
function playback(values = {}) {
  return {
    gainDb: 0,
    normalizedLufs: null,
    segueMode: "normal",
    ...values,
  };
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
    playback: playback({ gainDb: -1.2, normalizedLufs: -14 }),
    attributes: { Energy: "high", Mood: "uplifting", BPM: "91" },
    updatedAt: "2023-12-19T22:52:59",
    playHistory: [
      { playedAt: "2026-08-13T07:42:11", show: "Morningshow", moderator: "Julia Ferrer" },
      { playedAt: "2026-08-12T16:15:03", show: "Nachmittagsmix", moderator: "Tom Brandt" },
      { playedAt: "2026-08-11T12:03:47", show: "Mittagsshow", moderator: null },
      { playedAt: "2026-08-10T08:21:55", show: "Morningshow", moderator: "Julia Ferrer" },
      { playedAt: "2026-08-08T19:47:32", show: null, moderator: null },
    ],
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
    playback: playback(),
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
    playback: playback({ gainDb: 0.8, normalizedLufs: -14 }),
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
    playback: playback(),
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
    playback: playback({ segueMode: "immediate" }),
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
    playback: playback({ segueMode: "waitForEnd" }),
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
    playback: playback(),
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
    playback: playback(),
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
    playback: playback(),
    attributes: {},
    updatedAt: "2026-02-01T10:10:00",
  },
];

// Playlists: one entry per (date, hour), holding an ordered list of items to
// play that hour. `entries[].itemId` resolves against `items` above.
//
// Example data below is generated for today's date across a realistic
// morning block (06:00-10:59), each hour built from a repeating rotation
// pattern (Music, Jingle, Music, Music, Container, Music, Jingle, ...) drawn
// from the item pool already defined above.
const today = new Date().toISOString().slice(0, 10);

const MUSIC_IDS = ["476", "492", "598", "477"];
const JINGLE_ID = "701";
const CONTAINER_IDS = ["901", "902", "903"];

// Builds one hour's entries from a fixed rotation pattern, cycling through
// the available music pool and container types so hours don't repeat
// identically, and stamping scheduledStart from each item's duration.
function buildHourEntries(hour, patternLength, musicOffset, containerOffset) {
  const pattern = ["music", "jingle", "music", "music", "container", "music", "jingle", "music"].slice(
    0,
    patternLength
  );

  let cursorSeconds = hour * 3600;
  let musicIndex = musicOffset;
  let containerIndex = containerOffset;
  const entries = [];

  pattern.forEach((kind, i) => {
    let itemId;
    if (kind === "music") {
      itemId = MUSIC_IDS[musicIndex % MUSIC_IDS.length];
      musicIndex += 1;
    } else if (kind === "jingle") {
      itemId = JINGLE_ID;
    } else {
      itemId = CONTAINER_IDS[containerIndex % CONTAINER_IDS.length];
      containerIndex += 1;
    }

    const item = items.find((it) => it.id === itemId);
    const h = String(Math.floor(cursorSeconds / 3600) % 24).padStart(2, "0");
    const m = String(Math.floor((cursorSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(cursorSeconds % 60)).padStart(2, "0");

    entries.push({
      position: i + 1,
      itemId,
      scheduledStart: `${h}:${m}:${s}`,
    });

    cursorSeconds += item ? item.duration : 0;
  });

  return entries;
}

const playlists = [
  { id: "pl-06", date: today, hour: 6, entries: buildHourEntries(6, 7, 0, 0) },
  { id: "pl-07", date: today, hour: 7, entries: buildHourEntries(7, 8, 1, 1) },
  { id: "pl-08", date: today, hour: 8, entries: buildHourEntries(8, 6, 2, 2) },
  { id: "pl-09", date: today, hour: 9, entries: buildHourEntries(9, 8, 3, 0) },
  { id: "pl-10", date: today, hour: 10, entries: buildHourEntries(10, 7, 0, 1) },
];

module.exports = {
  storages,
  folders,
  items,
  ITEM_TYPES,
  CONTAINER_TYPES,
  CUE_POINTS,
  ATTRIBUTE_DEFINITIONS,
  playlists,
};
