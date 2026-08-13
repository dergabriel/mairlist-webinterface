// API client for the library endpoints (see server/routes/library.js).
// Vite proxies /api to the backend on port 3001.

async function request(path, options) {
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
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

export function getItems({ type, artist, folderId, storageId } = {}) {
  return request(`/items${qs({ type, artist, folderId, storageId })}`);
}

export function getItemById(id) {
  return request(`/items/${id}`);
}

export function getItemHistory(id) {
  return request(`/items/${id}/history`);
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

export function deleteItem(id) {
  return request(`/items/${id}`, { method: "DELETE" });
}
