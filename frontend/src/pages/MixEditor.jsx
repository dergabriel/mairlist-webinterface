import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic, Users, Tag, ScrollText,
  ChevronLeft, Sliders, Play, Pause, Square, Focus, Save, CircleDot,
  Database as DatabaseIcon, AlertTriangle,
} from "lucide-react";
import { getAudioUrl, savePlaylistItemOverrides, updateItem } from "../lib/api";

// --- Shared nav (mirrors Playlist/ItemEditor) ---

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

// --- Cue point catalogue (mirrors server/data/mockData.js CUE_POINTS) ---

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

// --- Helpers ---

const mmss = (sec) => {
  if (sec == null || Number.isNaN(sec)) return "0:00";
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const WAVE_COLOR = "#52525b"; // zinc-600
const PROGRESS_COLOR = "#f97316"; // orange-500
const PX_PER_SEC = 32;
const TRACK_HEIGHT = 120;
const LABEL_WIDTH = 208;
const FOCUS_WINDOW = 10; // seconds shown on either side of a transition in focus mode

// Tick spacing shrinks as we zoom in, mirroring ItemEditor's cue timeline.
const tickIntervalFor = (totalSec, pxPerSec) => {
  const targetPxPerTick = 80;
  const rawInterval = targetPxPerTick / pxPerSec;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= rawInterval) ?? steps[steps.length - 1];
};

// Deterministic synthetic waveform bars, keyed off the item id so the same
// item always renders the same fallback shape.
function syntheticBars(seed, count = 160) {
  let h = 0;
  for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    const x = Math.sin((h + i) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    const envelope = Math.sin((i / count) * Math.PI);
    return 10 + r * 70 * (0.5 + envelope * 0.5);
  });
}

// Resolves the cue-in / start-next points a track actually uses for mixing.
// startNext defaults to the track's own duration (i.e. no overlap: the next
// track only starts once this one fully ends).
function trackCues(item) {
  const duration = Number(item.duration) || 0;
  const cueIn = Number(item.cue?.cueIn) || 0;
  const startNextRaw = item.cue?.startNext;
  const startNext = startNextRaw == null || startNextRaw === "" ? duration : Number(startNextRaw);
  return { duration, cueIn, startNext };
}

// Lays every selected item on one shared timeline. Track i's audible start
// is 0 for the first item, and for every later item it's the running
// timeline position at which the previous item hands off (its startNext),
// shifted so the previous item's own cueIn lines up at its start offset.
function computeLayout(items) {
  let cursor = 0;
  const tracks = items.map((item, i) => {
    const { duration, cueIn, startNext } = trackCues(item);
    const start = i === 0 ? 0 : cursor;
    const playLength = Math.max(duration - cueIn, 0);
    const end = start + playLength;
    const handoff = start + Math.max(startNext - cueIn, 0);
    cursor = handoff;
    return { item, duration, cueIn, startNext, start, end, handoff };
  });
  const totalWidth = tracks.length ? Math.max(...tracks.map((t) => t.end)) : 0;
  return { tracks, totalWidth };
}

// --- Fixed label column entry ---

function TrackLabel({ track, focused, onFocus }) {
  const { item } = track;
  return (
    <button
      onClick={onFocus}
      style={{ height: TRACK_HEIGHT }}
      className={`flex w-52 shrink-0 flex-col justify-center border-b border-r px-3 py-1.5 text-left transition-colors ${
        focused ? "border-r-orange-500 bg-zinc-800/60 border-b-zinc-800" : "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/40"
      }`}
    >
      <div className="truncate text-sm text-zinc-100" title={item.title}>{item.title || "–"}</div>
      <div className="truncate text-xs text-zinc-500" title={item.artist}>{item.artist || "-"}</div>
    </button>
  );
}

// Cue points shown as markers on each track's waveform — the ones a
// moderator actually cares about when lining up a transition, mirroring
// ItemEditor's DEFAULT_CUE_PRIORITY but trimmed to what fits a compact lane.
const TRACK_MARKER_KEYS = ["cueIn", "fadeIn", "ramp1", "fadeOut", "cueOut", "startNext", "outro"];
const TRACK_MARKERS = CUE_POINTS.filter((p) => TRACK_MARKER_KEYS.includes(p.key));

// --- Single waveform track lane ---

function TrackRow({ track, index, registerWs, onSeekPreview, onFocus, pxPerSec, overlapStartPx, overlapEndPx }) {
  const waveformRef = useRef(null);
  const wsRef = useRef(null);
  const [audioState, setAudioState] = useState("loading");
  const { item, duration, start } = track;
  const bars = useMemo(() => syntheticBars(item.internalId), [item.internalId]);

  const markers = useMemo(() => {
    const cue = item.cue || {};
    return TRACK_MARKERS
      .map((p) => ({ point: p, raw: cue[p.key] }))
      .filter(({ raw }) => raw != null && raw !== "")
      .map(({ point, raw }) => ({ point, pct: (Number(raw) / Math.max(duration, 1)) * 100 }));
  }, [item.cue, duration]);

  useEffect(() => {
    if (!waveformRef.current) return;
    setAudioState("loading");

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      height: TRACK_HEIGHT - 8,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: PROGRESS_COLOR,
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      minPxPerSec: pxPerSec,
      fillParent: false,
      normalize: true,
      interact: false,
      url: getAudioUrl(item.internalId),
    });
    wsRef.current = ws;
    registerWs(index, ws);

    ws.on("ready", () => setAudioState("ready"));
    ws.on("error", () => setAudioState("unavailable"));

    return () => {
      registerWs(index, null);
      ws.destroy();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.internalId, pxPerSec]);

  const widthPx = Math.max(duration, 1) * pxPerSec;
  const leftPx = start * pxPerSec;
  const audioReady = audioState === "ready";

  return (
    <div
      onMouseDown={onFocus}
      className="relative border-b border-zinc-800"
      style={{ height: TRACK_HEIGHT }}
    >
      {/* overlap highlight with the neighbouring track(s) */}
      {overlapStartPx != null && (
        <div
          className="absolute top-0 z-[5] h-full bg-orange-500/10"
          style={{ left: overlapStartPx, width: Math.max(overlapEndPx - overlapStartPx, 0) }}
        />
      )}

      {audioState === "unavailable" && (
        <div
          className="absolute top-1 z-10 flex items-center gap-1 text-[10px] text-zinc-600"
          style={{ left: leftPx + 6 }}
        >
          <AlertTriangle size={10} /> synthetisch
        </div>
      )}
      <div
        className="absolute top-1 rounded-md border border-zinc-800 bg-zinc-900/40"
        style={{ left: leftPx, width: widthPx, height: TRACK_HEIGHT - 8 }}
      >
        <div
          ref={waveformRef}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
            onSeekPreview(index, pct * duration);
          }}
          className={`h-full w-full cursor-pointer ${audioReady ? "" : "invisible"}`}
        />
        {!audioReady && (
          <div className="absolute inset-0 flex items-center gap-[1px] px-0.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-full"
                style={{ height: `${h}%`, backgroundColor: WAVE_COLOR }}
              />
            ))}
          </div>
        )}

        {/* cue point markers: vertical line + label, own colour per point (mirrors ItemEditor's CueEditorTab) */}
        {markers.map(({ point, pct }) => (
          <div
            key={point.key}
            className="pointer-events-none absolute top-0 z-10 w-px"
            style={{ left: `${pct}%`, backgroundColor: point.color, height: "100%" }}
          >
            <div
              className="absolute -left-1 top-0 -translate-y-full whitespace-nowrap rounded-sm px-1 text-[9px] font-medium leading-tight"
              style={{ color: point.color, backgroundColor: "rgba(9, 9, 11, 0.85)" }}
            >
              {point.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Transition divider between two tracks, draggable, spans the full lane height ---

function TransitionDivider({ track, pxPerSec, laneHeight, onDrag, onFocus, focusActive }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startHandoff = useRef(0);

  const leftPx = track.handoff * pxPerSec;

  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    startX.current = e.clientX;
    startHandoff.current = track.handoff;

    const onMove = (ev) => {
      if (!dragging.current) return;
      const deltaSec = (ev.clientX - startX.current) / pxPerSec;
      onDrag(startHandoff.current + deltaSec);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="group pointer-events-auto absolute top-0 z-20 flex cursor-ew-resize items-start"
      style={{ left: leftPx - 4, width: 8, height: laneHeight }}
      onMouseDown={onMouseDown}
      title="Übergang verschieben"
    >
      <div className="mx-auto h-full w-px bg-orange-500 group-hover:w-0.5 group-hover:bg-orange-400" />
      <button
        onClick={(e) => { e.stopPropagation(); onFocus(); }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`absolute -top-6 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-md border transition-colors ${
          focusActive
            ? "border-orange-500 bg-orange-500 text-zinc-950"
            : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-orange-500 hover:text-orange-400"
        }`}
        title="Fokus-Modus: letzte/erste 10s abspielen"
      >
        <Focus size={11} />
      </button>
    </div>
  );
}

// --- Shared timeline ruler ---

function TimelineRuler({ totalWidth, pxPerSec }) {
  const ticks = useMemo(() => {
    const interval = tickIntervalFor(totalWidth, pxPerSec);
    const out = [];
    for (let s = 0; s <= totalWidth; s += interval) out.push({ left: s * pxPerSec, label: mmss(s) });
    return out;
  }, [totalWidth, pxPerSec]);

  return (
    <div className="relative h-6 border-b border-zinc-800" style={{ width: totalWidth * pxPerSec + 40 }}>
      {ticks.map((t, i) => (
        <div key={i} className="absolute top-0 h-full border-l border-zinc-800" style={{ left: t.left }}>
          <span className="ml-1 text-[10px] tabular-nums text-zinc-500">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Cue point chip strip for the focused track ---

function CueChipStrip({ track, onJump }) {
  if (!track) {
    return <div className="px-6 py-3 text-xs text-zinc-600">Spur wählen, um Cue-Punkte zu sehen.</div>;
  }
  const cue = track.item.cue || {};
  const set = CUE_POINTS.filter((p) => cue[p.key] != null && cue[p.key] !== "");

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 py-3">
      <span className="mr-1 truncate text-xs text-zinc-500" title={track.item.title}>
        {track.item.title}:
      </span>
      {set.length === 0 && <span className="text-xs text-zinc-600">Keine Cue-Punkte gesetzt.</span>}
      {set.map((p) => (
        <button
          key={p.key}
          onClick={() => onJump(p)}
          className="rounded px-2 py-1 text-[11px] font-medium text-zinc-950 transition-opacity hover:opacity-90"
          style={{ backgroundColor: p.color }}
          title={mmss(Number(cue[p.key]))}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// --- Main ---

export default function MixEditor({ context, onBack, onNavigate }) {
  const items = context?.items ?? [];
  const playlistId = context?.playlistId;

  // Local, editable copy of each item's cue-relevant fields (cueIn/startNext),
  // keyed by array index — independent of the read-only `items` from context.
  const [cueEdits, setCueEdits] = useState(() => items.map((it) => ({ ...trackCues(it) })));
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [focusTransition, setFocusTransition] = useState(null); // index of the transition, or null
  const [focusedTrack, setFocusedTrack] = useState(0); // index of the track shown in the cue chip strip
  const [savingScope, setSavingScope] = useState(null); // "hour" | "database" | null
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk] = useState(null);

  const wsRefs = useRef([]);
  const registerWs = useCallback((index, ws) => { wsRefs.current[index] = ws; }, []);

  const pxPerSec = PX_PER_SEC * zoom;

  // Build display items with edited cue values layered on top for the layout calc.
  const editedItems = useMemo(
    () => items.map((it, i) => ({
      ...it,
      cue: { ...it.cue, cueIn: cueEdits[i]?.cueIn, startNext: cueEdits[i]?.startNext },
    })),
    [items, cueEdits]
  );

  const { tracks, totalWidth } = useMemo(() => computeLayout(editedItems), [editedItems]);

  const updateHandoff = (trackIndex, newHandoff) => {
    setCueEdits((prev) => {
      const track = tracks[trackIndex];
      if (!track) return prev;
      const clamped = Math.min(Math.max(newHandoff, track.start), track.end);
      const newStartNext = clamped - track.start + track.cueIn;
      const next = [...prev];
      next[trackIndex] = { ...next[trackIndex], startNext: Math.max(newStartNext, 0) };
      return next;
    });
    setSaveOk(null);
  };

  const stopAll = useCallback(() => {
    wsRefs.current.forEach((ws) => ws?.pause());
    setPlaying(false);
  }, []);

  const playAll = useCallback(() => {
    setFocusTransition(null);
    tracks.forEach((t, i) => {
      const ws = wsRefs.current[i];
      if (!ws) return;
      const dur = ws.getDuration() || t.duration;
      ws.setTime(Math.min(t.cueIn, dur));
    });
    tracks.forEach((_, i) => wsRefs.current[i]?.play());
    setPlaying(true);
  }, [tracks]);

  const playFocus = useCallback((transitionIndex) => {
    const prev = tracks[transitionIndex];
    const next = tracks[transitionIndex + 1];
    if (!prev || !next) return;
    setFocusTransition(transitionIndex);

    const prevWs = wsRefs.current[transitionIndex];
    const nextWs = wsRefs.current[transitionIndex + 1];
    const prevStart = Math.max(prev.handoff - prev.start + prev.cueIn - FOCUS_WINDOW, prev.cueIn);
    const nextStart = next.cueIn;

    wsRefs.current.forEach((ws, i) => {
      if (i !== transitionIndex && i !== transitionIndex + 1) ws?.pause();
    });

    if (prevWs) {
      prevWs.setTime(prevStart);
      prevWs.play();
      setTimeout(() => prevWs.pause(), FOCUS_WINDOW * 1000);
    }
    const delayMs = Math.max((prev.handoff - (prev.start + prevStart - prev.cueIn)) * 1000, 0);
    if (nextWs) {
      nextWs.setTime(nextStart);
      setTimeout(() => nextWs.play(), delayMs);
      setTimeout(() => nextWs.pause(), delayMs + FOCUS_WINDOW * 1000);
    }
    setPlaying(true);
    setTimeout(() => setPlaying(false), delayMs + FOCUS_WINDOW * 1000);
  }, [tracks]);

  const onSeekPreview = (index, timeInTrack) => {
    setFocusedTrack(index);
    wsRefs.current[index]?.setTime(timeInTrack);
  };

  const jumpToCue = (point) => {
    const track = tracks[focusedTrack];
    if (!track) return;
    const val = track.item.cue?.[point.key];
    if (val == null || val === "") return;
    const target = Math.min(Math.max(Number(val), 0), track.duration);
    wsRefs.current[focusedTrack]?.setTime(target);
  };

  useEffect(() => () => stopAll(), [stopAll]);

  // --- Save ---

  const buildOverridesFor = (i) => {
    const edit = cueEdits[i];
    if (!edit) return null;
    const original = trackCues(items[i]);
    if (edit.startNext === original.startNext) return null;
    return { cue: { startNext: edit.startNext } };
  };

  const handleSaveHour = async () => {
    if (!playlistId) return;
    setSavingScope("hour");
    setSaveError(null);
    try {
      for (let i = 0; i < items.length; i++) {
        const overrides = buildOverridesFor(i);
        if (!overrides) continue;
        await savePlaylistItemOverrides(playlistId, items[i].position, overrides);
      }
      setSaveOk("hour");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingScope(null);
    }
  };

  const handleSaveDatabase = async () => {
    setSavingScope("database");
    setSaveError(null);
    try {
      for (let i = 0; i < items.length; i++) {
        const edit = cueEdits[i];
        const original = trackCues(items[i]);
        if (!edit || edit.startNext === original.startNext) continue;
        await updateItem(items[i].internalId, { cue: { ...items[i].cue, startNext: edit.startNext } });
      }
      setSaveOk("database");
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSavingScope(null);
    }
  };

  const saving = savingScope != null;
  const hasChanges = items.some((it, i) => {
    const edit = cueEdits[i];
    const original = trackCues(it);
    return edit && edit.startNext !== original.startNext;
  });

  const laneHeight = tracks.length * TRACK_HEIGHT;

  if (items.length < 2) {
    return (
      <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
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
            <NavItem icon={Database} label="Elemente" onClick={() => onNavigate?.("list")} />
            <NavItem icon={Copy} label="Vorlagen" />
            <NavItem icon={ListMusic} label="Playlist" active onClick={() => onNavigate?.("playlist")} />
          </nav>
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
          <nav className="space-y-0.5">
            <NavItem icon={Users} label="Benutzer" />
            <NavItem icon={Tag} label="Gruppen" />
            <NavItem icon={ScrollText} label="Logs" />
          </nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
                <Sliders size={18} className="text-zinc-950" />
              </div>
              <h1 className="text-lg font-semibold">Mix Editor</h1>
            </div>
          </header>
          <div className="flex items-center border-b border-zinc-800 px-6 py-3">
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              <ChevronLeft size={16} /> Zurück zur Playlist
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Sliders size={28} className="mb-1 text-zinc-700" />
            <div className="text-sm text-zinc-400">Kein Mix ausgewählt.</div>
            <div className="max-w-sm text-xs text-zinc-600">
              Wähle mindestens zwei Items in der Playlist aus (Strg+Klick), um sie hier zu mischen.
            </div>
          </div>
        </main>
      </div>
    );
  }

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
          <NavItem icon={Database} label="Elemente" onClick={() => onNavigate?.("list")} />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" active onClick={() => onNavigate?.("playlist")} />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" />
          <NavItem icon={Tag} label="Gruppen" />
          <NavItem icon={ScrollText} label="Logs" />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <Sliders size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Mix Editor</h1>
          </div>
        </header>

        {/* Sub toolbar */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
            <ChevronLeft size={16} /> Zurück zur Playlist
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={playing ? stopAll : playAll}
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pause" : "Abspielen"}
            </button>
            <button
              onClick={stopAll}
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              <Square size={13} /> Stop
            </button>
            <div className="mx-1 h-6 w-px bg-zinc-800" />
            {playlistId && (
              <button
                onClick={handleSaveHour}
                disabled={!hasChanges || saving}
                className="flex items-center gap-2 rounded-md border border-orange-600/60 px-3 py-2 text-sm font-medium text-orange-400 transition-colors hover:bg-orange-600/10 disabled:opacity-50"
                title="Speichert den Overlap nur für diese Stunde, betrifft keine andere Sendung"
              >
                <CircleDot size={14} /> {savingScope === "hour" ? "Speichert…" : "Für diese Stunde"}
              </button>
            )}
            <button
              onClick={handleSaveDatabase}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
              title="Schreibt den Overlap global in die Datenbank"
            >
              <DatabaseIcon size={14} /> {savingScope === "database" ? "Speichert…" : "In Datenbank"}
            </button>
          </div>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-red-500/5 px-6 py-2.5 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Speichern fehlgeschlagen: {saveError}</span>
          </div>
        )}
        {saveOk && !saveError && (
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-green-500/5 px-6 py-2.5 text-sm text-green-500">
            <Save size={14} />
            <span>{saveOk === "hour" ? "Übergänge für diese Stunde gespeichert." : "Übergänge in der Datenbank gespeichert."}</span>
          </div>
        )}

        {/* Zoom control */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-2 text-xs text-zinc-500">
          <span>Zoom</span>
          <input
            type="range" min={0.25} max={4} step={0.25}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1 w-40 accent-orange-500"
          />
          <span className="tabular-nums text-zinc-600">{zoom.toFixed(2)}x</span>
        </div>

        {/* Timeline: a fixed label column beside a horizontally-scrolling lane
            area, so track names stay put while the shared waveform timeline
            scrolls. One shared horizontal scrollbar drives everything, so the
            ruler at the bottom always lines up with the waveforms above it. */}
        <div className="flex-1 overflow-auto">
          <div className="flex" style={{ width: LABEL_WIDTH + totalWidth * pxPerSec + 40 }}>
            <div className="sticky left-0 z-10 shrink-0">
              {tracks.map((track, i) => (
                <TrackLabel key={i} track={track} focused={focusedTrack === i} onFocus={() => setFocusedTrack(i)} />
              ))}
            </div>
            <div className="relative flex-1" style={{ height: laneHeight }}>
              {tracks.map((track, i) => {
                const prev = tracks[i - 1];
                // The overlap is where both waveforms are visually drawn at
                // once: from where this track starts (== prev.handoff, where
                // the previous track hands off) to where the previous
                // track's own audio actually ends (prev.end >= prev.handoff
                // whenever its startNext is before its duration).
                const overlapStartPx = prev ? track.start * pxPerSec : null;
                const overlapEndPx = prev ? prev.end * pxPerSec : null;
                return (
                  <TrackRow
                    key={i}
                    track={track}
                    index={i}
                    registerWs={registerWs}
                    onSeekPreview={onSeekPreview}
                    onFocus={() => setFocusedTrack(i)}
                    pxPerSec={pxPerSec}
                    overlapStartPx={prev ? overlapStartPx : null}
                    overlapEndPx={prev ? overlapEndPx : null}
                  />
                );
              })}
              <div className="absolute left-0 top-0 h-full w-full">
                {tracks.slice(0, -1).map((track, i) => (
                  <TransitionDivider
                    key={i}
                    track={track}
                    pxPerSec={pxPerSec}
                    laneHeight={laneHeight}
                    onDrag={(newHandoff) => updateHandoff(i, newHandoff)}
                    onFocus={() => playFocus(i)}
                    focusActive={focusTransition === i}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Shared timeline ruler */}
          <div className="flex border-t border-zinc-800 bg-zinc-900/30">
            <div className="sticky left-0 z-10 w-52 shrink-0 border-r border-zinc-800 bg-zinc-900/60" />
            <TimelineRuler totalWidth={totalWidth} pxPerSec={pxPerSec} />
          </div>
        </div>

        {/* Cue point chips for the focused track */}
        <div className="border-t border-zinc-800">
          <CueChipStrip track={tracks[focusedTrack]} onJump={jumpToCue} />
        </div>

        {/* Legend / hint */}
        <div className="border-t border-zinc-800 px-6 py-2 text-xs text-zinc-600">
          Orange Fläche = Overlap zwischen zwei Spuren. Trennstrich ziehen, um ihn zu ändern.{" "}
          <Focus size={11} className="inline -translate-y-0.5" /> spielt nur den Übergang (±{FOCUS_WINDOW}s) ab.
        </div>
      </main>
    </div>
  );
}
