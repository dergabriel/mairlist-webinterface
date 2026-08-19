import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic, Users, Tag, ScrollText,
  ChevronLeft, Sliders, Play, Pause, Square, Focus, Save, CircleDot,
  AlertTriangle,
} from "lucide-react";
import { getAudioUrl, savePlaylistItemOverrides } from "../lib/api";

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

// MM:SS.ss — used for chip time labels and the drag drop-time tooltip.
const mmssHundredths = (sec) => {
  if (sec == null || Number.isNaN(sec)) return "0:00.00";
  const t = Math.max(0, sec);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};

const WAVE_COLOR = "#52525b"; // zinc-600
const PROGRESS_COLOR = "#f97316"; // orange-500
const PX_PER_SEC = 32;
const TRACK_HEIGHT = 120;
const LABEL_WIDTH = 208;
const FOCUS_WINDOW = 10; // seconds shown on either side of a transition in focus mode
const DRAG_THRESHOLD_PX = 4; // movement beyond this on a draggable lane counts as a drag, not a click

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

// Clamp startNext of a track to mAirList's real bounds: it can't start the
// next track before its own cueIn (no playing "into the past"), and can't
// leave a gap past its own duration (next track starts at the latest once
// this one ends).
function clampStartNext(startNext, duration, cueIn) {
  return Math.min(Math.max(startNext, cueIn), duration);
}

// Lays every selected item on one shared timeline. Track 0 starts at 0;
// every later track starts exactly where the previous track's startNext
// marker sits on the timeline — no cueIn-relative shifting, no gaps.
function computeLayout(items) {
  let cursor = 0;
  const tracks = items.map((item, i) => {
    const { duration, cueIn, startNext: rawStartNext } = trackCues(item);
    const startNext = clampStartNext(rawStartNext, duration, cueIn);
    const start = i === 0 ? 0 : cursor;
    const end = start + duration;
    cursor = start + startNext;
    return { item, duration, cueIn, startNext, start, end };
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

// --- Single waveform track lane ---
//
// Track N (index > 0) is draggable as a whole: dragging it left/right edits
// startNext of the *previous* track (N-1), since that value is what places
// N on the shared timeline. Individual cue markers on top are separately
// draggable and take priority over the lane drag (stopPropagation). The
// startNext marker on a track is a special case: dragging it is identical to
// dragging the next track's lane, so both write to the same value.

function TrackRow({
  track, index, registerWs, onSeekPreview, onFocus, pxPerSec,
  overlapStartPx, overlapEndPx, onDragLane, onDragMarker, cueEdits,
  onChipDrop, dragChipColor, dragBelowKey,
}) {
  const waveformRef = useRef(null);
  const wsRef = useRef(null);
  const [audioState, setAudioState] = useState("loading");
  const [chipDragOver, setChipDragOver] = useState(false);
  const [dropLabel, setDropLabel] = useState(null); // { x, y, text, color }
  const [playheadPct, setPlayheadPct] = useState(0);
  const { item, duration, start } = track;
  const bars = useMemo(() => syntheticBars(item.internalId), [item.internalId]);

  const cueVal = (key) => {
    const raw = cueEdits[index]?.[key] ?? item.cue?.[key];
    return raw != null && raw !== "" ? Number(raw) : null;
  };
  const cueInVal = cueVal("cueIn") ?? 0;
  const cueOutVal = cueVal("cueOut");
  const fadeInEnd = cueVal("fadeIn");
  const fadeOutStart = cueVal("fadeOut");
  const fadeOutEnd = cueVal("fadeEnd") ?? cueOutVal ?? duration;
  const loopInVal = cueVal("loopIn");
  const loopOutVal = cueVal("loopOut");
  const pctOf = (sec) => (sec / Math.max(duration, 1)) * 100;

  const markers = useMemo(() => {
    return CUE_POINTS.filter((p) => {
      const val = cueEdits[index]?.[p.key] ?? item.cue?.[p.key];
      return val != null && val !== "";
    }).map((point) => {
      const raw = cueEdits[index]?.[point.key] ?? item.cue?.[point.key];
      return { point, value: Number(raw), pct: (Number(raw) / Math.max(duration, 1)) * 100 };
    });
  }, [item.cue, duration, cueEdits, index]);

  useEffect(() => {
    if (!waveformRef.current) return;
    setAudioState("loading");

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      height: TRACK_HEIGHT - 8,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: "#f97316",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      fillParent: true,
      normalize: true,
      interact: true,
      url: getAudioUrl(item.internalId),
    });
    wsRef.current = ws;
    registerWs(index, ws);

    ws.on("ready", () => setAudioState("ready"));
    ws.on("error", () => setAudioState("unavailable"));
    ws.on("timeupdate", (t) => setPlayheadPct((t / Math.max(duration, 1)) * 100));

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
  const draggableLane = index > 0;
  const laneBg = index % 2 === 0 ? "bg-zinc-900" : "bg-zinc-950";

  // Draggable lanes (index > 0) distinguish a click (seek) from a drag
  // (edit startNext of the previous track) via a small movement threshold:
  // if the pointer moves more than DRAG_THRESHOLD_PX before mouseup, treat
  // it as a lane drag; otherwise treat it as a click-to-seek.
  const handleLaneMouseDown = (e) => {
    onFocus();
    if (!draggableLane) return;
    e.preventDefault();
    const startX = e.clientX;
    let dragging = false;

    const onMove = (ev) => {
      if (!dragging && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD_PX) {
        dragging = true;
        onDragLane(e);
      }
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!dragging) {
        const t = dropTimeFromEvent(ev);
        onSeekPreview(index, t);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const dropTimeFromEvent = (e) => {
    const waveformLeft = waveformRef.current?.getBoundingClientRect().left ?? leftPx;
    const raw = (e.clientX - waveformLeft) / pxPerSec;
    return Math.min(Math.max(raw, 0), duration);
  };

  const handleChipDragOver = (e) => {
    if (!e.dataTransfer.types.includes("application/x-cue-chip")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setChipDragOver(true);
  };

  const handleChipDragMove = (e) => {
    if (!chipDragOver) return;
    const t = dropTimeFromEvent(e);
    setDropLabel({ x: e.clientX, y: e.clientY, text: mmssHundredths(t), color: dragChipColor });
  };

  const handleChipDragLeave = () => {
    setChipDragOver(false);
    setDropLabel(null);
  };

  const handleChipDrop = (e) => {
    e.preventDefault();
    setChipDragOver(false);
    setDropLabel(null);
    const cueKey = e.dataTransfer.getData("application/x-cue-chip");
    if (!cueKey) return;
    onChipDrop(index, cueKey, dropTimeFromEvent(e));
  };

  return (
    <div
      onMouseDown={handleLaneMouseDown}
      onDragOver={(e) => { handleChipDragOver(e); handleChipDragMove(e); }}
      onDragLeave={handleChipDragLeave}
      onDrop={handleChipDrop}
      className={`relative border-b transition-colors ${draggableLane ? "cursor-ew-resize" : ""} ${
        chipDragOver ? "border-orange-500/70" : "border-zinc-800"
      }`}
      style={{ height: TRACK_HEIGHT }}
    >
      {/* overlap highlight with the neighbouring track(s) */}
      {overlapStartPx != null && (
        <div
          className="pointer-events-none absolute top-0 z-[5] h-full bg-orange-500/15"
          style={{ left: overlapStartPx, width: Math.max(overlapEndPx - overlapStartPx, 0) }}
        />
      )}

      {chipDragOver && (
        <div className="pointer-events-none absolute inset-0 z-[6] rounded-md ring-1 ring-inset ring-orange-500/70" />
      )}
      {dropLabel && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-sm px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-950 shadow"
          style={{ left: dropLabel.x, top: dropLabel.y - 8, backgroundColor: dropLabel.color }}
        >
          {dropLabel.text}
        </div>
      )}

      {audioState === "unavailable" && (
        <div
          className="pointer-events-none absolute top-1 z-10 flex items-center gap-1 text-[10px] text-zinc-600"
          style={{ left: leftPx + 6 }}
        >
          <AlertTriangle size={10} /> synthetisch
        </div>
      )}
      <div
        className={`absolute top-1 rounded-md border border-zinc-800 ${laneBg}`}
        style={{ left: leftPx, width: widthPx, height: TRACK_HEIGHT - 8 }}
      >
        <div
          ref={waveformRef}
          onClick={(e) => {
            if (draggableLane) return; // clicks on a draggable lane are handled by the drag/seek combo below
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
            onSeekPreview(index, pct * duration);
          }}
          className={`h-full w-full ${draggableLane ? "" : "cursor-pointer"} ${audioReady ? "" : "invisible"}`}
        />

        {/* playhead: orange vertical line tracking playback progress */}
        <div
          className="pointer-events-none absolute top-0 z-30 h-full w-px bg-orange-500"
          style={{ left: `${playheadPct}%` }}
        />

        {/* fade in */}
        {fadeInEnd != null && fadeInEnd > cueInVal && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full bg-blue-500/15"
            style={{ left: `${pctOf(cueInVal)}%`, width: `${Math.max(pctOf(fadeInEnd) - pctOf(cueInVal), 0)}%` }}
          />
        )}
        {/* fade out */}
        {fadeOutStart != null && fadeOutEnd > fadeOutStart && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full bg-blue-500/15"
            style={{ left: `${pctOf(fadeOutStart)}%`, width: `${Math.max(pctOf(fadeOutEnd) - pctOf(fadeOutStart), 0)}%` }}
          />
        )}
        {/* loop */}
        {loopInVal != null && loopOutVal != null && loopOutVal > loopInVal && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full bg-orange-500/15"
            style={{ left: `${pctOf(loopInVal)}%`, width: `${Math.max(pctOf(loopOutVal) - pctOf(loopInVal), 0)}%` }}
          />
        )}

        {!audioReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center gap-[1px] px-0.5">
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
        {markers.map(({ point, pct }) => {
          const isEmphasized = point.key === "startNext" || point.key === "cueIn";
          return (
            <div
              key={point.key}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDragMarker(e, point.key, () => waveformRef.current?.getBoundingClientRect());
              }}
              className={`absolute top-0 z-20 flex h-full cursor-ew-resize items-start transition-opacity ${
                dragBelowKey === point.key ? "opacity-30" : ""
              }`}
              style={{ left: `${pct}%`, width: isEmphasized ? 10 : 6, marginLeft: isEmphasized ? -5 : -3 }}
              title={`${point.label} verschieben — nach unten ziehen zum Löschen`}
            >
              <div
                className="mx-auto h-full"
                style={{ width: isEmphasized ? 2 : 1, backgroundColor: point.color }}
              />
              <div
                className="pointer-events-none absolute -left-1 top-0 -translate-y-full whitespace-nowrap rounded-sm px-1 text-[9px] font-medium leading-tight"
                style={{ color: point.color, backgroundColor: "rgba(9, 9, 11, 0.85)" }}
              >
                {dragBelowKey === point.key ? "Löschen" : point.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Focus button, sits above the overlap zone between two tracks ---

function OverlapFocusButton({ leftPx, onFocus, focusActive }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onFocus(); }}
      onMouseDown={(e) => e.stopPropagation()}
      className={`pointer-events-auto absolute -top-6 z-20 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-md border transition-colors ${
        focusActive
          ? "border-orange-500 bg-orange-500 text-zinc-950"
          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-orange-500 hover:text-orange-400"
      }`}
      style={{ left: leftPx }}
      title="Fokus-Modus: Übergang abspielen"
    >
      <Focus size={11} />
    </button>
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

function CueChipStrip({ track, trackIndex, onJump, onChipDragStart, onChipDragEnd }) {
  const [draggingKey, setDraggingKey] = useState(null);
  if (!track) {
    return <div className="px-6 py-3 text-xs text-zinc-600">Spur wählen, um Cue-Punkte zu sehen.</div>;
  }
  const cue = track.item.cue || {};

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-6 py-3">
      <span className="mr-1 truncate text-xs text-zinc-500" title={track.item.title}>
        {track.item.title}:
      </span>
      {CUE_POINTS.map((p) => {
        const rawVal = cue[p.key];
        const isSet = rawVal != null && rawVal !== "";
        return (
          <button
            key={p.key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-cue-chip", p.key);
              e.dataTransfer.effectAllowed = "move";
              setDraggingKey(p.key);
              onChipDragStart(trackIndex, p.key, p.color);
            }}
            onDragEnd={() => {
              setDraggingKey(null);
              onChipDragEnd();
            }}
            onClick={() => isSet && onJump(p)}
            className={`cursor-grab select-none rounded px-2 py-1 text-[11px] font-medium transition-opacity active:cursor-grabbing hover:opacity-90 ${
              isSet ? "text-zinc-950" : "bg-zinc-800 text-zinc-600"
            } ${draggingKey === p.key ? "opacity-50" : ""}`}
            style={isSet ? { backgroundColor: p.color } : undefined}
            title={isSet ? mmssHundredths(Number(rawVal)) : `${p.label} (nicht gesetzt) — auf Spur ziehen zum Setzen`}
          >
            {p.label}{isSet ? ` · ${mmssHundredths(Number(rawVal))}` : ""}
          </button>
        );
      })}
    </div>
  );
}

// --- Main ---

export default function MixEditor({ context, onBack, onNavigate }) {
  const items = context?.items ?? [];
  const playlistId = context?.playlistId;

  // Local, editable copy of each item's cue points, keyed by array index —
  // independent of the read-only `items` from context. Only startNext feeds
  // the save flow; the other draggable markers (fadeIn, ramp1, fadeOut,
  // cueOut, outro) are local-only preview edits, mirroring how they're
  // presented in the timeline without a persistence path defined for them.
  const [cueEdits, setCueEdits] = useState(() => items.map((it) => ({ ...trackCues(it), fadeIn: it.cue?.fadeIn })));
  const [zoom, setZoom] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [focusTransition, setFocusTransition] = useState(null); // index of the transition, or null
  const [focusedTrack, setFocusedTrack] = useState(0); // index of the track shown in the cue chip strip
  const [savingScope, setSavingScope] = useState(null); // "hour" | "database" | null
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk] = useState(null);
  const [dragChip, setDragChip] = useState(null); // { trackIndex, cueKey, color } while a chip is being dragged

  const wsRefs = useRef([]);
  const registerWs = useCallback((index, ws) => { wsRefs.current[index] = ws; }, []);

  const pxPerSec = PX_PER_SEC * zoom;
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;

  // Build display items with edited cue values layered on top for the layout calc.
  const editedItems = useMemo(
    () => items.map((it, i) => ({
      ...it,
      cue: { ...it.cue, ...cueEdits[i] },
    })),
    [items, cueEdits]
  );

  const { tracks, totalWidth } = useMemo(() => computeLayout(editedItems), [editedItems]);
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  // Sets startNext of `trackIndex`, clamped to [cueIn, duration] — the same
  // bounds mAirList itself enforces (no starting before the track's own
  // cue-in, no gap past its own end).
  const setStartNext = useCallback((trackIndex, newValue) => {
    setCueEdits((prev) => {
      const track = tracksRef.current[trackIndex];
      if (!track) return prev;
      const clamped = clampStartNext(newValue, track.duration, track.cueIn);
      const next = [...prev];
      next[trackIndex] = { ...next[trackIndex], startNext: clamped };
      return next;
    });
    setSaveOk(null);
  }, []);

  // Dragging track N's lane (N > 0) edits startNext of track N-1, since that
  // value is what places N on the timeline.
  const beginLaneDrag = useCallback((index, e) => {
    const prevIndex = index - 1;
    const startX = e.clientX;
    const startStartNext = tracksRef.current[prevIndex]?.startNext ?? 0;

    const onMove = (ev) => {
      const deltaSec = (ev.clientX - startX) / pxPerSecRef.current;
      setStartNext(prevIndex, startStartNext + deltaSec);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setStartNext]);

  // { index, key } of the marker currently dragged more than 24px below its
  // waveform's bottom edge, i.e. about to be deleted on release.
  const [dragBelow, setDragBelow] = useState(null);
  const dragBelowRef = useRef(null);

  // Deletes cue point `cueKey` on track `index` by clearing its edit.
  const clearCueEdit = useCallback((index, cueKey) => {
    setCueEdits((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [cueKey]: null };
      return next;
    });
    setSaveOk(null);
  }, []);

  // Dragging an individual cue marker on track `index`. The startNext marker
  // is a special case: it's the same value the next track's lane drag edits,
  // so dragging it moves the next track along with it (handled naturally
  // since both write to cueEdits[index].startNext). Dragging more than 24px
  // below the waveform's bottom edge deletes the marker on release instead
  // of repositioning it.
  const beginMarkerDrag = useCallback((index, cueKey, e, getWaveformRect) => {
    const track = tracksRef.current[index];
    if (!track) return;
    const startX = e.clientX;
    const startValue = cueKey === "startNext" ? track.startNext
      : cueKey === "cueIn" ? track.cueIn
      : Number(track.item.cue?.[cueKey]) || 0;

    const onMove = (ev) => {
      const waveRect = getWaveformRect?.();
      if (waveRect && ev.clientY > waveRect.bottom + 24) {
        dragBelowRef.current = { index, key: cueKey };
        setDragBelow({ index, key: cueKey });
        return;
      }
      dragBelowRef.current = null;
      setDragBelow(null);

      const deltaSec = (ev.clientX - startX) / pxPerSecRef.current;
      const raw = startValue + deltaSec;
      if (cueKey === "startNext") {
        setStartNext(index, raw);
        return;
      }
      const t = tracksRef.current[index];
      const clamped = Math.min(Math.max(raw, 0), t.duration);
      setCueEdits((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [cueKey]: clamped };
        return next;
      });
      setSaveOk(null);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (dragBelowRef.current?.index === index && dragBelowRef.current?.key === cueKey) {
        clearCueEdit(index, cueKey);
      }
      dragBelowRef.current = null;
      setDragBelow(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [setStartNext, clearCueEdit]);

  // Dropping a cue chip onto a waveform lane sets that cue point's value to
  // the drop position. startNext is a special case handled by setStartNext,
  // which also shifts the next track since both read the same value.
  const setCueByChipDrop = useCallback((trackIndex, cueKey, dropTime) => {
    if (cueKey === "startNext") {
      setStartNext(trackIndex, dropTime);
      return;
    }
    setCueEdits((prev) => {
      const next = [...prev];
      next[trackIndex] = { ...next[trackIndex], [cueKey]: dropTime };
      return next;
    });
    setSaveOk(null);
  }, [setStartNext]);

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
    // prev.startNext is prev's own in-track time at the handoff point.
    const prevStart = Math.max(prev.startNext - FOCUS_WINDOW, prev.cueIn);
    const nextStart = next.cueIn;

    wsRefs.current.forEach((ws, i) => {
      if (i !== transitionIndex && i !== transitionIndex + 1) ws?.pause();
    });

    if (prevWs) {
      prevWs.setTime(prevStart);
      prevWs.play();
      setTimeout(() => prevWs.pause(), FOCUS_WINDOW * 1000);
    }
    const delayMs = Math.max((prev.startNext - prevStart) * 1000, 0);
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
            <NavItem icon={Users} label="Benutzer" onClick={() => onNavigate?.("users")} />
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
          <NavItem icon={Users} label="Benutzer" onClick={() => onNavigate?.("users")} />
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
            <span>Übergänge für diese Stunde gespeichert.</span>
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
                // once: from where this track starts (track N's start ==
                // track N-1's startNext point on the shared timeline) to
                // where the previous track's own audio actually ends.
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
                    onDragLane={(e) => beginLaneDrag(i, e)}
                    onDragMarker={(e, cueKey, getWaveformRect) => beginMarkerDrag(i, cueKey, e, getWaveformRect)}
                    cueEdits={cueEdits}
                    onChipDrop={setCueByChipDrop}
                    dragChipColor={dragChip?.color}
                    dragBelowKey={dragBelow?.index === i ? dragBelow.key : null}
                  />
                );
              })}
              <div className="pointer-events-none absolute left-0 top-0 h-full w-full">
                {tracks.slice(0, -1).map((track, i) => (
                  <OverlapFocusButton
                    key={i}
                    leftPx={tracks[i + 1].start * pxPerSec}
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
          <CueChipStrip
            track={tracks[focusedTrack]}
            trackIndex={focusedTrack}
            onJump={jumpToCue}
            onChipDragStart={(trackIndex, cueKey, color) => setDragChip({ trackIndex, cueKey, color })}
            onChipDragEnd={() => setDragChip(null)}
          />
        </div>

        {/* Legend / hint */}
        <div className="border-t border-zinc-800 px-6 py-2 text-xs text-zinc-600">
          Orange Fläche = Overlap zwischen zwei Spuren. Spur oder Cue-Marker ziehen, um den Übergang zu ändern.{" "}
          <Focus size={11} className="inline -translate-y-0.5" /> spielt nur den Übergang (±{FOCUS_WINDOW}s) ab.
        </div>
      </main>
    </div>
  );
}
