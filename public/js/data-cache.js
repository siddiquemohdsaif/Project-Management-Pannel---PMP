const CACHE_VERSION = "pmp-data-v2";
let warmupPromise = null;
const taskWarmups = new Map();

export const dataCacheKeys = {
  activities: "activities",
  members: "members",
  projects: "projects",
  tasks: (projectId) => `tasks:${projectId}`
};

export function readDataCache(key, fallback = null) {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheStorageKey(key)) || "null");
    return cached?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeDataCache(key, value) {
  try {
    localStorage.setItem(cacheStorageKey(key), JSON.stringify({
      updatedAt: Date.now(),
      value
    }));
  } catch {
    // The live API remains the source of truth if storage is unavailable.
  }
  return value;
}

export function warmDataCache() {
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    const cachedProjects = readDataCache(dataCacheKeys.projects, []);
    const activeProjectId = localStorage.getItem("activeProjectId") || cachedProjects[0]?.id || "";
    const taskWarmup = activeProjectId ? refreshTasks(activeProjectId) : Promise.resolve();

    const [projects] = await Promise.all([
      refreshCollection("/api/projects?progress=false", "projects", dataCacheKeys.projects),
      refreshCollection("/api/members", "members", dataCacheKeys.members),
      taskWarmup
    ]);

    if (!activeProjectId && projects?.[0]?.id) await refreshTasks(projects[0].id);
  })().catch(() => {}).finally(() => { warmupPromise = null; });
  return warmupPromise;
}

export function warmProjectTasks(projectId) {
  if (!projectId) return Promise.resolve(null);
  const cachedTasks = readDataCache(dataCacheKeys.tasks(projectId));
  if (Array.isArray(cachedTasks)) return Promise.resolve(cachedTasks);
  if (taskWarmups.has(projectId)) return taskWarmups.get(projectId);
  const warmup = refreshTasks(projectId).finally(() => taskWarmups.delete(projectId));
  taskWarmups.set(projectId, warmup);
  return warmup;
}

function cacheStorageKey(key) {
  let userKey = "anonymous";
  try {
    const user = JSON.parse(localStorage.getItem("pmpUser") || "null");
    userKey = String(user?.email || user?.uid || "anonymous").trim().toLowerCase();
  } catch {
    // Keep anonymous namespace when the stored profile cannot be read.
  }
  return `${CACHE_VERSION}:${userKey}:${key}`;
}

async function refreshTasks(projectId) {
  return refreshCollection(
    `/api/projects/${encodeURIComponent(projectId)}/tasks`,
    "tasks",
    dataCacheKeys.tasks(projectId)
  );
}

async function refreshCollection(url, field, key) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return null;
  const result = await response.json();
  const value = Array.isArray(result[field]) ? result[field] : [];
  writeDataCache(key, value);
  return value;
}
