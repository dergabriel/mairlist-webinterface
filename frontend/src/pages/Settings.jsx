import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Save, Check } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { getSettings, saveSettings } from "../lib/api";
import Sidebar from "../components/Sidebar";

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

const DEFAULT_SETTINGS = {
  stationName: "Mein Radio",
  dateFormat: "DD.MM.YYYY",
  timeFormat: "HH:mm:ss",
  defaultDate: "today",
  itemsPerPage: 50,
  audioBaseDir: "",
  uploadBaseDir: "",
  allowedOrigins: "",
};

export default function Settings({ onNavigate }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSettings()
      .then((data) => setSettings({ ...DEFAULT_SETTINGS, ...data }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const setField = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await saveSettings(settings);
      setSettings({ ...DEFAULT_SETTINGS, ...saved });
      setToast(true);
      setTimeout(() => setToast(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      <Sidebar activePage="settings" onNavigate={onNavigate} user={user} />

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
            <span>Gespeichert</span>
          </div>
        )}

        {error && (
          <div className="border-b border-zinc-800 bg-red-500/5 px-6 py-2.5 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 py-6">
          {loading ? (
            <div className="mx-auto max-w-3xl text-sm text-zinc-500">Lädt…</div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              <Card title="Allgemein">
                <Field label="Sendername">
                  <input
                    type="text"
                    value={settings.stationName}
                    onChange={(e) => setField("stationName")(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Datumsformat">
                    <select
                      value={settings.dateFormat}
                      onChange={(e) => setField("dateFormat")(e.target.value)}
                      className={inputClass}
                    >
                      <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </Field>
                  <Field label="Zeitformat">
                    <select
                      value={settings.timeFormat}
                      onChange={(e) => setField("timeFormat")(e.target.value)}
                      className={inputClass}
                    >
                      <option value="HH:mm:ss">HH:mm:ss</option>
                      <option value="HH:mm">HH:mm</option>
                    </select>
                  </Field>
                </div>
              </Card>

              <Card title="Anzeige">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Einträge pro Seite">
                    <input
                      type="number"
                      min={10}
                      max={200}
                      value={settings.itemsPerPage}
                      onChange={(e) => setField("itemsPerPage")(Number(e.target.value))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Standard-Datum">
                    <select
                      value={settings.defaultDate}
                      onChange={(e) => setField("defaultDate")(e.target.value)}
                      className={inputClass}
                    >
                      <option value="today">Heute</option>
                      <option value="manual">Manuell</option>
                    </select>
                  </Field>
                </div>
              </Card>

              <Card title="Pfade">
                <Field label="Audio Base Dir">
                  <input
                    type="text"
                    value={settings.audioBaseDir}
                    onChange={(e) => setField("audioBaseDir")(e.target.value)}
                    placeholder="/srv/mairlist/audio"
                    className={inputClass}
                  />
                </Field>
                <Field label="Upload Base Dir">
                  <input
                    type="text"
                    value={settings.uploadBaseDir}
                    onChange={(e) => setField("uploadBaseDir")(e.target.value)}
                    placeholder="/srv/mairlist/uploads"
                    className={inputClass}
                  />
                </Field>
              </Card>

              <Card title="Sicherheit">
                <Field label="Allowed Origins" hint="Kommagetrennt, z. B. https://panel.example.com, https://admin.example.com">
                  <input
                    type="text"
                    value={settings.allowedOrigins}
                    onChange={(e) => setField("allowedOrigins")(e.target.value)}
                    placeholder="https://panel.example.com"
                    className={inputClass}
                  />
                </Field>
              </Card>

              <div className="flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-60"
                >
                  <Save size={16} />
                  <span>Speichern</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
