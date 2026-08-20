import { useState, useEffect, useCallback } from "react";
import {
  Users as UsersIcon, Plus, Trash2, Save,
  AlertTriangle, X, Check, UserCircle, KeyRound, ClipboardCopy,
} from "lucide-react";
import {
  getUsers, getAdminUserById, createUser, updateUser, deleteUser,
  changeUserPassword, setUserPermissions,
  getUserTokens, createUserToken, deleteUserToken,
} from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import Sidebar from "../../components/Sidebar";

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X size={15} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function NewUserDialog({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), description: description.trim(), password });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Neuer Benutzer" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Name</span>
          <input
            className={inputClass}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Benutzername"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Beschreibung</span>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anzeigename"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Passwort</span>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Benutzer konnte nicht angelegt werden: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !password}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {saving ? "Wird angelegt…" : "Anlegen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteUserDialog({ user, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Modal title="Benutzer löschen" onClose={onClose}>
      <p className="text-sm text-zinc-300">
        Soll der Benutzer <span className="font-medium text-zinc-100">{user.name}</span> wirklich gelöscht werden?
      </p>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-500">
          <AlertTriangle size={14} />
          <span>Löschen fehlgeschlagen: {error}</span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Abbrechen
        </button>
        <button
          onClick={confirm}
          disabled={deleting}
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
        >
          {deleting ? "Wird gelöscht…" : "Löschen"}
        </button>
      </div>
    </Modal>
  );
}

const USER_LEVELS = ["Admin", "User", "ReadOnly"];
const GENERAL_PERMISSIONS = ["All", "None"];
const LIBRARY_PERMISSIONS = ["All", "ReadOnly", "None"];

const emptyPermissions = () => ({ UserLevel: "User", GeneralPermissions: "None", LibraryPermissions: "None" });

function formatDateTime(value) {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("de-DE");
}

function TokensSection({ userId }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getUserTokens(userId);
      setTokens(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadTokens();
    setNewToken(null);
  }, [loadTokens]);

  const copyToClipboard = async (value, id) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard-Zugriff kann vom Browser verweigert werden; still ignorieren
    }
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const created = await createUserToken(userId);
      setNewToken(created);
      await loadTokens();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (tokenId) => {
    setError(null);
    try {
      await deleteUserToken(userId, tokenId);
      if (newToken?.id === tokenId) setNewToken(null);
      await loadTokens();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <span className="text-sm font-semibold text-zinc-100">API-Tokens</span>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          <Plus size={13} />
          <span>{generating ? "Wird generiert…" : "Neuen Token generieren"}</span>
        </button>
      </div>

      <div className="px-5 py-5">
        {newToken && (
          <div className="mb-4 rounded-md border border-orange-500/40 bg-orange-500/10 px-4 py-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-orange-400">
              <AlertTriangle size={13} />
              <span>Token wird nur einmal angezeigt</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100">
                {newToken.token}
              </code>
              <button
                onClick={() => copyToClipboard(newToken.token, "new")}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {copiedId === "new" ? <Check size={13} className="text-green-500" /> : <ClipboardCopy size={13} />}
                <span>{copiedId === "new" ? "Kopiert" : "Kopieren"}</span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {loading && <div className="text-sm text-zinc-500">Lädt…</div>}

        {!loading && tokens.length === 0 && (
          <div className="text-sm text-zinc-600">Keine Tokens vorhanden</div>
        )}

        {!loading && tokens.length > 0 && (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <KeyRound size={14} className="shrink-0 text-zinc-600" />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-zinc-200">
                      {t.token.slice(0, 8)}…
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      Erstellt {formatDateTime(t.created)} · Läuft ab {formatDateTime(t.expires)}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(t.token, t.id)}
                    className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {copiedId === t.id ? <Check size={13} className="text-green-500" /> : <ClipboardCopy size={13} />}
                    <span>{copiedId === t.id ? "Kopiert" : "Kopieren"}</span>
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
                  >
                    <Trash2 size={13} />
                    <span>Token löschen</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UserDetail({ user, currentUserId, onSaved, onDeleted }) {
  const [name, setName] = useState(user.name);
  const [description, setDescription] = useState(user.description || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [permissions, setPermissions] = useState(
    () => user.scopes?.[0]?.permissions || emptyPermissions()
  );
  const scopeId = user.scopes?.[0]?.scopeId ?? 1;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setName(user.name);
    setDescription(user.description || "");
    setNewPassword("");
    setConfirmPassword("");
    setPermissions(user.scopes?.[0]?.permissions || emptyPermissions());
    setError(null);
  }, [user]);

  const isOwnAccount = String(user.id) === String(currentUserId);

  const save = async () => {
    if (newPassword && newPassword !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUser(user.id, { name: name.trim(), description: description.trim() });
      if (newPassword) {
        await changeUserPassword(user.id, newPassword);
      }
      await setUserPermissions(user.id, scopeId, permissions);
      setNewPassword("");
      setConfirmPassword("");
      setToast(true);
      setTimeout(() => setToast(false), 2500);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-100">Stammdaten</div>
        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Name</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Beschreibung</span>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-100">Passwort ändern</div>
        <div className="grid grid-cols-2 gap-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Neues Passwort</span>
            <input
              type="password"
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leer lassen für keine Änderung"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Bestätigen</span>
            <input
              type="password"
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-100">Berechtigungen</div>
        <div className="grid grid-cols-3 gap-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Benutzerebene</span>
            <select
              className={inputClass}
              value={permissions.UserLevel}
              onChange={(e) => setPermissions({ ...permissions, UserLevel: e.target.value })}
            >
              {USER_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Allgemeine Rechte</span>
            <select
              className={inputClass}
              value={permissions.GeneralPermissions}
              onChange={(e) => setPermissions({ ...permissions, GeneralPermissions: e.target.value })}
            >
              {GENERAL_PERMISSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Bibliotheks-Rechte</span>
            <select
              className={inputClass}
              value={permissions.LibraryPermissions}
              onChange={(e) => setPermissions({ ...permissions, LibraryPermissions: e.target.value })}
            >
              {LIBRARY_PERMISSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>

      <TokensSection userId={user.id} />

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

      {toast && (
        <div className="flex items-center gap-2 text-sm text-green-500">
          <Check size={14} />
          <span>Gespeichert</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowDelete(true)}
          disabled={isOwnAccount}
          title={isOwnAccount ? "Der eigene Account kann nicht gelöscht werden" : undefined}
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={16} />
          <span>Löschen</span>
        </button>
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          <Save size={16} />
          <span>{saving ? "Wird gespeichert…" : "Speichern"}</span>
        </button>
      </div>

      {showDelete && (
        <DeleteUserDialog
          user={user}
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            await deleteUser(user.id);
            setShowDelete(false);
            onDeleted?.();
          }}
        />
      )}
    </div>
  );
}

export default function Users({ onNavigate }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getUsers();
      setUsers(list);
      return list;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (selectedId == null) {
      setSelectedUser(null);
      return;
    }
    getAdminUserById(selectedId)
      .then(setSelectedUser)
      .catch((err) => setError(err.message));
  }, [selectedId]);

  const handleCreate = async (data) => {
    const created = await createUser(data);
    await loadUsers();
    setShowNew(false);
    setSelectedId(created.id);
  };

  const handleSaved = () => {
    loadUsers();
    getAdminUserById(selectedId).then(setSelectedUser).catch(() => {});
  };

  const handleDeleted = () => {
    setSelectedId(null);
    loadUsers();
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      <Sidebar activePage="users" onNavigate={onNavigate} user={currentUser} />

      <div className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-100">Benutzer</h2>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500"
          >
            <Plus size={13} />
            <span>Neu</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && <div className="px-4 py-4 text-sm text-zinc-500">Lädt…</div>}
          {error && !loading && (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-red-500">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && users.length === 0 && (
            <div className="px-4 py-4 text-sm text-zinc-600">Keine Benutzer vorhanden</div>
          )}
          {!loading && users.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedId(u.id)}
              className={`flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-3 text-left transition-colors ${
                String(selectedId) === String(u.id) ? "bg-zinc-800" : "hover:bg-zinc-800/50"
              }`}
            >
              <UserCircle size={20} className="shrink-0 text-zinc-600" />
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-100">{u.name}</div>
                {u.description && (
                  <div className="truncate text-xs text-zinc-500">{u.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <UsersIcon size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Benutzer-Verwaltung</h1>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-6 py-6">
          {selectedUser ? (
            <UserDetail
              key={selectedUser.id}
              user={selectedUser}
              currentUserId={currentUser?.id}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              Benutzer auswählen oder neu anlegen
            </div>
          )}
        </div>
      </main>

      {showNew && <NewUserDialog onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </div>
  );
}
