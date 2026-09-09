// Small pure helpers shared between sqlRepository.js and apiRepository.js.
//
// Only genuinely identical, data-source-agnostic logic lives here: naming
// conventions and id formats that both real repositories happen to agree
// on, not because they're coupled, but because both ultimately describe
// the same underlying mAirList concepts (cue marker names, item type
// casing, the webinterface's own YYYY-MM-DD-HH playlist id format).
//
// repository.js (the in-memory mock) is deliberately NOT wired to this
// file: its resequence()/parseEmptyHourId() use the same formulas, but it
// stays independent so mock-mode can keep evolving (or not) without
// touching the two real implementations. See CODE-REVIEW.md 3.2.

// camelCase (code) <-> PascalCase (DB/API) cue marker types
const CUE_TO_DB = {
  cueIn: "CueIn", fadeIn: "FadeIn", ramp1: "Ramp1", ramp2: "Ramp2", ramp3: "Ramp3",
  loopIn: "LoopIn", loopOut: "LoopOut", hookIn: "HookIn", hookFade: "HookFade",
  hookOut: "HookOut", outro: "Outro", startNext: "StartNext", fadeOut: "FadeOut",
  fadeEnd: "FadeEnd", cueOut: "CueOut", preroll: "Preroll", anchor: "Anchor",
};
const DB_TO_CUE = Object.fromEntries(Object.entries(CUE_TO_DB).map(([k, v]) => [v, k]));

// item.type: DB/API PascalCase -> code lowercase. (The reverse direction,
// typeToDb(), differs enough in practice - sqlRepository.js is the only
// caller and needs it - that it stays local to that file.)
const typeToCode = (t) => (t || "").toLowerCase();

// Playlist id format shared by both repositories' getPlaylistById(id) etc.:
// "YYYY-MM-DD-HH", one id per hour-slot.
const PLAYLIST_ID_RE = /^(\d{4}-\d{2}-\d{2})-(\d{2})$/;

function parsePlaylistId(id) {
  const match = PLAYLIST_ID_RE.exec(id);
  if (!match) return null;
  return { date: match[1], hour: parseInt(match[2], 10) };
}

const playlistId = (date, hour) => `${date}-${String(hour).padStart(2, "0")}`;

// Seconds-since-midnight -> "HH:MM:SS", wrapping past 24h. Used to compute
// each playlist entry's cumulative scheduledStart from the hour's start
// plus prior entries' durations.
function secondsToClock(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

module.exports = {
  CUE_TO_DB,
  DB_TO_CUE,
  typeToCode,
  parsePlaylistId,
  playlistId,
  secondsToClock,
};
