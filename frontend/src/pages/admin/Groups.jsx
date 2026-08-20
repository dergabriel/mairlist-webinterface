import { useState, useEffect, useCallback } from "react";
import {
  Tag, Plus, Trash2, Save,
  AlertTriangle, X, Check, UserCircle,
} from "lucide-react";
import {
  getGroups, getAdminGroupById, createGroup, updateGroup, deleteGroup,
  addGroupMember, removeGroupMember, setGroupPermissions, getUsers,
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

function NewGroupDialog({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), description: description.trim() });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Neue Gruppe" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Name</span>
          <input
            className={inputClass}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Gruppenname"
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

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Gruppe konnte nicht angelegt werden: {error}</span>
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
            disabled={saving || !name.trim()}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {saving ? "Wird angelegt…" : "Anlegen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteGroupDialog({ group, onClose, onConfirm }) {
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
    <Modal title="Gruppe löschen" onClose={onClose}>
      <p className="text-sm text-zinc-300">
        Soll die Gruppe <span className="font-medium text-zinc-100">{group.name}</span> wirklich gelöscht werden?
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

function MembersSection({ group, allUsers, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState(null);

  const memberIds = new Set((group.members || []).map((m) => m.id));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  const addMember = async () => {
    if (!selectedUserId) return;
    setError(null);
    try {
      await addGroupMember(group.id, selectedUserId);
      setSelectedUserId("");
      setAdding(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  const removeMember = async (userId) => {
    setError(null);
    try {
      await removeGroupMember(group.id, userId);
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <span className="text-sm font-semibold text-zinc-100">Mitglieder</span>
        <button
          onClick={() => setAdding(true)}
          disabled={availableUsers.length === 0}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          <Plus size={13} />
          <span>User hinzufügen</span>
        </button>
      </div>

      <div className="px-5 py-5">
        {adding && (
          <div className="mb-4 flex items-center gap-2">
            <select
              className={inputClass}
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              autoFocus
            >
              <option value="">Benutzer wählen…</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button
              onClick={addMember}
              disabled={!selectedUserId}
              className="shrink-0 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
            >
              Hinzufügen
            </button>
            <button
              onClick={() => { setAdding(false); setSelectedUserId(""); }}
              className="shrink-0 rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Abbrechen
            </button>
          </div>
        )}

        {error && (
          <div className="mb-3 flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>{error}</span>
          </div>
        )}

        {(group.members || []).length === 0 && (
          <div className="text-sm text-zinc-600">Keine Mitglieder vorhanden</div>
        )}

        {(group.members || []).length > 0 && (
          <div className="space-y-2">
            {group.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserCircle size={16} className="shrink-0 text-zinc-600" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">{m.name}</div>
                    {m.description && (
                      <div className="truncate text-xs text-zinc-500">{m.description}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeMember(m.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
                >
                  <Trash2 size={13} />
                  <span>Entfernen</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupDetail({ group, allUsers, onSaved, onDeleted }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [permissions, setPermissions] = useState(
    () => group.scopes?.[0]?.permissions || emptyPermissions()
  );
  const scopeId = group.scopes?.[0]?.scopeId ?? 1;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setName(group.name);
    setDescription(group.description || "");
    setPermissions(group.scopes?.[0]?.permissions || emptyPermissions());
    setError(null);
  }, [group]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateGroup(group.id, { name: name.trim(), description: description.trim() });
      await setGroupPermissions(group.id, scopeId, permissions);
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

      <MembersSection group={group} allUsers={allUsers} onChanged={onSaved} />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-100">Permissions</div>
        <div className="grid grid-cols-3 gap-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">UserLevel</span>
            <select
              className={inputClass}
              value={permissions.UserLevel}
              onChange={(e) => setPermissions({ ...permissions, UserLevel: e.target.value })}
            >
              {USER_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">GeneralPermissions</span>
            <select
              className={inputClass}
              value={permissions.GeneralPermissions}
              onChange={(e) => setPermissions({ ...permissions, GeneralPermissions: e.target.value })}
            >
              {GENERAL_PERMISSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">LibraryPermissions</span>
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
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
        >
          <Trash2 size={16} />
          <span>Gruppe löschen</span>
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
        <DeleteGroupDialog
          group={group}
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            await deleteGroup(group.id);
            setShowDelete(false);
            onDeleted?.();
          }}
        />
      )}
    </div>
  );
}

export default function Groups({ onNavigate }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getGroups();
      setGroups(list);
      return list;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
    getUsers().then(setAllUsers).catch(() => {});
  }, [loadGroups]);

  useEffect(() => {
    if (selectedId == null) {
      setSelectedGroup(null);
      return;
    }
    getAdminGroupById(selectedId)
      .then(setSelectedGroup)
      .catch((err) => setError(err.message));
  }, [selectedId]);

  const handleCreate = async (data) => {
    const created = await createGroup(data);
    await loadGroups();
    setShowNew(false);
    setSelectedId(created.id);
  };

  const handleSaved = () => {
    loadGroups();
    getAdminGroupById(selectedId).then(setSelectedGroup).catch(() => {});
  };

  const handleDeleted = () => {
    setSelectedId(null);
    loadGroups();
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      <Sidebar activePage="groups" onNavigate={onNavigate} user={user} />

      <div className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-100">Gruppen</h2>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500"
          >
            <Plus size={13} />
            <span>Neue Gruppe</span>
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
          {!loading && !error && groups.length === 0 && (
            <div className="px-4 py-4 text-sm text-zinc-600">Keine Gruppen vorhanden</div>
          )}
          {!loading && groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedId(g.id)}
              className={`flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-3 text-left transition-colors ${
                String(selectedId) === String(g.id) ? "bg-zinc-800" : "hover:bg-zinc-800/50"
              }`}
            >
              <Tag size={20} className="shrink-0 text-zinc-600" />
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-100">{g.name}</div>
                {g.description && (
                  <div className="truncate text-xs text-zinc-500">{g.description}</div>
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
              <Tag size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Gruppen-Verwaltung</h1>
          </div>
        </header>

        <div className="flex-1 overflow-auto px-6 py-6">
          {selectedGroup ? (
            <GroupDetail
              key={selectedGroup.id}
              group={selectedGroup}
              allUsers={allUsers}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              Gruppe auswählen oder neu anlegen
            </div>
          )}
        </div>
      </main>

      {showNew && <NewGroupDialog onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </div>
  );
}
