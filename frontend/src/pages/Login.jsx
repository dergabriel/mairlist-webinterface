import { useState } from "react";
import { Database, User, Lock } from "lucide-react";
import { useAuth } from "../lib/AuthContext";

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700";

export default function Login({ onLogin }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      onLogin?.();
    } catch (e) {
      setError(e.message === "Ungültige Zugangsdaten" ? e.message : "Ungültige Zugangsdaten");
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") submit();
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

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-zinc-400">Benutzername</span>
            <div className="relative flex items-center">
              <User size={15} className="absolute left-3 text-zinc-500" />
              <input
                className={`${inputClass} pl-9`}
                value={username}
                autoFocus
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={onKeyDown}
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
                onKeyDown={onKeyDown}
                placeholder="Passwort"
              />
            </div>
          </label>

          {error && <div className="text-xs text-red-500">{error}</div>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-60"
          >
            Anmelden
          </button>
        </div>
      </div>
    </div>
  );
}
