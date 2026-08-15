// TODO (Phase F): Echte Authentifizierung gegen auth_users / auth_sessions (docs/SCHEMA.md).
// Aktuell wird jeder Submit ohne Prüfung durchgelassen.
// Dieser Stub bleibt so lange bestehen, bis das reale Schema angebunden ist.

import { useState } from "react";
import { Database, User, Lock } from "lucide-react";

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e) => {
    e.preventDefault();
    // TODO (Phase F): POST /api/auth/login, Session-Token speichern
    onLogin?.();
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 font-sans text-zinc-100">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-orange-500">
            <Database size={28} className="text-zinc-950" />
          </div>
          <div className="text-lg font-semibold tracking-wide">
            <span className="text-zinc-100">mAirList</span>{" "}
            <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">DB</span>
          </div>
        </div>

        {/* Stub-Hinweis, nur im Dev sichtbar */}
        {import.meta.env.DEV && (
          <div className="mb-4 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400">
            Dev-Modus: Anmeldung ohne Prüfung (Phase F offen)
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Benutzername</span>
            <div className="relative flex items-center">
              <User size={15} className="absolute left-3 text-zinc-500" />
              <input
                className={`${inputClass} pl-9`}
                value={username}
                autoFocus
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Benutzername"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Passwort</span>
            <div className="relative flex items-center">
              <Lock size={15} className="absolute left-3 text-zinc-500" />
              <input
                type="password"
                className={`${inputClass} pl-9`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort"
              />
            </div>
          </label>

          <button
            type="submit"
            className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
          >
            Anmelden
          </button>
        </form>
      </div>
    </div>
  );
}