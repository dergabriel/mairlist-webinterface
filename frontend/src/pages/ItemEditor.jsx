import { useState, useMemo, useEffect, useRef } from "react";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic, Users, Tag, ScrollText,
  RefreshCw, ChevronLeft, Save, LayoutList, Play, Pause, SlidersHorizontal,
  Clock, History, Pencil, Volume2, ZoomIn, ZoomOut, Bookmark, Trash2, Plus,
  Palette, Image as ImageIcon, AlertTriangle,
} from "lucide-react";
import { getItemById, updateItem } from "../lib/api";

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

// Deterministic pseudo waveform, so it never flickers between renders.
const WAVE_BARS = Array.from({ length: 200 }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const r = seed - Math.floor(seed);
  const envelope = Math.sin((i / 200) * Math.PI); // quieter at start and end
  return 12 + r * 80 * (0.5 + envelope * 0.5);
});

// --- Small components ---

function NavItem({ icon: Icon, label, active }) {
  return (
    <button
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

function CueEditorTab({ item, updateCue }) {
  const [playing, setPlaying] = useState(false);
  const dur = Number(item.duration) || 1;
  const [cursor, setCursor] = useState(Math.min(2.36, dur));
  const [zoomLevel, setZoomLevel] = useState(1);
  const viewportRef = useRef(null);
  const cursorPct = (cursor / dur) * 100;
  const hookStart = (fromStorage(item.cue.hookIn ?? 0) / dur) * 100;
  const hookEnd = (fromStorage(item.cue.hookOut ?? 0) / dur) * 100;

  // All positions below are percentages of the zoomed inner track, not the
  // viewport, so they stay correct regardless of zoomLevel.
  const ticks = useMemo(() => {
    const interval = tickIntervalFor(dur, zoomLevel);
    const out = [];
    for (let s = interval; s < dur; s += interval) out.push({ pct: (s / dur) * 100, label: mmss(s) });
    return out;
  }, [dur, zoomLevel]);

  const centerViewportOn = (pct) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const trackWidth = viewport.scrollWidth;
    const target = (pct / 100) * trackWidth - viewport.clientWidth / 2;
    viewport.scrollLeft = Math.max(0, Math.min(target, trackWidth - viewport.clientWidth));
  };

  const zoomIn = () => {
    setZoomLevel((z) => {
      const next = Math.min(z * 2, MAX_ZOOM);
      requestAnimationFrame(() => centerViewportOn(cursorPct));
      return next;
    });
  };
  const zoomOut = () => {
    setZoomLevel((z) => Math.max(z / 2, MIN_ZOOM));
  };

  const seekTo = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setCursor(Number((pct * dur).toFixed(3)));
  };

  const setMarker = (key) => updateCue(key, toStorage(cursor));
  const jumpTo = (key) => {
    const val = item.cue[key];
    if (val == null || val === "") return;
    setCursor(Math.min(Math.max(fromStorage(Number(val)), 0), dur));
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
        {/* scrollable viewport: fixed visible width, horizontal scroll once zoomed in */}
        <div ref={viewportRef} className="overflow-x-auto overflow-y-hidden">
          {/* zoomed track: grows to zoomLevel * 100% so bars widen and time positions (in %) stay correct */}
          <div
            onClick={seekTo}
            className="relative cursor-pointer pt-11"
            style={{ width: `${zoomLevel * 100}%` }}
          >
            {/* cue point markers: vertical line + staggered label, own colour per point */}
            {cueMarkers.map(({ point, pct, row }) => (
              <div
                key={point.key}
                className="absolute bottom-4 z-20 w-px"
                style={{ left: `${pct}%`, top: `${row * 13}px`, backgroundColor: point.color }}
              >
                <div
                  className="absolute -left-1 top-0 -translate-y-full whitespace-nowrap rounded-sm px-1 text-[9px] font-medium leading-tight"
                  style={{ color: point.color, backgroundColor: "rgba(9, 9, 11, 0.85)" }}
                >
                  {point.label}
                </div>
              </div>
            ))}

            <div className="relative flex h-32 items-center gap-[1px] overflow-hidden">
              {/* hook overlay */}
              <div
                className="absolute top-0 bottom-0 bg-pink-500/15"
                style={{ left: `${hookStart}%`, width: `${Math.max(hookEnd - hookStart, 0)}%` }}
              />
              {/* cursor */}
              <div className="absolute top-0 bottom-0 z-30 w-px bg-orange-500" style={{ left: `${cursorPct}%` }}>
                <div className="absolute -top-0.5 -left-[13px] rounded bg-orange-500 px-1 text-[9px] font-medium text-zinc-950">
                  {formatTimecode(cursor)}
                </div>
              </div>
              {WAVE_BARS.map((h, i) => {
                const pct = (i / WAVE_BARS.length) * 100;
                const inHook = pct >= hookStart && pct <= hookEnd;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{ height: `${h}%`, backgroundColor: inHook ? "#ec4899" : "#52525b" }}
                  />
                );
              })}
            </div>

            {/* timeline: same zoomed track, so ticks line up with the waveform under them */}
            <div className="relative mt-1 h-4 text-[10px] text-zinc-600">
              {ticks.map((t, i) => (
                <span key={i} className="absolute -translate-x-1/2" style={{ left: `${t.pct}%` }}>{t.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* transport */}
        <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2">
          <div className="flex items-center gap-3">
            <button onClick={() => setPlaying((p) => !p)} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <Volume2 size={15} className="text-zinc-500" />
            <input type="range" className="h-1 w-24 accent-orange-500" defaultValue={70} />
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
              onClick={() => setZoomLevel(1)}
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
          <div className="border-t border-zinc-800" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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

function AttributesTab({ item, setItem }) {
  const entries = Object.entries(item.attributes);
  const setAttr = (key, val) => setItem((prev) => ({ ...prev, attributes: { ...prev.attributes, [key]: val } }));
  const removeAttr = (key) => setItem((prev) => {
    const next = { ...prev.attributes }; delete next[key]; return { ...prev, attributes: next };
  });
  return (
    <div className="max-w-2xl space-y-3">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-3">
          <div className="w-40 shrink-0 text-sm text-zinc-400">{key}</div>
          <input className={inputClass} value={val} onChange={(e) => setAttr(key, e.target.value)} />
          <button onClick={() => removeAttr(key)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
        <Plus size={15} /> Attribut hinzufügen
      </button>
    </div>
  );
}

function PlaybackTab() {
  return (
    <div className="max-w-2xl space-y-5">
      <Field label="Gain (dB)">
        <input type="range" min={-12} max={12} defaultValue={0} className="w-full accent-orange-500" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Fade In (s)"><input className={inputClass} defaultValue="0" /></Field>
        <Field label="Fade Out (s)"><input className={inputClass} defaultValue="0" /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" className="h-4 w-4 rounded accent-orange-500" /> Wiederholen (Loop)
      </label>
    </div>
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

export default function ItemEditor({ internalId, onBack }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItem(null);
    getItemById(internalId)
      .then((data) => {
        if (cancelled) return;
        setItem(data);
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
  }, [internalId]);

  const update = (key, val) => setItem((prev) => ({ ...prev, [key]: val }));
  // Keeps the raw input while the user is typing (so "14" on the way to
  // "140.5" doesn't get clobbered by an early Number() cast); values are
  // normalised through toStorage()/Number() right before saving.
  const updateCue = (key, val) =>
    setItem((prev) => ({ ...prev, cue: { ...prev.cue, [key]: val === "" ? null : val } }));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const normalisedCue = {};
      for (const [key, val] of Object.entries(item.cue)) {
        normalisedCue[key] = isValidCueValue(val, item.duration) && val !== null && val !== ""
          ? toStorage(Number(val))
          : null;
      }
      const saved = await updateItem(internalId, { ...item, cue: normalisedCue });
      setItem(saved);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
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
          <NavItem icon={Database} label="Elemente" active />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" />
        </nav>
        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" />
          <NavItem icon={Tag} label="Gruppen" />
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
            <ChevronLeft size={16} /> Zurück zur Liste
          </button>
          <div className="truncate px-4 text-sm text-zinc-500">
            {item && (
              <>{item.title}{item.artist ? `  ·  ${item.artist}` : ""}  ·  ID {item.internalId}</>
            )}
          </div>
          <button
            onClick={handleSave} disabled={!item || saving}
            className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            <Save size={15} /> {saving ? "Speichert…" : "Speichern"}
          </button>
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
              {tab === "playback" && <PlaybackTab />}
              {tab === "attributes" && <AttributesTab item={item} setItem={setItem} />}
              {tab === "scheduling" && <PlaceholderTab icon={Clock} title="Sendeplanung" note="Rotationen, Zeitfenster und Scheduling Regeln. Kommt in einer späteren Phase." />}
              {tab === "history" && <PlaceholderTab icon={History} title="Verlauf" note="Zeigt, wann dieses Item gelaufen ist. Wird aus den Broadcast Logs gespeist." />}
              {tab === "cue" && <CueEditorTab item={item} updateCue={updateCue} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
