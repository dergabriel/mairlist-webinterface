// TODO (Phase F/G): Einstellungen per GET /api/settings laden und per POST /api/settings speichern.
// handleSave ist aktuell ein Stub: zeigt nur einen Toast, persistiert nichts.
// CUE_POINTS hier lokal definiert, da Settings noch keine Backend-Route hat.
// Beim SQL-Umstieg: DEFAULT_CUE_PRIORITY als user-Setting in der DB speichern.

import { useState } from "react";
import {
  LayoutDashboard, Settings as SettingsIcon, Database, Copy, ListMusic,
  Users, Tag, ScrollText, LogOut, Save, Check, GripVertical, Info,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";

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

// Alle 17 Cue-Punkte laut FIELD-SEMANTICS.md
const CUE_POINTS = [
  { key: "cueIn",    label: "Cue In"    },
  { key: "fadeIn",   label: "Fade In"   },
  { key: "ramp1",    label: "Ramp 1"    },
  { key: "ramp2",    label: "Ramp 2"    },
  { key: "ramp3",    label: "Ramp 3"    },
  { key: "loopIn",   label: "Loop In"   },
  { key: "loopOut",  label: "Loop Out"  },
  { key: "hookIn",   label: "Hook In"   },
  { key: "hookFade", label: "Hook Fade" },
  { key: "hookOut",  label: "Hook Out"  },
  { key: "outro",    label: "Outro"     },
  { key: "startNext",label: "Start Next"},
  { key: "fadeOut",  label: "Fade Out"  },
  { key: "fadeEnd",  label: "Fade End"  },
  { key: "cueOut",   label: "Cue Out"   },
  { key: "preroll",  label: "Preroll"   },
  { key: "anchor",   label: "Anchor"    },
];

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700";

function Card({ title, children }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-100">
        {title}
      </div>
      <div className="space-y-4 px-5 py-5">{children}</div>
    </div>
  );
}

export default function Settings({ onNavigate }) {
  const { logout } = useAuth();
  const [language, setLanguage] = useState("de");
  const [timezone, setTimezone] = useState("");
  const [dateFormat, setDateFormat] = useState("DD.MM.YYYY");
  const [defaultGain, setDefaultGain] = useState(0);
  const [normTarget, setNormTarget] = useState(-14);
  const [audioBaseDir, setAudioBaseDir] = useState("");
  const [cuePriority, setCuePriority] = useState(CUE_POINTS.map((c) => c.key));
  const [toast, setToast] = useState(false);

  const moveCue = (index, dir) => {
    const next = [...cuePriority];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setCuePriority(next);
  };

  const handleSave = () => {
    // TODO (Phase F/G): POST /api/settings mit { language, timezone, dateFormat, defaultGain, normTarget, cuePriority }
    setToast(true);
    setTimeout(() => setToast(false), 2500);
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
        <div className="mb-6 px-2 text-sm font-semibold tracking-wide">
          <span className="text-zinc-100">mAirList</span>{" "}
          <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">DB</span>
        </div>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Playout</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={LayoutDashboard} label="Übersicht" onClick={() => onNavigate?.("dashboard")} />
          <NavItem icon={SettingsIcon} label="Einstellungen" />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Datenbank</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={Database} label="Elemente" onClick={() => onNavigate?.("list")} />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" onClick={() => onNavigate?.("playlist")} />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" />
          <NavItem icon={Tag} label="Gruppen" />
          <NavItem icon={ScrollText} label="Logs" onClick={() => onNavigate?.("logs")} />
          <NavItem icon={SettingsIcon} label="Einstellungen" active onClick={() => onNavigate?.("settings")} />
        </nav>

        <div className="mt-auto pt-4">
          <NavItem
            icon={LogOut}
            label="Abmelden"
            onClick={async () => {
              await logout();
              onNavigate?.("login");
            }}
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <SettingsIcon size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Einstellungen</h1>
          </div>
        </header>

        {toast && (
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-green-500/5 px-6 py-2.5 text-sm text-green-500">
            <Check size={14} />
            <span>Gespeichert (noch nicht persistiert, Phase F/G offen)</span>
          </div>
        )}

        {/* Stub-Banner, nur im Dev sichtbar */}
        {import.meta.env.DEV && (
          <div className="border-b border-orange-500/20 bg-orange-500/10 px-6 py-2 text-xs text-orange-400">
            Dev-Modus: Einstellungen werden nicht gespeichert (Phase F/G: POST /api/settings noch nicht implementiert)
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto max-w-3xl space-y-6">
            <Card title="Allgemein">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sprache">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className={inputClass}
                  >
                    <option value="de">Deutsch</option>
                    <option value="en" disabled>English (bald verfügbar)</option>
                  </select>
                </Field>
                <Field label="Datumsformat">
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className={inputClass}
                  >
                    <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </Field>
              </div>
              <Field label="Zeitzone">
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Europe/Berlin"
                  className={inputClass}
                />
              </Field>
            </Card>

            <Card title="Audio">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Standard-Gain (dB)">
                  <input
                    type="number"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={defaultGain}
                    onChange={(e) => setDefaultGain(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Normalisierungs-Zielwert (LUFS)">
                  <input
                    type="number"
                    step={0.5}
                    value={normTarget}
                    onChange={(e) => setNormTarget(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field
                label="AUDIO_BASE_DIR"
                hint="Wird als Umgebungsvariable gesetzt, nicht hier gespeichert."
              >
                <input
                  type="text"
                  value={audioBaseDir}
                  onChange={(e) => setAudioBaseDir(e.target.value)}
                  placeholder="/srv/mairlist/audio"
                  className={inputClass}
                />
              </Field>
            </Card>

            <Card title="Darstellung">
              <div>
                <span className="mb-1.5 block text-sm text-zinc-400">Cue-Priorität</span>
                <div className="space-y-1 rounded-md border border-zinc-800 bg-zinc-950 p-2">
                  {cuePriority.map((key, index) => {
                    const point = CUE_POINTS.find((c) => c.key === key);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300"
                      >
                        <GripVertical size={14} className="shrink-0 text-zinc-600" />
                        <span className="w-6 shrink-0 text-xs text-zinc-600">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 truncate">{point.label}</span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => moveCue(index, -1)}
                            disabled={index === 0}
                            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveCue(index, 1)}
                            disabled={index === cuePriority.length - 1}
                            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <Info size={13} className="shrink-0" />
                  <span>Wird in einer späteren Version gespeichert (DEFAULT_CUE_PRIORITY).</span>
                </div>
              </div>
            </Card>

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
              >
                <Save size={16} />
                <span>Speichern</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}