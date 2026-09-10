// ---- folders ----
//
// Folders are a flat parent-lookup via getFolders(parentId), not a
// tree/CRUD-first API like sqlRepository.js's folders table — getFolderTree/
// getFolderById build the tree/single-folder shape on top of that flat
// list client-side.
//
// getFolderChildren(id) (folders + items composed) stays in apiRepository.js
// (the facade), not here — it needs getItemsByFolder() from apiItems.js,
// and apiItems.js in turn needs getFolders() from this file (for
// getItemFolders()), so keeping that one composition in the facade avoids
// a circular require between apiFolders.js and apiItems.js.

const { apiRequest } = require("./apiClient");

function rowToFolder(apiFolder) {
  if (!apiFolder) return null;
  return {
    id: apiFolder.ID,
    name: apiFolder.Name || "",
    parentId: apiFolder.Parent === "root" || apiFolder.Parent == null ? null : apiFolder.Parent,
  };
}

async function getFolders(parentId) {
  const query = parentId != null ? { parent: parentId } : {};
  const data = await apiRequest("GET", "/api/v1/folders", { query });
  const list = Array.isArray(data) ? data : data?.Folders || [];
  return list.map(rowToFolder);
}

// Builds the same nested { id, name, parentId, children } tree shape as
// sqlRepository.js's getFolderTree(), from getFolders()'s flat list (which
// already normalizes parentId to null for root, matching rowToFolder there).
async function getFolderTree() {
  const all = await getFolders();
  const byParent = (parentId) =>
    all
      .filter((f) => f.parentId === parentId)
      .map((f) => ({ ...f, children: byParent(f.id) }));
  return byParent(null);
}

// No single-folder endpoint in the API (see docs/MAIRLISTDB-API.md) —
// getFolders() already fetches the complete 155-folder tree in one
// request, so look the id up in that flat list rather than adding a
// second round-trip.
async function getFolderById(id) {
  const all = await getFolders();
  return all.find((f) => String(f.id) === String(id)) ?? null;
}

// Folder CRUD — VERIFIZIERT live gegen den mAirListDB Server (siehe
// docs/MAIRLISTDB-API.md):
//   POST   /api/v1/folders?station=1        Body: { Name, Parent } -> { Parent, ID, Name }
//   PUT    /api/v1/folders/<id>?station=1   Body: { Name, Parent } -> null (dient sowohl
//          Umbenennen als auch Verschieben, je nachdem welches Feld sich ändert)
//   DELETE /api/v1/folders/<id>?station=1   -> null
// `Parent` ist bei Top-Level-Ordnern der String "root" (siehe rowToFolder),
// intern wird das als parentId: null repräsentiert — beim Schreiben also
// zurückkonvertieren.
function parentIdToApi(parentId) {
  return parentId == null ? "root" : String(parentId);
}

async function createFolder(name, parentId) {
  const data = await apiRequest("POST", "/api/v1/folders", {
    body: { Name: name, Parent: parentIdToApi(parentId) },
  });
  return rowToFolder(data);
}

async function renameFolder(id, newName) {
  const current = await getFolderById(id);
  if (!current) return null;
  await apiRequest("PUT", `/api/v1/folders/${encodeURIComponent(id)}`, {
    body: { Name: newName, Parent: parentIdToApi(current.parentId) },
  });
  return getFolderById(id);
}

async function moveFolder(id, newParentId) {
  const current = await getFolderById(id);
  if (!current) return null;
  await apiRequest("PUT", `/api/v1/folders/${encodeURIComponent(id)}`, {
    body: { Name: current.name, Parent: parentIdToApi(newParentId) },
  });
  return getFolderById(id);
}

async function deleteFolder(id) {
  await apiRequest("DELETE", `/api/v1/folders/${encodeURIComponent(id)}`);
  return "ok";
}

module.exports = {
  rowToFolder,
  getFolders,
  getFolderTree,
  getFolderById,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
};
