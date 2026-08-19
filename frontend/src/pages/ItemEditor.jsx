import { useState, useMemo, useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic, Users, Tag, ScrollText,
  RefreshCw, ChevronLeft, LayoutList, Play, Pause, SlidersHorizontal,
  Clock, History, Pencil, Volume2, ZoomIn, ZoomOut, Bookmark, Trash2,
  Palette, Image as ImageIcon, AlertTriangle, CircleDot, Database as DatabaseIcon,
} from "lucide-react";
import {
  getItemById, updateItem, getItemHistory, getAttributeDefinitions,
  getPlaylistById, savePlaylistItemOverrides, getAudioUrl,
} from "../lib/api";

// Fields a playlist entry is allowed to override locally ("volatile" edits,
// per mAirList's playlist/database separation): cue points and attributes.
// Everything else (title, storage path, playback, ...) only ever lives on
// the global item.
const OVERRIDABLE_KEYS = ["cue", "attributes"];

// Layers `overrides` (a subset of OVERRIDABLE_KEYS) on top of the global
// item for display. Returns a new object; never mutates either input.
function applyOverrides(globalItem, overrides) {
  if (!overrides) return globalItem;
  const merged = { ...globalItem };
  for (const key of OVERRIDABLE_KEYS) {
    if (overrides[key] != null) merged[key] = { ...globalItem[key], ...overrides[key] };
  }
  return merged;
}

// Diffs `edited` against `globalItem` for just the overridable keys and
// returns only the sub-keys that actually changed (e.g. only the cue points
// the user touched, not the whole cue object) — so saving "für diese
// Stunde" never freezes in fields the user never looked at.
function diffOverrides(globalItem, edited) {
  const overrides = {};
  for (const key of OVERRIDABLE_KEYS) {
    const before = globalItem[key] || {};
    const after = edited[key] || {};
    const changed = {};
    for (const subKey of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[subKey]) !== JSON.stringify(after[subKey])) {
        changed[subKey] = after[subKey];
      }
    }
    if (Object.keys(changed).length > 0) overrides[key] = changed;
  }
  return overrides;
}

// --- Shared constants (mirror the backend) ---

const ITEM_TYPES = [
  { key: "music", label: "Musik" },
  { key: "jingle", label: "Jingle" },
  { key: "advertising", label: "Werbung" },
  { key: "container", label: "Container" },
  { key: "stream", label: "Stream" },
  { key: "dummy", label: "Dummy" },
];

const CONTAINER_TYPES = [
  { key: "hook", label: "Hook Container" },
  { key: "regio", label: "Regio Container" },
  { key: "news", label: "Nachrichten Container" },
  { key: "generic", label: "Container (sonstiges)" },
];

const SEGUE_MODES = [
  { key: "normal", label: "Normal" },
  { key: "immediate", label: "Sofort" },
  { key: "waitForEnd", label: "Warte auf Ende" },
];

const TARGET_LUFS = -14;

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

// Default display order for the cue cards: the points a moderator touches
// most, shown first. Everything else keeps CUE_POINTS' order below.
const DEFAULT_CUE_PRIORITY = [
  "cueIn", "fadeIn", "ramp1", "hookIn", "hookOut", "fadeOut", "cueOut", "startNext",
];

// Points at the current priority list. Currently just the default; once user
// settings exist, this becomes a value read from there, and the sorting
// below (sortByCuePriority) doesn't need to change.
const cuePriority = DEFAULT_CUE_PRIORITY;

// Priority keys first (in priority order), then the rest in CUE_POINTS order.
function sortByCuePriority(points, priority) {
  const rank = new Map(priority.map((key, i) => [key, i]));
  const prioritised = [];
  const rest = [];
  for (const p of points) {
    (rank.has(p.key) ? prioritised : rest).push(p);
  }
  prioritised.sort((a, b) => rank.get(a.key) - rank.get(b.key));
  return { prioritised, rest };
}

// --- Helpers ---

const formatTimecode = (sec) => {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
};

const mmss = (sec) => {
  const t = Math.floor(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const formatDate = (iso) => iso.replace("T", "  ");

// Cue points are shown and edited as seconds with fractional part (e.g.
// 140.533). Whether mAirList actually stores them this way internally is
// unconfirmed (see mockData.js), so the conversion is isolated here. Both
// are the identity for now; swap the implementation once that's proven.
const toStorage = (displaySeconds) => displaySeconds;
const fromStorage = (storedSeconds) => storedSeconds;

const isValidCueValue = (val, duration) => {
  if (val === null || val === "") return true;
  const n = Number(val);
  if (Number.isNaN(n)) return false;
  if (n < 0) return false;
  if (duration != null && n > duration) return false;
  return true;
};

// Loudness normalisation. Real implementation needs actual audio analysis
// (e.g. an EBU R128 pass over the file) to measure integrated LUFS and derive
// the gain that would bring it to TARGET_LUFS; until that's wired up, this
// returns a plausible mock gain so the UI and save flow can be built against
// the final function signature already.
async function normalizeAudio(itemId) {
  const gainDb = Number((Math.random() * 6 - 3).toFixed(1)); // -3.0 .. +3.0
  return { gainDb, targetLufs: TARGET_LUFS };
}

// Deterministic pseudo waveform, so it never flickers between renders.
const WAVE_BARS = Array.from({ length: 200 }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const r = seed - Math.floor(seed);
  const envelope = Math.sin((i / 200) * Math.PI); // quieter at start and end
  return 12 + r * 80 * (0.5 + envelope * 0.5);
});

// --- Small components ---

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
    >
      <Icon size={16} className={active ? "text-orange-500" : ""} />
      <span>{label}</span>
    </button>
  );
}

function TabItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md border-l-2 py-2 pl-3 pr-2 text-sm transition-colors ${
        active
          ? "border-orange-500 bg-zinc-800/60 text-zinc-100"
          : "border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
      }`}
    >
      <Icon size={15} className={active ? "text-orange-500" : "text-zinc-500"} />
      <span>{label}</span>
    </button>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700";

function CueCard({ point, value, duration, onChange, onSetMarker, onJump, onClear }) {
  const invalid = !isValidCueValue(value, duration);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-zinc-200">{point.label}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: point.color }} />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={value ?? ""}
          onChange={(e) => onChange(point.key, e.target.value)}
          placeholder="Zeit"
          className={`w-full rounded border bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-700 ${
            invalid ? "border-red-800/70" : "border-zinc-800"
          }`}
        />
        <button
          onClick={() => onSetMarker(point.key)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="Marker setzen"
        >
          <Bookmark size={13} />
        </button>
        <button
          onClick={() => onJump(point.key)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="Anspringen"
        >
          <Volume2 size={13} />
        </button>
        <button
          onClick={() => onClear(point.key)}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
          title="Löschen"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// --- Tab panels ---

function GeneralTab({ item, update }) {
  const isContainer = item.type === "container";
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      {/* Left: form */}
      <div className="space-y-4">
        <Field label="Title">
          <input className={inputClass} value={item.title} onChange={(e) => update("title", e.target.value)} />
        </Field>
        <Field label="Interpret">
          <input className={inputClass} value={item.artist} onChange={(e) => update("artist", e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Type">
            <select className={inputClass} value={item.type} onChange={(e) => update("type", e.target.value)}>
              {ITEM_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Länge">
            <input className={inputClass} value={item.duration} onChange={(e) => update("duration", e.target.value)} />
          </Field>
          <Field label="Ende">
            <input className={inputClass} value={item.endTime ?? ""} onChange={(e) => update("endTime", e.target.value)} placeholder="" />
          </Field>
        </div>

        {isContainer && (
          <Field label="Container Typ">
            <select className={inputClass} value={item.containerType} onChange={(e) => update("containerType", e.target.value)}>
              {CONTAINER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Interne ID">
            <input className={`${inputClass} text-zinc-500`} value={item.internalId} readOnly />
          </Field>
          <Field label="Externe ID">
            <input className={inputClass} value={item.externalId ?? ""} onChange={(e) => update("externalId", e.target.value)} />
          </Field>
        </div>

        <Field label="Kommentar/Beschreibung">
          <textarea rows={6} className={`${inputClass} resize-none`} value={item.comment ?? ""} onChange={(e) => update("comment", e.target.value)} />
        </Field>
      </div>

      {/* Right: colour and cover */}
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-xs text-zinc-400">Farbe</span>
          <div className="flex h-28 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
            <Palette size={22} className="text-zinc-700" />
          </div>
          <div className="mt-2 space-y-2">
            <button className="w-full rounded-md border border-zinc-800 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Auswählen</button>
            <button className="w-full rounded-md border border-zinc-800 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800">Leeren</button>
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs text-zinc-400">Icon</span>
          <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-gradient-to-br from-amber-700 to-zinc-900">
            <ImageIcon size={22} className="text-amber-200/70" />
          </div>
          <div className="mt-2 space-y-2">
            <button className="w-full rounded-md border border-zinc-800 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Auswählen</button>
            <button className="w-full rounded-md border border-zinc-800 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800">Leeren</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

// Tick spacing shrinks as we zoom in, so the axis stays readable instead of
// keeping a fixed 10s grid that would turn into a wall of labels at 16x.
const tickIntervalFor = (dur, zoomLevel) => {
  const targetTickCount = 12 * zoomLevel;
  const rawInterval = dur / targetTickCount;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= rawInterval) ?? steps[steps.length - 1];
};

// wavesurfer's own colours, per DESIGN.md: zinc-600 for the un-played part,
// orange-500 for the played part (progress).
const WAVE_COLOR = "#52525b"; // zinc-600
const PROGRESS_COLOR = "#f97316"; // orange-500
const BASE_PX_PER_SEC = 40; // zoomLevel 1 baseline; wavesurfer's minPxPerSec scales from here

function CueEditorTab({ item, updateCue }) {
  const dur = Number(item.duration) || 1;
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [volume, setVolume] = useState(0.7);
  const [audioState, setAudioState] = useState("loading"); // "loading" | "ready" | "unavailable"

  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const waveformContainerRef = useRef(null);
  const durRef = useRef(dur);
  durRef.current = dur;

  const cursorPct = (cursor / dur) * 100;
  const hookStart = (fromStorage(item.cue.hookIn ?? 0) / dur) * 100;
  const hookEnd = (fromStorage(item.cue.hookOut ?? 0) / dur) * 100;

  const cueVal = (key) => {
    const raw = item.cue?.[key];
    return raw != null && raw !== "" ? fromStorage(Number(raw)) : null;
  };
  const cueInVal = cueVal("cueIn") ?? 0;
  const cueOutVal = cueVal("cueOut");
  const fadeInEnd = cueVal("fadeIn");
  const fadeOutStart = cueVal("fadeOut");
  const fadeOutEnd = cueVal("fadeEnd") ?? cueOutVal ?? dur;
  const loopInVal = cueVal("loopIn");
  const loopOutVal = cueVal("loopOut");

  const pctOf = (sec) => (sec / dur) * 100;

  // Marker whose drag currently hangs below the waveform, i.e. would delete
  // the cue point on release. Drives the visual "about to delete" feedback.
  const [dragBelowKey, setDragBelowKey] = useState(null);
  const dragBelowRef = useRef(null);

  // Drags a cue marker on the waveform: mousedown starts a global
  // mousemove/mouseup pair that computes the percentage relative to the
  // waveform container width and writes it live via updateCue. Dragging more
  // than 24px below the waveform's bottom edge deletes the marker on release
  // instead of repositioning it.
  const beginMarkerDrag = (e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const onMove = (ev) => {
      const waveRect = waveformRef.current?.getBoundingClientRect();
      if (waveRect && ev.clientY > waveRect.bottom + 24) {
        dragBelowRef.current = key;
        setDragBelowKey(key);
        return;
      }
      dragBelowRef.current = null;
      setDragBelowKey(null);
      const rect = waveformContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1);
      const secs = Number((pct * durRef.current).toFixed(3));
      updateCue(key, toStorage(secs));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragBelowRef.current === key) clearCue(key);
      dragBelowRef.current = null;
      setDragBelowKey(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Mounts wavesurfer once per item. Real waveform + playback via the audio
  // stream endpoint; falls back to the synthetic bars below if the file
  // isn't available (404) or fails to decode.
  useEffect(() => {
    if (!waveformRef.current) return;
    setAudioState("loading");
    setPlaying(false);
    setCursor(0);

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      height: 128,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: PROGRESS_COLOR,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      minPxPerSec: BASE_PX_PER_SEC,
      fillParent: true,
      normalize: true,
      url: getAudioUrl(item.internalId),
    });
    wavesurferRef.current = ws;

    ws.on("ready", () => setAudioState("ready"));
    ws.on("error", () => setAudioState("unavailable"));
    ws.on("timeupdate", (t) => setCursor(t));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.internalId]);

  useEffect(() => {
    wavesurferRef.current?.setVolume(volume);
  }, [volume]);

  const audioReady = audioState === "ready";

  // All positions below are percentages of the full track, matching
  // wavesurfer's own zoomed/scrolled internal width.
  const ticks = useMemo(() => {
    const interval = tickIntervalFor(dur, zoomLevel);
    const out = [];
    for (let s = interval; s < dur; s += interval) out.push({ pct: (s / dur) * 100, label: mmss(s) });
    return out;
  }, [dur, zoomLevel]);

  const applyZoom = (level) => {
    setZoomLevel(level);
    if (audioReady) wavesurferRef.current?.zoom(BASE_PX_PER_SEC * level);
  };
  const zoomIn = () => applyZoom(Math.min(zoomLevel * 2, MAX_ZOOM));
  const zoomOut = () => applyZoom(Math.max(zoomLevel / 2, MIN_ZOOM));

  const togglePlay = () => {
    if (audioReady) wavesurferRef.current?.playPause();
  };

  const seekTo = (e) => {
    if (!audioReady) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      setCursor(Number((pct * dur).toFixed(3)));
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    wavesurferRef.current?.seekTo(pct);
  };

  const setMarker = (key) => updateCue(key, toStorage(cursor));
  const jumpTo = (key) => {
    const val = item.cue[key];
    if (val == null || val === "") return;
    const target = Math.min(Math.max(fromStorage(Number(val)), 0), dur);
    if (audioReady) {
      wavesurferRef.current?.setTime(target);
    } else {
      setCursor(target);
    }
  };
  const clearCue = (key) => updateCue(key, "");

  const { prioritised, rest } = useMemo(
    () => sortByCuePriority(CUE_POINTS, cuePriority),
    []
  );

  // Cue points that currently carry a valid, set value, positioned along the
  // waveform. Sorted by position so nearby markers can be staggered below.
  const cueMarkers = useMemo(() => {
    const MIN_GAP_PCT = 4; // labels closer than this get bumped to the next row
    const active = CUE_POINTS
      .map((p) => ({ point: p, raw: item.cue[p.key] }))
      .filter(({ raw }) => raw != null && raw !== "" && isValidCueValue(raw, item.duration))
      .map(({ point, raw }) => ({
        point,
        pct: (fromStorage(Number(raw)) / dur) * 100,
      }))
      .sort((a, b) => a.pct - b.pct);

    let lastPct = -Infinity;
    let row = 0;
    return active.map((m) => {
      row = m.pct - lastPct < MIN_GAP_PCT ? row + 1 : 0;
      lastPct = m.pct;
      return { ...m, row: row % 3 };
    });
  }, [item.cue, item.duration, dur]);

  return (
    <div className="space-y-5">
      {/* Waveform */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <div ref={waveformContainerRef} className="relative pt-11">
          {/* cue point markers: draggable vertical line + staggered label, own colour per point */}
          {cueMarkers.map(({ point, pct, row }) => (
            <div
              key={point.key}
              onMouseDown={(e) => beginMarkerDrag(e, point.key)}
              className={`absolute bottom-4 top-0 z-20 flex cursor-ew-resize justify-center transition-opacity ${
                dragBelowKey === point.key ? "opacity-30" : ""
              }`}
              style={{ left: `${pct}%`, width: 12, marginLeft: -6 }}
              title={`${point.label} verschieben — nach unten ziehen zum Löschen`}
            >
              <div className="h-full w-px" style={{ backgroundColor: point.color }} />
              <div
                className="pointer-events-none absolute -left-1 whitespace-nowrap rounded-sm px-1 text-[9px] font-medium leading-tight"
                style={{ top: `${row * 13}px`, color: point.color, backgroundColor: "rgba(9, 9, 11, 0.85)" }}
              >
                {dragBelowKey === point.key ? "Löschen" : point.label}
              </div>
            </div>
          ))}

          <div onClick={seekTo} className="relative h-32 cursor-pointer overflow-hidden">
            {/* hook overlay */}
            <div
              className="absolute top-0 bottom-0 z-10 bg-pink-500/15"
              style={{ left: `${hookStart}%`, width: `${Math.max(hookEnd - hookStart, 0)}%` }}
            />

            {/* fade in */}
            {fadeInEnd != null && fadeInEnd > cueInVal && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 bg-blue-500/15"
                style={{ left: `${pctOf(cueInVal)}%`, width: `${Math.max(pctOf(fadeInEnd) - pctOf(cueInVal), 0)}%` }}
              />
            )}
            {/* fade out */}
            {fadeOutStart != null && fadeOutEnd > fadeOutStart && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 bg-blue-500/15"
                style={{ left: `${pctOf(fadeOutStart)}%`, width: `${Math.max(pctOf(fadeOutEnd) - pctOf(fadeOutStart), 0)}%` }}
              />
            )}
            {/* loop */}
            {loopInVal != null && loopOutVal != null && loopOutVal > loopInVal && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 bg-orange-500/15"
                style={{ left: `${pctOf(loopInVal)}%`, width: `${Math.max(pctOf(loopOutVal) - pctOf(loopInVal), 0)}%` }}
              />
            )}

            {/* real waveform, mounted by wavesurfer.js */}
            <div ref={waveformRef} className={`h-full w-full ${audioReady ? "" : "invisible"}`} />

            {/* synthetic fallback: shown while loading, or when the audio isn't available */}
            {!audioReady && (
              <div className="absolute inset-0 flex items-center gap-[1px]">
                {WAVE_BARS.map((h, i) => {
                  const pct = (i / WAVE_BARS.length) * 100;
                  const inHook = pct >= hookStart && pct <= hookEnd;
                  const played = pct <= cursorPct;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{ height: `${h}%`, backgroundColor: inHook ? "#ec4899" : played ? PROGRESS_COLOR : WAVE_COLOR }}
                    />
                  );
                })}
                {/* cursor, only needed for the fallback: wavesurfer draws its own */}
                <div className="absolute top-0 bottom-0 z-30 w-px bg-orange-500" style={{ left: `${cursorPct}%` }}>
                  <div className="absolute -top-0.5 -left-[13px] rounded bg-orange-500 px-1 text-[9px] font-medium text-zinc-950">
                    {formatTimecode(cursor)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* timeline */}
          <div className="relative mt-1 h-4 text-[10px] text-zinc-600">
            {ticks.map((t, i) => (
              <span key={i} className="absolute -translate-x-1/2" style={{ left: `${t.pct}%` }}>{t.label}</span>
            ))}
          </div>
        </div>

        {audioState === "loading" && (
          <div className="mt-1 text-xs text-zinc-600">Lade Audio…</div>
        )}
        {audioState === "unavailable" && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600">
            <AlertTriangle size={12} /> Audio nicht verfügbar — synthetische Wellenform als Platzhalter
          </div>
        )}

        {/* transport */}
        <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={!audioReady}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <Volume2 size={15} className="text-zinc-500" />
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="h-1 w-24 accent-orange-500"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut} disabled={zoomLevel <= MIN_ZOOM}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Verkleinern"
            >
              <ZoomOut size={15} />
            </button>
            <button
              onClick={zoomIn} disabled={zoomLevel >= MAX_ZOOM}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent"
              title="Vergrößern"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={() => applyZoom(1)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800"
              title="Zoom zurücksetzen"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Cue point cards, priority points first */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {prioritised.map((p) => (
          <CueCard
            key={p.key} point={p}
            value={item.cue[p.key] == null ? null : fromStorage(item.cue[p.key])}
            duration={item.duration}
            onChange={updateCue} onSetMarker={setMarker} onJump={jumpTo} onClear={clearCue}
          />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-zinc-600">Weitere Marker</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {rest.map((p) => (
              <CueCard
                key={p.key} point={p}
                value={item.cue[p.key] == null ? null : fromStorage(item.cue[p.key])}
                duration={item.duration}
                onChange={updateCue} onSetMarker={setMarker} onJump={jumpTo} onClear={clearCue}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Checkbox styled to match the design system's input language rather than
// the browser default (which doesn't take zinc/orange theming well).
function Checkbox({ checked, onChange }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
        checked ? "border-orange-500 bg-orange-500" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-zinc-950" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
        </svg>
      )}
    </button>
  );
}

// The value input for one predefined attribute, switched on its definition's
// type. `value` and `onChange(val)` always speak the attribute's native
// value type (string, number, boolean, or string[] for multiselect).
function AttributeValueInput({ def, value, onChange }) {
  switch (def.type) {
    case "textarea":
      return (
        <textarea
          rows={3}
          className={`${inputClass} resize-none`}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className={inputClass}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      );
    case "checkbox":
      return <Checkbox checked={!!value} onChange={onChange} />;
    case "select":
      return (
        <select className={inputClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(def.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      const toggle = (opt) =>
        onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
      return (
        <div className="flex flex-wrap gap-2">
          {(def.options ?? []).map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-orange-500 bg-orange-500/15 text-orange-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    case "text":
    default:
      return <input className={inputClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

function AttributesTab({ item, setItem }) {
  const [definitions, setDefinitions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAttributeDefinitions()
      .then((defs) => { if (!cancelled) setDefinitions(defs); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const setAttr = (key, val) =>
    setItem((prev) => ({ ...prev, attributes: { ...prev.attributes, [key]: val } }));

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500">
        <AlertTriangle size={14} />
        <span>Attribut-Definitionen konnten nicht geladen werden: {error}</span>
      </div>
    );
  }

  if (!definitions) {
    return <div className="text-sm text-zinc-600">Lade Attribute…</div>;
  }

  return (
    <div className="max-w-2xl space-y-3">
      {definitions.map((def) => (
        <div key={def.key} className="flex items-start gap-3">
          <div className="w-40 shrink-0 pt-2 text-sm text-zinc-400">{def.label}</div>
          <div className="flex-1">
            <AttributeValueInput
              def={def}
              value={item.attributes?.[def.key]}
              onChange={(val) => setAttr(def.key, val)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PlaybackTab({ item, update }) {
  const [normalizing, setNormalizing] = useState(false);
  const playback = item.playback;
  const updatePlayback = (key, val) => update("playback", { ...playback, [key]: val });

  const handleNormalize = async () => {
    setNormalizing(true);
    try {
      const { gainDb, targetLufs } = await normalizeAudio(item.internalId);
      update("playback", { ...playback, gainDb, normalizedLufs: targetLufs });
    } finally {
      setNormalizing(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Lautstärke und Gain */}
      <div className="space-y-4">
        <div className="text-[11px] uppercase tracking-wide text-zinc-600">Lautstärke und Gain</div>

        <Field label="Gain (dB)">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={-12}
              max={12}
              step={0.1}
              value={playback.gainDb}
              onChange={(e) => updatePlayback("gainDb", Number(e.target.value))}
              className="w-full accent-orange-500"
            />
            <span className="w-16 shrink-0 text-right text-sm tabular-nums text-zinc-300">
              {playback.gainDb > 0 ? "+" : ""}{playback.gainDb.toFixed(1)} dB
            </span>
          </div>
        </Field>

        <div className="flex items-center gap-3">
          <button
            onClick={handleNormalize}
            disabled={normalizing}
            className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            <Volume2 size={14} />
            {normalizing ? "Normalisiert…" : "Normalisieren"}
          </button>
          {playback.normalizedLufs != null && !normalizing && (
            <span className="text-xs text-zinc-500">
              Normalisiert auf {playback.normalizedLufs} LUFS
            </span>
          )}
        </div>
      </div>

      {/* Abspielverhalten */}
      <div className="space-y-4">
        <div className="text-[11px] uppercase tracking-wide text-zinc-600">Abspielverhalten</div>

        <Field label="Segue-Modus" className="max-w-xs">
          <select
            className={inputClass}
            value={playback.segueMode}
            onChange={(e) => updatePlayback("segueMode", e.target.value)}
          >
            {SEGUE_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </Field>

        <p className="text-xs text-zinc-600">
          Fade In/Out und Loop werden über den Cue-Editor gesteuert.
        </p>
      </div>
    </div>
  );
}

function HistoryTab({ itemId }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHistory(null);
    getItemHistory(itemId)
      .then((data) => {
        if (cancelled) return;
        setHistory(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [itemId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-sm text-zinc-600">
        Lade Verlauf…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-red-500">
        <AlertTriangle size={20} />
        <span className="text-sm">Verlauf konnte nicht geladen werden: {error}</span>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-sm text-zinc-600">
        Noch nicht gelaufen.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-zinc-800">
          <th className="px-4 py-3 text-left font-medium text-zinc-400">Datum/Uhrzeit</th>
          <th className="px-4 py-3 text-left font-medium text-zinc-400">Sendung</th>
          <th className="px-4 py-3 text-left font-medium text-zinc-400">Moderator</th>
        </tr>
      </thead>
      <tbody>
        {history.map((entry, i) => (
          <tr key={i} className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-900/50">
            <td className="px-4 py-3 text-zinc-300">{formatDate(entry.playedAt)}</td>
            <td className="px-4 py-3 text-zinc-400">{entry.show || "-"}</td>
            <td className="px-4 py-3 text-zinc-400">{entry.moderator || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlaceholderTab({ icon: Icon, title, note }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon size={28} className="mb-3 text-zinc-700" />
      <div className="text-sm text-zinc-400">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-zinc-600">{note}</div>
    </div>
  );
}

// --- Main ---

const TABS = [
  { key: "general", label: "Allgemein", icon: LayoutList },
  { key: "playback", label: "Wiedergabe", icon: Play },
  { key: "attributes", label: "Attribute", icon: SlidersHorizontal },
  { key: "scheduling", label: "Sendeplanung", icon: Clock },
  { key: "history", label: "Verlauf", icon: History },
  { key: "cue", label: "Cue-Editor", icon: Pencil },
];

export default function ItemEditor({ internalId, playlistContext, onBack, onNavigate }) {
  const [globalItem, setGlobalItem] = useState(null); // untouched DB record, for diffing overrides
  const [item, setItem] = useState(null); // edited, display-merged (global + overrides when in playlist context)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("general");
  const [savingScope, setSavingScope] = useState(null); // "hour" | "database" | null
  const [saveError, setSaveError] = useState(null);
  const [hasOverrides, setHasOverrides] = useState(false);

  const saving = savingScope != null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItem(null);
    setGlobalItem(null);
    setHasOverrides(false);

    const load = async () => {
      const data = await getItemById(internalId);
      if (cancelled) return;
      let overrides = null;
      if (playlistContext) {
        const playlist = await getPlaylistById(playlistContext.playlistId);
        const entry = playlist.entries.find((e) => e.position === playlistContext.position);
        overrides = entry?.overrides ?? null;
      }
      if (cancelled) return;
      setGlobalItem(data);
      setItem(applyOverrides(data, overrides));
      setHasOverrides(!!overrides && Object.keys(overrides).length > 0);
    };

    load()
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [internalId, playlistContext]);

  const update = (key, val) => setItem((prev) => ({ ...prev, [key]: val }));
  // Keeps the raw input while the user is typing (so "14" on the way to
  // "140.5" doesn't get clobbered by an early Number() cast); values are
  // normalised through toStorage()/Number() right before saving.
  const updateCue = (key, val) =>
    setItem((prev) => ({ ...prev, cue: { ...prev.cue, [key]: val === "" ? null : val } }));

  const normalisedCue = () => {
    const out = {};
    for (const [key, val] of Object.entries(item.cue)) {
      out[key] = isValidCueValue(val, item.duration) && val !== null && val !== ""
        ? toStorage(Number(val))
        : null;
    }
    return out;
  };

  // "In Datenbank speichern": writes the edited item globally, exactly as
  // before. Available from both the Elemente list and the playlist (where
  // it intentionally propagates the change to every hour that plays this
  // item, unlike the hour-scoped save below). Whatever was displayed is now
  // the database value, so any local-only overrides this slot had are gone
  // — cleared on the server too, so the two stay in sync.
  const handleSaveToDatabase = async () => {
    setSavingScope("database");
    setSaveError(null);
    try {
      const saved = await updateItem(internalId, { ...item, cue: normalisedCue() });
      if (playlistContext && hasOverrides) {
        await savePlaylistItemOverrides(playlistContext.playlistId, playlistContext.position, {});
      }
      setGlobalItem(saved);
      setItem(saved);
      setHasOverrides(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingScope(null);
    }
  };

  // "Für diese Stunde speichern": diffs the edited (cue/attributes only)
  // fields against the untouched global item and writes just that diff as
  // this playlist entry's `overrides` — a "volatile" change, per mAirList,
  // that never touches the database and has no effect on any other hour.
  const handleSaveToHour = async () => {
    if (!playlistContext) return;
    setSavingScope("hour");
    setSaveError(null);
    try {
      const edited = { ...item, cue: normalisedCue() };
      const overrides = diffOverrides(globalItem, edited);
      await savePlaylistItemOverrides(playlistContext.playlistId, playlistContext.position, overrides);
      setHasOverrides(Object.keys(overrides).length > 0);
      setItem(applyOverrides(globalItem, overrides));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingScope(null);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      {/* Nav sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
        <div className="mb-6 px-2 text-sm font-semibold tracking-wide">
          <span className="text-zinc-100">mAirList</span>{" "}
          <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">DB</span>
        </div>
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Playout</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={LayoutDashboard} label="Übersicht" />
          <NavItem icon={Settings} label="Einstellungen" />
        </nav>
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Datenbank</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={Database} label="Elemente" active onClick={onBack} />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" onClick={() => onNavigate?.("playlist")} />
        </nav>
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" onClick={() => onNavigate?.("users")} />
          <NavItem icon={Tag} label="Gruppen" onClick={() => onNavigate?.("groups")} />
          <NavItem icon={ScrollText} label="Logs" />
        </nav>
      </aside>

      {/* Tab column */}
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/50 p-3">
        <div className="space-y-0.5">
          {TABS.map((t) => (
            <TabItem key={t.key} icon={t.icon} label={t.label} active={tab === t.key} onClick={() => setTab(t.key)} />
          ))}
        </div>
      </aside>

      {/* Content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <Database size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Item-Verwaltung</h1>
          </div>
          <button className="flex h-9 w-9 items-center justify-center rounded-md border border-green-700/60 text-green-500 hover:bg-green-600/10">
            <RefreshCw size={16} />
          </button>
        </header>

        {/* Sub toolbar: back + title + save */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
            <ChevronLeft size={16} /> {playlistContext ? "Zurück zur Playlist" : "Zurück zur Liste"}
          </button>
          <div className="flex items-center gap-2 truncate px-4 text-sm text-zinc-500">
            {item && (
              <>{item.title}{item.artist ? `  ·  ${item.artist}` : ""}  ·  ID {item.internalId}</>
            )}
            {hasOverrides && (
              <span
                className="flex items-center gap-1 rounded border border-orange-600/40 bg-orange-500/10 px-1.5 py-0.5 text-[11px] font-medium text-orange-400"
                title="Diese Ansicht zeigt lokale Änderungen für diese Stunde, nicht den Datenbank-Stand"
              >
                <CircleDot size={9} /> Lokal geändert
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {playlistContext && (
              <button
                onClick={handleSaveToHour} disabled={!item || saving}
                className="flex items-center gap-2 rounded-md border border-orange-600/60 px-3 py-2 text-sm font-medium text-orange-400 hover:bg-orange-600/10 disabled:opacity-50"
                title="Speichert Cue-Punkte und Attribute nur für diesen Playlist-Eintrag, betrifft keine andere Stunde"
              >
                <CircleDot size={15} /> {savingScope === "hour" ? "Speichert…" : "Für diese Stunde speichern"}
              </button>
            )}
            <button
              onClick={handleSaveToDatabase} disabled={!item || saving}
              className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              title={playlistContext ? "Schreibt die Änderung global in die Datenbank, betrifft alle Stunden mit diesem Element" : undefined}
            >
              <DatabaseIcon size={15} /> {savingScope === "database" ? "Speichert…" : "In Datenbank speichern"}
            </button>
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-red-500/5 px-6 py-2.5 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Element konnte nicht gespeichert werden: {saveError}</span>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-sm text-zinc-600">
              Lade Element…
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-red-500">
              <AlertTriangle size={20} />
              <span className="text-sm">Element konnte nicht geladen werden: {error}</span>
            </div>
          )}
          {!loading && !error && item && (
            <>
              {tab === "general" && <GeneralTab item={item} update={update} />}
              {tab === "playback" && <PlaybackTab item={item} update={update} />}
              {tab === "attributes" && <AttributesTab item={item} setItem={setItem} />}
              {tab === "scheduling" && <PlaceholderTab icon={Clock} title="Sendeplanung" note="Rotationen, Zeitfenster und Scheduling Regeln. Kommt in einer späteren Phase." />}
              {tab === "history" && <HistoryTab itemId={item.id} />}
              {tab === "cue" && <CueEditorTab item={item} updateCue={updateCue} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
