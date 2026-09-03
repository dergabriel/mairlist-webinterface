// API client for the library endpoints (see server/routes/library.js).
// Vite proxies /api to the backend on port 3001.

async function request(path, options) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    // Strukturierte Fehlermeldung vom Server nutzen, Fallback auf HTTP-Status
    let message;
    try {
      const body = await res.json();
      message = body.error || `${res.status} ${res.statusText}`;
    } catch {
      message = `${res.status} ${res.statusText}`;
    }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

const jsonRequest = (method) => (path, data) =>
  request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

const post = jsonRequest("POST");
const put = jsonRequest("PUT");

const qs = (params) => {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
};

export function getTree() {
  return request("/tree");
}

export function getFolderChildren(id) {
  return request(`/folders/${id}/children`);
}

export function createFolder(name, parentId) {
  return post("/folders", { name, parentId });
}

export function renameFolder(id, name) {
  return put(`/folders/${id}`, { name });
}

export function moveFolder(id, newParentId) {
  return put(`/folders/${id}/move`, { newParentId });
}

export function deleteFolder(id) {
  return request(`/folders/${id}`, { method: "DELETE" });
}

export function getStorages() {
  return request("/storages");
}

export function createStorage(name, path) {
  return post("/storages", { name, path });
}

export function updateStorage(id, name, path) {
  return put(`/storages/${id}`, { name, path });
}

export function deleteStorage(id) {
  return request(`/storages/${id}`, { method: "DELETE" });
}

export function getAttributeKeys() {
  return request("/attributes");
}

export function getArtists() {
  return request("/artists");
}

export function getItemTypes() {
  return request("/types");
}

export function getItems({ type, artist, folderId, storageId, attributeKey, attributeValue } = {}) {
  return request(`/items${qs({ type, artist, folderId, storageId, attributeKey, attributeValue })}`);
}

export function getItemById(id) {
  return request(`/items/${id}`);
}

export function getItemHistory(id) {
  return request(`/items/${id}/history`);
}

export function getAudioUrl(itemId) {
  return `/api/items/${itemId}/audio`;
}

export function searchItems(q, fields) {
  return request(`/search${qs({ q, fields: fields ? fields.join(",") : undefined })}`);
}

export function getCuePoints() {
  return request("/cuepoints");
}

export function getAttributeDefinitions() {
  return request("/attributes/definitions");
}

export function createItem(data) {
  return post("/items", data);
}

export function updateItem(id, data) {
  return put(`/items/${id}`, data);
}

export function moveItemToFolder(id, folderId) {
  return put(`/items/${id}/folder`, { folderId });
}

export function deleteItem(id) {
  return request(`/items/${id}`, { method: "DELETE" });
}

export function uploadFile({ file, storageId, title }) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("storageId", storageId);
  if (title) formData.append("title", title);
  return request("/upload", { method: "POST", body: formData });
}

export function getPlaylistsByDate(date) {
  return request(`/playlists${qs({ date })}`);
}

export function getPlaylistById(id) {
  return request(`/playlists/${id}`);
}

export function reorderPlaylist(id, order) {
  return put(`/playlists/${id}/reorder`, { order });
}

export function insertPlaylistItem(id, { itemId, afterPosition }) {
  return post(`/playlists/${id}/items`, { itemId, afterPosition });
}

export function removePlaylistItem(id, position) {
  return request(`/playlists/${id}/items/${position}`, { method: "DELETE" });
}

export function savePlaylistItemOverrides(id, position, overrides) {
  return put(`/playlists/${id}/items/${position}/overrides`, { overrides });
}

export function getLogs({ date, limit, offset } = {}) {
  return request(`/logs${qs({ date, limit, offset })}`);
}

export function getDashboard() {
  return request("/dashboard");
}

export function getSettings() {
  return request("/settings");
}

export function saveSettings(data) {
  return put("/settings", data);
}

export function getUsers() {
  return request("/auth/admin/users");
}

export function getAdminUserById(id) {
  return request(`/auth/admin/users/${id}`);
}

export function createUser(data) {
  return post("/auth/admin/users", data);
}

export function updateUser(id, data) {
  return put(`/auth/admin/users/${id}`, data);
}

export function deleteUser(id) {
  return request(`/auth/admin/users/${id}`, { method: "DELETE" });
}

export function changeUserPassword(id, password) {
  return put(`/auth/admin/users/${id}/password`, { password });
}

export function setUserRole(id, role) {
  return put(`/auth/admin/users/${id}/permissions`, { role });
}

export function getUserTokens(id) {
  return request(`/auth/admin/users/${id}/tokens`);
}

export function createUserToken(id) {
  return post(`/auth/admin/users/${id}/tokens`, {});
}

export function deleteUserToken(id, tokenId) {
  return request(`/auth/admin/users/${id}/tokens/${tokenId}`, { method: "DELETE" });
}

