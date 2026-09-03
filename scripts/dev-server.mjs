import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const publicRoot = join(process.cwd(), "public");
const port = Number(process.env.PORT || 3000);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp"
};

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const env = readFileSync(envPath, "utf8");
  env.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function readFirebaseApiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  const configPath = join(publicRoot, "js", "firebase-config.js");
  if (!existsSync(configPath)) return "";
  const configSource = readFileSync(configPath, "utf8");
  const match = configSource.match(/apiKey:\s*["']([^"']+)["']/);
  return match?.[1]?.startsWith("YOUR_") ? "" : match?.[1] || "";
}

function readCloudsw3Config() {
  if (process.env.CLOUDSW3_APP_URL && process.env.CLOUDSW3_AUTHORIZATION_TOKEN) {
    return {
      appUrl: process.env.CLOUDSW3_APP_URL,
      authorizationToken: process.env.CLOUDSW3_AUTHORIZATION_TOKEN
    };
  }

  const configFile = process.env.PRODUCTION_TYPE === "release"
    ? "config-cloudsw3.json"
    : "config-cloudsw3_dev.json";
  const configPath = join(process.cwd(), "sdks", "Firestore", configFile);

  if (!existsSync(configPath)) {
    throw new Error(`Missing CloudSW3 config file: sdks/Firestore/${configFile}`);
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (!config.appUrl || !config.authorizationToken) {
    throw new Error(`CloudSW3 config is missing appUrl or authorizationToken: sdks/Firestore/${configFile}`);
  }

  return config;
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function staticCacheControl(requestPath, extension) {
  if (requestPath.startsWith("/project_icons/") || requestPath.startsWith("/profile_photos/")) {
    return "public, max-age=31536000, immutable";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".ico"].includes(extension)) {
    return "public, max-age=604800, stale-while-revalidate=86400";
  }
  return "no-cache";
}

function parseResponseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responseErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  return data.message || data.error || fallback;
}

function publicUserDocument(firebaseUser, existingUser) {
  const provider = firebaseUser.providerUserInfo?.find((item) => item.providerId === "google.com") || {};
  const email = firebaseUser.email.trim().toLowerCase();
  const photoURL = existingUser?.photoURL || existingUser?.photoUrl || firebaseUser.photoUrl || firebaseUser.photoURL || provider.photoUrl || provider.photoURL || "";
  const now = formatIndiaDateTime();

  return {
    uid: firebaseUser.localId,
    email,
    name: existingUser?.name || firebaseUser.displayName || provider.displayName || email,
    photoURL,
    createdAt: existingUser?.createdAt || now,
    lastLoginAt: now,
  };
}

function formatIndiaDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month} ${parts.day} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function userDocIdFromEmail(email) {
  return email
    .trim()
    .toLowerCase()
    .replace(/\./g, "<dot>")
    .replace(/[\s/`]/g, "_");
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function imageExtension(mimeType) {
  return {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[mimeType] || "";
}

function parseProfilePhotoPayload(profilePhotoBase64, mimeType) {
  let cleanBase64 = String(profilePhotoBase64 || "").trim();
  let cleanMimeType = String(mimeType || "").trim().toLowerCase();
  const dataUrlMatch = cleanBase64.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (dataUrlMatch) {
    cleanMimeType = dataUrlMatch[1].toLowerCase();
    cleanBase64 = dataUrlMatch[2];
  }

  const extension = imageExtension(cleanMimeType);
  if (!extension) throw new Error("Profile photo must be a JPG, PNG, or WebP image.");
  if (!cleanBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
    throw new Error("Profile photo data is not valid.");
  }

  const imageBuffer = Buffer.from(cleanBase64, "base64");
  if (!imageBuffer.length) throw new Error("Profile photo is empty.");
  if (imageBuffer.length > 2 * 1024 * 1024) throw new Error("Profile photo must be 2 MB or smaller.");
  return { imageBuffer, extension };
}

function parseImagePayload(imageBase64, mimeType, label = "Image") {
  let cleanBase64 = String(imageBase64 || "").trim();
  let cleanMimeType = String(mimeType || "").trim().toLowerCase();
  const dataUrlMatch = cleanBase64.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
  if (dataUrlMatch) {
    cleanMimeType = dataUrlMatch[1].toLowerCase();
    cleanBase64 = dataUrlMatch[2];
  }

  const extension = imageExtension(cleanMimeType);
  if (!extension) throw new Error(`${label} must be a JPG, PNG, or WebP image.`);
  if (!cleanBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleanBase64)) {
    throw new Error(`${label} data is not valid.`);
  }

  const imageBuffer = Buffer.from(cleanBase64, "base64");
  if (!imageBuffer.length) throw new Error(`${label} is empty.`);
  if (imageBuffer.length > 2 * 1024 * 1024) throw new Error(`${label} must be 2 MB or smaller.`);
  return { imageBuffer, extension };
}

async function verifyFirebaseIdToken(idToken) {
  const apiKey = readFirebaseApiKey();
  if (!apiKey) throw new Error("Missing Firebase apiKey. Add it in public/js/firebase-config.js or FIREBASE_API_KEY.");

  const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });

  const payload = await verifyResponse.json();
  if (!verifyResponse.ok || !payload.users?.[0]?.email) {
    throw new Error(payload.error?.message || "Firebase login token could not be verified.");
  }
  return payload.users[0];
}

async function cloudsw3Request(path, options = {}) {
  const { appUrl, authorizationToken } = readCloudsw3Config();

  const requestUrl = `${appUrl.replace(/\/+$/, "")}/rest-api/${path}`;
  const response = await fetch(requestUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authorizationToken}`,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = parseResponseBody(text);
  if (!response.ok) {
    throw new Error(responseErrorMessage(data, response.statusText));
  }
  if (typeof data === "string" && data.trim().toLowerCase().startsWith("failed")) {
    throw new Error(data.trim());
  }
  return data;
}

async function readCloudsw3User(userDocId) {
  return cloudsw3Request(`rd?parentPath=/&collName=Users&docName=${encodeURIComponent(userDocId)}`);
}

async function readCloudsw3Collection(collName, parentPath = "/", pageSize = 500) {
  const data = await cloudsw3Request(`rcdsp?collName=${encodeURIComponent(collName)}&parentPath=${encodeURIComponent(parentPath)}`, {
    method: "POST",
    body: JSON.stringify({ lastDocId: "0", pageSize, projection: {} })
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.docs)) return data.docs;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function readCloudsw3Users() {
  return readCloudsw3Collection("Users", "/");
}

async function readCloudsw3Activities() {
  return readCloudsw3Collection("Activities", "/");
}

async function readCloudsw3AttendanceSessions() {
  return readCloudsw3Collection("AttendanceSessions", "/", 1000);
}

async function readCloudsw3AttendanceRemarks() {
  return readCloudsw3Collection("AttendanceRemarks", "/", 1000);
}

async function readCloudsw3CompanyHolidays() {
  return readCloudsw3Collection("CompanyHolidays", "/", 1000);
}

async function createCloudsw3Activity(activity) {
  return cloudsw3Request("cr?collName=Activities&parentPath=/", {
    method: "POST",
    body: JSON.stringify(activity)
  });
}

async function createCloudsw3AttendanceSession(session) {
  return cloudsw3Request("cr?collName=AttendanceSessions&parentPath=/", {
    method: "POST",
    body: JSON.stringify(session)
  });
}

async function updateCloudsw3AttendanceSession(sessionDocId, session) {
  return cloudsw3Request("upd?collName=AttendanceSessions&parentPath=/", {
    method: "POST",
    body: JSON.stringify({ ...session, _id: sessionDocId })
  });
}

async function upsertCloudsw3RootDocument(collName, doc) {
  try {
    return await cloudsw3Request(`upd?collName=${encodeURIComponent(collName)}&parentPath=/`, {
      method: "POST",
      body: JSON.stringify(doc)
    });
  } catch {
    return cloudsw3Request(`cr?collName=${encodeURIComponent(collName)}&parentPath=/`, {
      method: "POST",
      body: JSON.stringify(doc)
    });
  }
}

async function createCloudsw3User(userDocId, user) {
  return cloudsw3Request(`cr?collName=Users&parentPath=/`, {
    method: "POST",
    body: JSON.stringify({ ...user, _id: userDocId })
  });
}

async function updateCloudsw3User(userDocId, user) {
  return cloudsw3Request(`upd?collName=Users&parentPath=/`, {
    method: "POST",
    body: JSON.stringify({ ...user, _id: userDocId })
  });
}

async function readCloudsw3Projects() {
  return readCloudsw3Collection("Projects", "/");
}

async function readCloudsw3Project(projectDocId) {
  return cloudsw3Request(`rd?parentPath=/&collName=Projects&docName=${encodeURIComponent(projectDocId)}`);
}

async function createCloudsw3Project(project) {
  return cloudsw3Request(`cr?collName=Projects&parentPath=/`, {
    method: "POST",
    body: JSON.stringify(project)
  });
}

async function updateCloudsw3Project(projectDocId, project) {
  return cloudsw3Request(`upd?collName=Projects&parentPath=/`, {
    method: "POST",
    body: JSON.stringify({ ...project, _id: projectDocId })
  });
}

async function readCloudsw3Tasks(projectDocId) {
  return readCloudsw3Collection("Tasks", `/Projects/${projectDocId}`);
}

async function readCloudsw3Task(projectDocId, taskDocId) {
  return cloudsw3Request(`rd?parentPath=/Projects/${encodeURIComponent(projectDocId)}&collName=Tasks&docName=${encodeURIComponent(taskDocId)}`);
}

async function createCloudsw3Task(projectDocId, task) {
  return cloudsw3Request(`cr?collName=Tasks&parentPath=/Projects/${encodeURIComponent(projectDocId)}`, {
    method: "POST",
    body: JSON.stringify(task)
  });
}

async function updateCloudsw3Task(projectDocId, taskDocId, task) {
  return cloudsw3Request(`upd?collName=Tasks&parentPath=/Projects/${encodeURIComponent(projectDocId)}`, {
    method: "POST",
    body: JSON.stringify({ ...task, _id: taskDocId })
  });
}

async function deleteCloudsw3Task(projectDocId, taskDocId) {
  return cloudsw3Request(`deld?collName=Tasks&parentPath=/Projects/${encodeURIComponent(projectDocId)}&docName=${encodeURIComponent(taskDocId)}`);
}

function projectDocIdFromName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
  return `${base}-${Date.now().toString(36)}`;
}

function activityDocId() {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function cleanActorEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function recordActivity(activity) {
  const actorEmail = cleanActorEmail(activity.actor_email);
  if (!actorEmail) return;
  await createCloudsw3Activity({
    _id: activityDocId(),
    event_type: String(activity.event_type || "activity").trim(),
    actor_email: actorEmail,
    project_id: String(activity.project_id || "").trim(),
    project_name: String(activity.project_name || "").trim(),
    entity_type: String(activity.entity_type || "").trim(),
    entity_id: String(activity.entity_id || "").trim(),
    entity_name: String(activity.entity_name || "").trim(),
    summary: String(activity.summary || "Activity recorded").trim(),
    changes: activity.changes && typeof activity.changes === "object" ? activity.changes : {},
    metadata: activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {},
    created_at: new Date().toISOString()
  });
}

async function recordActivitiesSafely(activities) {
  await Promise.all((Array.isArray(activities) ? activities : [activities]).map(async (activity) => {
    try {
      await recordActivity(activity);
    } catch (error) {
      console.error("Activity record failed:", error.message || error);
    }
  }));
}

function publicActivityDocument(activity, usersByEmail = new Map(), projectsById = new Map()) {
  const actorEmail = cleanActorEmail(activity.actor_email);
  const member = usersByEmail.get(actorEmail);
  const project = projectsById.get(activity.project_id);
  return {
    id: activity._id || activity.id || "",
    event_type: activity.event_type || "activity",
    actor_email: actorEmail,
    actor_name: member?.name || actorEmail || "Unknown user",
    actor_profile_url: member?.photoURL || member?.profile_url || "",
    project_id: activity.project_id || "",
    project_name: activity.project_name || "",
    project_icon_url: project?.project_icon_url || "",
    entity_type: activity.entity_type || "",
    entity_id: activity.entity_id || "",
    entity_name: activity.entity_name || "",
    summary: activity.summary || "Activity recorded",
    changes: activity.changes && typeof activity.changes === "object" ? activity.changes : {},
    metadata: activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {},
    created_at: activity.created_at || ""
  };
}

function normalizeProjectStatus(status) {
  const value = String(status || "active").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  return ["active", "on_hold", "archived", "completed"].includes(value) ? value : "active";
}

function normalizeProjectPlatform(platform) {
  const value = String(platform || "Android").trim();
  return ["Android", "iOS", "Web", "Node", "Webapp", "Other"].includes(value) ? value : "Other";
}

function publicProjectDocument(project) {
  const memberEmails = Array.isArray(project.member_emails)
    ? project.member_emails.map((member) => typeof member === "string" ? member : member?.email || member?.user_email || member?.name || "").filter(Boolean)
    : [];
  return {
    id: project._id || project.id || "",
    project_name: project.project_name || project.name || "",
    platform: project.platform || "Android",
    project_icon_url: project.project_icon_url || project.iconUrl || "",
    member_emails: memberEmails,
    status: normalizeProjectStatus(project.status),
    task_count: Number(project.task_count || 0),
    progress_percent: Number(project.progress_percent || 0),
    created_by: project.created_by || "",
    created_at: project.created_at || "",
    updated_at: project.updated_at || ""
  };
}

async function publicProjectDocumentWithProgress(project) {
  const publicProject = publicProjectDocument(project);
  if (!publicProject.id) return publicProject;
  try {
    const tasks = await readCloudsw3Tasks(publicProject.id);
    const taskList = Array.isArray(tasks) ? tasks.map(publicTaskDocument) : [];
    const completedCount = taskList.filter((task) => task.status === "Completed").length;
    publicProject.task_count = taskList.length;
    publicProject.progress_percent = taskList.length ? Math.round((completedCount / taskList.length) * 100) : 0;
  } catch {
    publicProject.progress_percent = Number(project.progress_percent || 0);
  }
  return publicProject;
}

function taskDocIdFromName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
  return `${base}-${Date.now().toString(36)}`;
}

function normalizeTaskStatus(status) {
  const value = String(status || "Not Started").trim();
  return ["Not Started", "In Progress", "Partially Completed", "Completed", "Blocked"].includes(value) ? value : "Not Started";
}

function normalizeTaskPriority(priority) {
  const value = String(priority || "Medium").trim();
  return ["Low", "Medium", "High"].includes(value) ? value : "Medium";
}

function normalizeTaskDate(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const date = new Date(`${clean}T00:00:00`);
  if (!Number.isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? clean : parsed.toISOString().slice(0, 10);
}

function normalizeAssignees(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items
    .map((email) => String(email || "").trim().toLowerCase())
    .filter((email) => email && email.includes("@")))];
}

function publicTaskDocument(task) {
  return {
    id: task._id || task.id || "",
    main_task_name: task.main_task_name || task.main_project_name || task.name || "",
    description: task.description || "",
    status: normalizeTaskStatus(task.status),
    assignee: normalizeAssignees(task.assignee),
    start_date: normalizeTaskDate(task.start_date),
    due_date: normalizeTaskDate(task.due_date),
    priority: normalizeTaskPriority(task.priority),
    sub_tasks: Array.isArray(task.sub_tasks) ? task.sub_tasks.map((subtask) => ({
      sub_task_name: subtask.sub_task_name || subtask.name || "",
      status: normalizeTaskStatus(subtask.status),
      assignee: normalizeAssignees(subtask.assignee),
      start_date: normalizeTaskDate(subtask.start_date),
      due_date: normalizeTaskDate(subtask.due_date),
      priority: normalizeTaskPriority(subtask.priority)
    })) : [],
    dependency_tasks: Array.isArray(task.dependency_tasks) ? task.dependency_tasks.map((dependency) => ({
      dependency_task_id: dependency.dependency_task_id || dependency.id || "",
      dependency_task_name: dependency.dependency_task_name || dependency.name || ""
    })) : [],
    created_by: task.created_by || "",
    created_at: task.created_at || "",
    completed_at: task.completed_at || "",
    updated_at: task.updated_at || ""
  };
}

function cleanTaskPayload(payload, existingTask = {}) {
  const taskName = String(payload.main_task_name || payload.main_project_name || "").trim();
  if (!taskName) throw new Error("Task name is required.");
  if (taskName.length > 80) throw new Error("Task name must be 80 characters or fewer.");
  const assignee = normalizeAssignees(payload.assignee);
  if (!assignee.length) throw new Error("Choose a task assignee.");

  const subTasks = (Array.isArray(payload.sub_tasks) ? payload.sub_tasks : []).map((subtask) => {
    const startDate = normalizeTaskDate(subtask.start_date);
    const dueDate = normalizeEndDate(startDate, normalizeTaskDate(subtask.due_date));
    return {
      sub_task_name: String(subtask.sub_task_name || "").trim(),
      status: normalizeTaskStatus(subtask.status),
      assignee: normalizeAssignees(subtask.assignee),
      start_date: startDate,
      due_date: dueDate,
      priority: normalizeTaskPriority(subtask.priority)
    };
  }).filter((subtask) => subtask.sub_task_name);
  let status = normalizeTaskStatus(payload.status);
  if (status === "Completed") {
    subTasks.forEach((subtask) => { subtask.status = "Completed"; });
  }
  const previousStatus = normalizeTaskStatus(existingTask.status);
  let completedAt = String(existingTask.completed_at || "").trim();
  if (status === "Completed" && (previousStatus !== "Completed" || !completedAt)) {
    completedAt = new Date().toISOString();
  } else if (status !== "Completed") {
    completedAt = "";
  }
  const startDate = normalizeTaskDate(payload.start_date);
  const dueDate = normalizeEndDate(startDate, normalizeMainDueDate(normalizeTaskDate(payload.due_date), subTasks));

  return {
    ...existingTask,
    main_task_name: taskName,
    description: String(payload.description || "").trim(),
    status,
    completed_at: completedAt,
    assignee,
    start_date: startDate,
    due_date: dueDate,
    priority: normalizeTaskPriority(payload.priority),
    sub_tasks: subTasks,
    dependency_tasks: (Array.isArray(payload.dependency_tasks) ? payload.dependency_tasks : []).map((dependency) => ({
      dependency_task_id: String(dependency.dependency_task_id || "").trim(),
      dependency_task_name: String(dependency.dependency_task_name || "").trim()
    })).filter((dependency) => dependency.dependency_task_id || dependency.dependency_task_name)
  };
}

function normalizeEndDate(startDate, dueDate) {
  if (startDate && dueDate && taskDateTime(dueDate) < taskDateTime(startDate)) return startDate;
  return dueDate;
}

function normalizeMainDueDate(mainDueDate, subTasks) {
  const latestSubtaskDueDate = subTasks
    .map((subtask) => subtask.due_date)
    .filter(Boolean)
    .sort((a, b) => taskDateTime(b) - taskDateTime(a))[0] || "";
  if (!latestSubtaskDueDate) return mainDueDate;
  if (!mainDueDate) return latestSubtaskDueDate;
  return taskDateTime(latestSubtaskDueDate) > taskDateTime(mainDueDate) ? latestSubtaskDueDate : mainDueDate;
}

async function handleUserProfile(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { email, name } = await readRequestJson(request);
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(name || "").trim();
    if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("A signed-in user email is required.");
    if (!cleanName) throw new Error("Name is required.");
    if (cleanName.length > 80) throw new Error("Name must be 80 characters or fewer.");

    const userDocId = userDocIdFromEmail(cleanEmail);
    const existingUser = await readCloudsw3User(userDocId);
    const user = { ...existingUser, name: cleanName };
    await updateCloudsw3User(userDocId, user);

    sendJson(response, 200, { user: { ...user, email: user.email || cleanEmail }, userDocId });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Profile update failed." });
  }
}

async function handleUserPhoto(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const idToken = bearerToken(request);
    if (!idToken) throw new Error("Missing Firebase authorization token.");

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const cleanEmail = firebaseUser.email.trim().toLowerCase();
    const userDocId = userDocIdFromEmail(cleanEmail);
    const existingUser = await readCloudsw3User(userDocId);
    if (!existingUser) throw new Error("No user found.");

    const { profilePhotoBase64, mimeType } = await readRequestJson(request);
    const { imageBuffer, extension } = parseProfilePhotoPayload(profilePhotoBase64, mimeType);
    const uploadsDir = join(publicRoot, "profile_photos");
    await mkdir(uploadsDir, { recursive: true });

    const fileName = `${safeFileName(userDocId)}.${extension}`;
    await writeFile(join(uploadsDir, fileName), imageBuffer);

    const photoURL = `/profile_photos/${fileName}?v=${Date.now()}`;
    const user = { ...existingUser, email: existingUser.email || cleanEmail, photoURL };
    await updateCloudsw3User(userDocId, user);

    sendJson(response, 200, { user, photoURL });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Profile photo update failed." });
  }
}

function publicMemberDocument(user) {
  const photoURL = user.photoURL || user.photoUrl || user.profile_url || user.photo_url || user.avatarUrl || "";
  return {
    id: user._id || user.uid || user.id || userDocIdFromEmail(user.email || ""),
    email: user.email || "",
    photoURL,
    profile_url: photoURL,
    photo_url: photoURL,
    name: user.name || user.displayName || "Unnamed user",
    createdAt: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || "",
    status: user.status || "Active",
    role: user.role || "Member"
  };
}

async function saveProjectIcon(projectDocId, iconBase64, mimeType) {
  if (!iconBase64) return "";
  const { imageBuffer, extension } = parseImagePayload(iconBase64, mimeType, "Project icon");
  const uploadsDir = join(publicRoot, "project_icons");
  await mkdir(uploadsDir, { recursive: true });
  const fileName = `${safeFileName(projectDocId)}.${extension}`;
  await writeFile(join(uploadsDir, fileName), imageBuffer);
  return `/project_icons/${fileName}?v=${Date.now()}`;
}

async function knownUserEmails() {
  const users = await readCloudsw3Users();
  return new Set((Array.isArray(users) ? users : [])
    .map((user) => String(user.email || "").trim().toLowerCase())
    .filter(Boolean));
}

function projectStatusLabel(value) {
  return ({ active: "Active", on_hold: "On Hold", archived: "Archived", completed: "Completed" })[normalizeProjectStatus(value)] || "Active";
}

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function taskChangeActivities(existingTask, nextTask, context) {
  const events = [];
  const oldTask = publicTaskDocument(existingTask);
  const newTask = publicTaskDocument(nextTask);
  const base = {
    actor_email: context.actor_email,
    project_id: context.project_id,
    project_name: context.project_name,
    entity_type: "task",
    entity_id: newTask.id,
    entity_name: newTask.main_task_name
  };

  if (oldTask.status !== newTask.status) {
    const autoCompleted = newTask.status === "Completed"
      ? oldTask.sub_tasks.filter((subtask, index) => subtask.status !== "Completed" && newTask.sub_tasks[index]?.status === "Completed").length
      : 0;
    events.push({
      ...base,
      event_type: "task_status_changed",
      summary: `${newTask.main_task_name} moved to ${newTask.status}`,
      changes: { field: "status", from: oldTask.status, to: newTask.status },
      metadata: { auto_completed_subtasks: autoCompleted }
    });
  }

  if (newTask.status !== "Completed") {
    const subtaskCount = Math.max(oldTask.sub_tasks.length, newTask.sub_tasks.length);
    for (let index = 0; index < subtaskCount; index += 1) {
      const before = oldTask.sub_tasks[index];
      const after = newTask.sub_tasks[index];
      if (!before || !after || before.status === after.status) continue;
      events.push({
        ...base,
        event_type: "subtask_status_changed",
        entity_type: "subtask",
        entity_id: `${newTask.id}:${index}`,
        entity_name: after.sub_task_name,
        summary: `${after.sub_task_name} moved to ${after.status}`,
        changes: { field: "status", from: before.status, to: after.status },
        metadata: { parent_task_id: newTask.id, parent_task_name: newTask.main_task_name }
      });
    }
  }

  const changedFields = ["main_task_name", "description", "assignee", "start_date", "due_date", "priority", "dependency_tasks"]
    .filter((field) => !sameJson(oldTask[field], newTask[field]));
  const subtaskShapeChanged = !sameJson(
    oldTask.sub_tasks.map(({ status, ...subtask }) => subtask),
    newTask.sub_tasks.map(({ status, ...subtask }) => subtask)
  );
  if (changedFields.length || subtaskShapeChanged) {
    events.push({
      ...base,
      event_type: "task_updated",
      summary: `${newTask.main_task_name} updated`,
      changes: { fields: [...changedFields, ...(subtaskShapeChanged ? ["sub_tasks"] : [])] },
      metadata: {}
    });
  }
  return events;
}

async function handleActivitiesList(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const [activityDocs, userDocs, projectDocs] = await Promise.all([
      readCloudsw3Activities(),
      readCloudsw3Users(),
      readCloudsw3Projects()
    ]);
    const usersByEmail = new Map((Array.isArray(userDocs) ? userDocs : [])
      .map(publicMemberDocument)
      .filter((member) => member.email)
      .map((member) => [cleanActorEmail(member.email), member]));
    const projectsById = new Map((Array.isArray(projectDocs) ? projectDocs : [])
      .map(publicProjectDocument)
      .filter((project) => project.id)
      .map((project) => [project.id, project]));
    const activities = (Array.isArray(activityDocs) ? activityDocs : [])
      .map((activity) => publicActivityDocument(activity, usersByEmail, projectsById))
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
    sendJson(response, 200, { activities });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Activity could not be loaded." });
  }
}

async function handleProjectsList(request, response) {
  if (request.method === "GET") {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      const includeProgress = requestUrl.searchParams.get("progress") === "true";
      const projects = await readCloudsw3Projects();
      const publicProjects = includeProgress
        ? await Promise.all((Array.isArray(projects) ? projects : []).map(publicProjectDocumentWithProgress))
        : (Array.isArray(projects) ? projects : []).map(publicProjectDocument);
      sendJson(response, 200, { projects: publicProjects });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Projects could not be loaded." });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const payload = await readRequestJson(request);
      const projectName = String(payload.project_name || "").trim();
      if (!projectName) throw new Error("Project name is required.");
      if (projectName.length > 80) throw new Error("Project name must be 80 characters or fewer.");

      const memberEmails = [...new Set((Array.isArray(payload.member_emails) ? payload.member_emails : [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter((email) => email && email.includes("@")))];
      if (!memberEmails.length) throw new Error("Choose at least one project member.");

      const allowedEmails = await knownUserEmails();
      const invalidEmails = memberEmails.filter((email) => !allowedEmails.has(email));
      if (invalidEmails.length) throw new Error("Project members must be existing PMP users.");

      const projectDocId = projectDocIdFromName(projectName);
      const projectIconUrl = await saveProjectIcon(projectDocId, payload.project_icon_base64, payload.project_icon_mime_type);
      const now = formatIndiaDateTime();
      const project = {
        _id: projectDocId,
        project_name: projectName,
        platform: normalizeProjectPlatform(payload.platform),
        project_icon_url: projectIconUrl,
        member_emails: memberEmails,
        status: normalizeProjectStatus(payload.status),
        task_count: 0,
        progress_percent: 0,
        created_by: String(payload.created_by || "").trim().toLowerCase(),
        created_at: now,
        updated_at: now
      };

      await createCloudsw3Project(project);
      await recordActivitiesSafely({
        event_type: "project_created",
        actor_email: project.created_by,
        project_id: projectDocId,
        project_name: projectName,
        entity_type: "project",
        entity_id: projectDocId,
        entity_name: projectName,
        summary: `${projectName} project created`,
        changes: {},
        metadata: { platform: project.platform, member_count: memberEmails.length }
      });
      sendJson(response, 201, { project: publicProjectDocument(project) });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Project could not be created." });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

async function handleProjectDetail(request, response, projectDocId) {
  if (request.method !== "PATCH") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const existingProject = await readCloudsw3Project(projectDocId);
    if (!existingProject) throw new Error("Project not found.");
    const payload = await readRequestJson(request);
    const patch = { ...existingProject, updated_at: formatIndiaDateTime() };

    if (payload.status !== undefined) patch.status = normalizeProjectStatus(payload.status);
    if (payload.project_name !== undefined) {
      const projectName = String(payload.project_name || "").trim();
      if (!projectName) throw new Error("Project name is required.");
      if (projectName.length > 80) throw new Error("Project name must be 80 characters or fewer.");
      patch.project_name = projectName;
    }
    if (payload.platform !== undefined) patch.platform = normalizeProjectPlatform(payload.platform);
    if (payload.member_emails !== undefined) {
      const memberEmails = [...new Set((Array.isArray(payload.member_emails) ? payload.member_emails : [])
        .map((email) => String(email || "").trim().toLowerCase())
        .filter((email) => email && email.includes("@")))];
      if (!memberEmails.length) throw new Error("Choose at least one project member.");
      const allowedEmails = await knownUserEmails();
      if (memberEmails.some((email) => !allowedEmails.has(email))) throw new Error("Project members must be existing PMP users.");
      patch.member_emails = memberEmails;
    }
    if (payload.project_icon_base64) {
      patch.project_icon_url = await saveProjectIcon(projectDocId, payload.project_icon_base64, payload.project_icon_mime_type);
    }

    await updateCloudsw3Project(projectDocId, patch);
    const before = publicProjectDocument({ ...existingProject, _id: projectDocId });
    const after = publicProjectDocument({ ...patch, _id: projectDocId });
    const actorEmail = cleanActorEmail(payload.actor_email || payload.updated_by);
    const baseActivity = {
      actor_email: actorEmail,
      project_id: projectDocId,
      project_name: after.project_name,
      entity_type: "project",
      entity_id: projectDocId,
      entity_name: after.project_name
    };
    const activities = [];
    if (before.status !== after.status) activities.push({
      ...baseActivity,
      event_type: "project_status_changed",
      summary: `${after.project_name} moved to ${projectStatusLabel(after.status)}`,
      changes: { field: "status", from: projectStatusLabel(before.status), to: projectStatusLabel(after.status) },
      metadata: {}
    });
    if (!sameJson(before.member_emails, after.member_emails)) {
      const beforeMembers = new Set(before.member_emails);
      const afterMembers = new Set(after.member_emails);
      activities.push({
        ...baseActivity,
        event_type: "project_members_changed",
        summary: `${after.project_name} members updated`,
        changes: {},
        metadata: {
          added: after.member_emails.filter((email) => !beforeMembers.has(email)),
          removed: before.member_emails.filter((email) => !afterMembers.has(email))
        }
      });
    }
    const projectFields = ["project_name", "platform", "project_icon_url"].filter((field) => before[field] !== after[field]);
    if (projectFields.length) activities.push({
      ...baseActivity,
      event_type: "project_updated",
      summary: `${after.project_name} project details updated`,
      changes: { fields: projectFields },
      metadata: {}
    });
    await recordActivitiesSafely(activities);
    sendJson(response, 200, { project: publicProjectDocument({ ...patch, _id: projectDocId }) });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Project could not be updated." });
  }
}

async function refreshProjectTaskCount(projectDocId, delta = 0) {
  const project = await readCloudsw3Project(projectDocId);
  const tasks = await readCloudsw3Tasks(projectDocId);
  const taskList = Array.isArray(tasks) ? tasks.map(publicTaskDocument) : [];
  const completedCount = taskList.filter((task) => task.status === "Completed").length;
  const progressPercent = taskList.length ? Math.round((completedCount / taskList.length) * 100) : 0;
  await updateCloudsw3Project(projectDocId, {
    ...project,
    task_count: taskList.length,
    progress_percent: progressPercent,
    updated_at: formatIndiaDateTime()
  });
}

async function handleProjectTasks(request, response, projectDocId) {
  if (request.method === "GET") {
    try {
      const tasks = await readCloudsw3Tasks(projectDocId);
      const ordered = (Array.isArray(tasks) ? tasks : [])
        .map(publicTaskDocument)
        .sort((a, b) => taskDateTime(a.due_date) - taskDateTime(b.due_date));
      sendJson(response, 200, { tasks: ordered });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Tasks could not be loaded." });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const payload = await readRequestJson(request);
      const project = publicProjectDocument(await readCloudsw3Project(projectDocId));
      if (!project.id) throw new Error("Project not found.");
      const taskDocId = taskDocIdFromName(payload.main_task_name || payload.main_project_name);
      const now = formatIndiaDateTime();
      const task = {
        _id: taskDocId,
        ...cleanTaskPayload(payload),
        created_by: String(payload.created_by || "").trim().toLowerCase(),
        created_at: now,
        updated_at: now
      };
      await createCloudsw3Task(projectDocId, task);
      await Promise.all([
        refreshProjectTaskCount(projectDocId, 1),
        recordActivitiesSafely({
          event_type: "task_created",
          actor_email: task.created_by,
          project_id: projectDocId,
          project_name: project.project_name,
          entity_type: "task",
          entity_id: taskDocId,
          entity_name: task.main_task_name,
          summary: `${task.main_task_name} task created`,
          changes: {},
          metadata: { subtask_count: task.sub_tasks.length }
        })
      ]);
      sendJson(response, 201, { task: publicTaskDocument(task) });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Task could not be created." });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

function taskNameKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function handleBulkProjectTasks(request, response, projectDocId) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readRequestJson(request);
    const taskPayloads = Array.isArray(payload.tasks) ? payload.tasks : [];
    if (!taskPayloads.length) throw new Error("The CSV does not contain any main tasks.");
    if (taskPayloads.length > 100) throw new Error("Upload up to 100 main tasks at a time.");

    const project = publicProjectDocument(await readCloudsw3Project(projectDocId));
    if (!project.id) throw new Error("Project not found.");
    const allowedMembers = new Set(project.member_emails.map((email) => String(email).trim().toLowerCase()));
    const seenNames = new Set();
    const now = formatIndiaDateTime();

    const prepared = taskPayloads.map((rawTask) => {
      const key = taskNameKey(rawTask.main_task_name);
      if (!key) throw new Error("Every main task needs a task name.");
      if (seenNames.has(key)) throw new Error(`Duplicate main task in CSV: ${rawTask.main_task_name}`);
      seenNames.add(key);

      const clean = cleanTaskPayload({
        ...rawTask,
        status: "Not Started",
        dependency_tasks: []
      });
      const allAssignees = [clean.assignee, ...clean.sub_tasks.map((subtask) => subtask.assignee)].flat();
      const invalidAssignee = allAssignees.find((email) => !allowedMembers.has(email));
      if (invalidAssignee) throw new Error(`${invalidAssignee} is not a member of this project.`);
      const subtaskWithoutAssignee = clean.sub_tasks.find((subtask) => !subtask.assignee.length);
      if (subtaskWithoutAssignee) throw new Error(`Choose an assignee for subtask "${subtaskWithoutAssignee.sub_task_name}".`);

      return {
        _id: taskDocIdFromName(clean.main_task_name),
        ...clean,
        dependency_task_names: (Array.isArray(rawTask.dependency_task_names) ? rawTask.dependency_task_names : [])
          .map((name) => String(name || "").trim())
          .filter(Boolean),
        created_by: String(payload.created_by || "").trim().toLowerCase(),
        created_at: now,
        updated_at: now
      };
    });

    const existingTasks = (await readCloudsw3Tasks(projectDocId)).map(publicTaskDocument);
    const taskReferences = new Map();
    existingTasks.forEach((task) => {
      const key = taskNameKey(task.main_task_name);
      if (key && !taskReferences.has(key)) taskReferences.set(key, { id: task.id, name: task.main_task_name });
    });
    prepared.forEach((task) => {
      const key = taskNameKey(task.main_task_name);
      if (!taskReferences.has(key)) taskReferences.set(key, { id: task._id, name: task.main_task_name });
    });

    const ignoredDependencies = [];
    prepared.forEach((task) => {
      const resolved = new Map();
      task.dependency_task_names.forEach((dependencyName) => {
        const reference = taskReferences.get(taskNameKey(dependencyName));
        if (!reference || reference.id === task._id) {
          ignoredDependencies.push(dependencyName);
          return;
        }
        resolved.set(reference.id, {
          dependency_task_id: reference.id,
          dependency_task_name: reference.name
        });
      });
      task.dependency_tasks = [...resolved.values()];
      delete task.dependency_task_names;
    });

    for (const task of prepared) await createCloudsw3Task(projectDocId, task);
    const subtaskCount = prepared.reduce((count, task) => count + task.sub_tasks.length, 0);
    await Promise.all([
      refreshProjectTaskCount(projectDocId),
      recordActivitiesSafely({
        event_type: "bulk_tasks_uploaded",
        actor_email: payload.created_by,
        project_id: projectDocId,
        project_name: project.project_name,
        entity_type: "project",
        entity_id: projectDocId,
        entity_name: project.project_name,
        summary: `${prepared.length} main tasks and ${subtaskCount} subtasks uploaded`,
        changes: {},
        metadata: {
          main_task_count: prepared.length,
          subtask_count: subtaskCount,
          ignored_dependency_count: [...new Set(ignoredDependencies)].length
        }
      })
    ]);
    sendJson(response, 201, {
      tasks: prepared.map(publicTaskDocument),
      ignored_dependencies: [...new Set(ignoredDependencies)]
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Tasks could not be uploaded." });
  }
}

async function handleProjectTaskDetail(request, response, projectDocId, taskDocId) {
  if (request.method === "PATCH") {
    try {
      const [existingTask, projectDoc] = await Promise.all([
        readCloudsw3Task(projectDocId, taskDocId),
        readCloudsw3Project(projectDocId)
      ]);
      if (!existingTask) throw new Error("Task not found.");
      const project = publicProjectDocument(projectDoc);
      const payload = await readRequestJson(request);
      const task = {
        ...cleanTaskPayload({ ...publicTaskDocument(existingTask), ...payload }, existingTask),
        _id: taskDocId,
        created_by: existingTask.created_by || payload.created_by || "",
        created_at: existingTask.created_at || "",
        updated_at: formatIndiaDateTime()
      };
      await updateCloudsw3Task(projectDocId, taskDocId, task);
      await Promise.all([
        refreshProjectTaskCount(projectDocId),
        recordActivitiesSafely(taskChangeActivities(existingTask, task, {
          actor_email: payload.actor_email || payload.updated_by,
          project_id: projectDocId,
          project_name: project.project_name
        }))
      ]);
      sendJson(response, 200, { task: publicTaskDocument(task) });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Task could not be updated." });
    }
    return;
  }

  if (request.method === "DELETE") {
    try {
      const payload = await readRequestJson(request);
      const [existingTask, projectDoc] = await Promise.all([
        readCloudsw3Task(projectDocId, taskDocId),
        readCloudsw3Project(projectDocId)
      ]);
      if (!existingTask) throw new Error("Task not found.");
      const project = publicProjectDocument(projectDoc);
      const task = publicTaskDocument(existingTask);
      await deleteCloudsw3Task(projectDocId, taskDocId);
      await Promise.all([
        refreshProjectTaskCount(projectDocId, -1),
        recordActivitiesSafely({
          event_type: "task_deleted",
          actor_email: payload.actor_email,
          project_id: projectDocId,
          project_name: project.project_name,
          entity_type: "task",
          entity_id: taskDocId,
          entity_name: task.main_task_name,
          summary: `${task.main_task_name} task deleted`,
          changes: {},
          metadata: {}
        })
      ]);
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Task could not be deleted." });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

function taskDateTime(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

async function handleMembersList(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const requestedEmails = String(requestUrl.searchParams.get("emails") || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && email.includes("@"));
    const users = await readCloudsw3Users();
    const membersByEmail = new Map((Array.isArray(users) ? users : [])
      .map(publicMemberDocument)
      .filter((member) => member.email)
      .map((member) => [member.email.toLowerCase(), member]));

    await Promise.all(requestedEmails.map(async (email) => {
      if (membersByEmail.has(email)) return;
      try {
        const user = await readCloudsw3User(userDocIdFromEmail(email));
        const member = publicMemberDocument({ ...user, email: user.email || email });
        membersByEmail.set(email, member);
      } catch {
        membersByEmail.set(email, { id: userDocIdFromEmail(email), email, name: email, photoURL: "", profile_url: "", photo_url: "" });
      }
    }));

    const members = [...membersByEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
    sendJson(response, 200, { members });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Members could not be loaded." });
  }
}

function attendanceDocId(prefix = "attendance") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeAttendanceEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A member email is required.");
  return email;
}

function normalizeDateKey(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A valid date is required.");
  return date;
}

function publicAttendanceSessionDocument(session) {
  return {
    id: session._id || session.id || "",
    member_email: String(session.member_email || session.email || "").trim().toLowerCase(),
    login_at: session.login_at || "",
    logout_at: session.logout_at || "",
    breaks: Array.isArray(session.breaks) ? session.breaks.map((item) => ({
      start_at: item.start_at || "",
      end_at: item.end_at || ""
    })) : [],
    created_at: session.created_at || "",
    updated_at: session.updated_at || ""
  };
}

function publicAttendanceRemarkDocument(remark) {
  return {
    id: remark._id || remark.id || "",
    member_email: String(remark.member_email || "").trim().toLowerCase(),
    date: remark.date || "",
    remark: ["Leave", "Absent"].includes(remark.remark) ? remark.remark : "Absent",
    created_at: remark.created_at || "",
    updated_at: remark.updated_at || ""
  };
}

function publicCompanyHolidayDocument(holiday) {
  return {
    id: holiday._id || holiday.id || "",
    date: holiday.date || "",
    is_holiday: holiday.is_holiday !== false,
    is_working_override: holiday.is_working_override === true,
    created_at: holiday.created_at || "",
    updated_at: holiday.updated_at || ""
  };
}

function attendanceRemarkDocId(email, date) {
  return `remark-${userDocIdFromEmail(email)}-${date}`;
}

function companyHolidayDocId(date) {
  return `company-holiday-${date}`;
}

function openAttendanceSession(sessions, email) {
  return sessions
    .map(publicAttendanceSessionDocument)
    .filter((session) => session.member_email === email && session.login_at && !session.logout_at)
    .sort((left, right) => Date.parse(right.login_at) - Date.parse(left.login_at))[0];
}

async function handleAttendanceList(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const requestedEmail = String(requestUrl.searchParams.get("member_email") || "").trim().toLowerCase();
    const [sessionDocs, remarkDocs] = await Promise.all([
      readCloudsw3AttendanceSessions(),
      readCloudsw3AttendanceRemarks()
    ]);
    const sessions = (Array.isArray(sessionDocs) ? sessionDocs : [])
      .map(publicAttendanceSessionDocument)
      .filter((session) => session.member_email)
      .filter((session) => !requestedEmail || session.member_email === requestedEmail)
      .sort((left, right) => Date.parse(right.login_at) - Date.parse(left.login_at));
    const remarks = (Array.isArray(remarkDocs) ? remarkDocs : [])
      .map(publicAttendanceRemarkDocument)
      .filter((remark) => remark.member_email && remark.date)
      .filter((remark) => !requestedEmail || remark.member_email === requestedEmail);
    sendJson(response, 200, { sessions, remarks });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Attendance could not be loaded." });
  }
}

async function handleAttendanceAction(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readRequestJson(request);
    const actorEmail = normalizeAttendanceEmail(payload.actor_email);
    const memberEmail = normalizeAttendanceEmail(payload.member_email || payload.actor_email);
    if (actorEmail !== memberEmail) throw new Error("Members can modify only their own attendance.");
    const action = String(payload.action || "").trim();
    const now = new Date().toISOString();
    const sessionDocs = await readCloudsw3AttendanceSessions();
    const openSession = openAttendanceSession(sessionDocs, memberEmail);

    if (action === "login") {
      if (openSession) {
        sendJson(response, 200, { session: openSession, alreadyOpen: true });
        return;
      }
      const session = {
        _id: attendanceDocId("session"),
        member_email: memberEmail,
        login_at: now,
        logout_at: "",
        breaks: [],
        created_at: now,
        updated_at: now
      };
      await createCloudsw3AttendanceSession(session);
      sendJson(response, 201, { session: publicAttendanceSessionDocument(session) });
      return;
    }

    if (!openSession) throw new Error("Login first before using this attendance action.");

    if (action === "start_break") {
      if (openSession.breaks.some((item) => item.start_at && !item.end_at)) throw new Error("A break is already running.");
      const session = { ...openSession, breaks: [...openSession.breaks, { start_at: now, end_at: "" }], updated_at: now };
      await updateCloudsw3AttendanceSession(session.id, session);
      sendJson(response, 200, { session });
      return;
    }

    if (action === "end_break") {
      const breaks = [...openSession.breaks];
      const index = breaks.findIndex((item) => item.start_at && !item.end_at);
      if (index < 0) throw new Error("No running break found.");
      breaks[index] = { ...breaks[index], end_at: now };
      const session = { ...openSession, breaks, updated_at: now };
      await updateCloudsw3AttendanceSession(session.id, session);
      sendJson(response, 200, { session });
      return;
    }

    if (action === "logout") {
      const breaks = openSession.breaks.map((item) => item.start_at && !item.end_at ? { ...item, end_at: now } : item);
      const session = { ...openSession, breaks, logout_at: now, updated_at: now };
      await updateCloudsw3AttendanceSession(session.id, session);
      sendJson(response, 200, { session });
      return;
    }

    throw new Error("Unknown attendance action.");
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Attendance action failed." });
  }
}

async function handleAttendanceRemark(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readRequestJson(request);
    const actorEmail = normalizeAttendanceEmail(payload.actor_email);
    const memberEmail = normalizeAttendanceEmail(payload.member_email || payload.actor_email);
    if (actorEmail !== memberEmail) throw new Error("Members can modify only their own remarks.");
    const date = normalizeDateKey(payload.date);
    const remarkValue = String(payload.remark || "").trim();
    if (!["Leave", "Absent"].includes(remarkValue)) throw new Error("Remark must be Leave or Absent.");
    const now = new Date().toISOString();
    const remark = {
      _id: attendanceRemarkDocId(memberEmail, date),
      member_email: memberEmail,
      date,
      remark: remarkValue,
      created_at: payload.created_at || now,
      updated_at: now
    };
    await upsertCloudsw3RootDocument("AttendanceRemarks", remark);
    sendJson(response, 200, { remark: publicAttendanceRemarkDocument(remark) });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Attendance remark failed." });
  }
}

async function handleCompanyHolidays(request, response) {
  if (request.method === "GET") {
    try {
      const docs = await readCloudsw3CompanyHolidays();
      const holidays = (Array.isArray(docs) ? docs : [])
        .map(publicCompanyHolidayDocument)
        .filter((holiday) => holiday.date);
      sendJson(response, 200, { holidays });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Company holidays could not be loaded." });
    }
    return;
  }

  if (request.method === "POST") {
    try {
      const payload = await readRequestJson(request);
      normalizeAttendanceEmail(payload.actor_email);
      const date = normalizeDateKey(payload.date);
      const now = new Date().toISOString();
      const holiday = {
        _id: companyHolidayDocId(date),
        date,
        is_holiday: payload.is_holiday === true,
        is_working_override: payload.is_working_override === true,
        created_at: payload.created_at || now,
        updated_at: now
      };
      await upsertCloudsw3RootDocument("CompanyHolidays", holiday);
      sendJson(response, 200, { holiday: publicCompanyHolidayDocument(holiday) });
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Company holiday update failed." });
    }
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
}

async function handleGoogleAuth(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { idToken } = await readRequestJson(request);
    if (!idToken) throw new Error("Missing Google/Firebase login token.");

    const firebaseUser = await verifyFirebaseIdToken(idToken);
    const email = firebaseUser.email.trim().toLowerCase();
    const userDocId = userDocIdFromEmail(email);

    let existingUser = null;
    try {
      existingUser = await readCloudsw3User(userDocId);
    } catch {
      existingUser = null;
    }

    const user = publicUserDocument(firebaseUser, existingUser);
    if (existingUser) await updateCloudsw3User(userDocId, user);
    else await createCloudsw3User(userDocId, user);

    sendJson(response, 200, { user });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Google sign-in failed." });
  }
}

loadLocalEnv();

createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);

  if (requestPath === "/api/auth/google") {
    await handleGoogleAuth(request, response);
    return;
  }

  if (requestPath === "/api/user/profile") {
    await handleUserProfile(request, response);
    return;
  }

  if (requestPath === "/api/user/photo") {
    await handleUserPhoto(request, response);
    return;
  }

  if (requestPath === "/api/members") {
    await handleMembersList(request, response);
    return;
  }

  if (requestPath === "/api/activities") {
    await handleActivitiesList(request, response);
    return;
  }

  if (requestPath === "/api/attendance") {
    await handleAttendanceList(request, response);
    return;
  }

  if (requestPath === "/api/attendance/action") {
    await handleAttendanceAction(request, response);
    return;
  }

  if (requestPath === "/api/attendance/remarks") {
    await handleAttendanceRemark(request, response);
    return;
  }

  if (requestPath === "/api/company-holidays") {
    await handleCompanyHolidays(request, response);
    return;
  }

  if (requestPath === "/api/projects") {
    await handleProjectsList(request, response);
    return;
  }

  const tasksMatch = requestPath.match(/^\/api\/projects\/([^/]+)\/tasks$/);
  if (tasksMatch) {
    await handleProjectTasks(request, response, tasksMatch[1]);
    return;
  }

  const bulkTasksMatch = requestPath.match(/^\/api\/projects\/([^/]+)\/tasks\/bulk$/);
  if (bulkTasksMatch) {
    await handleBulkProjectTasks(request, response, bulkTasksMatch[1]);
    return;
  }

  const taskMatch = requestPath.match(/^\/api\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (taskMatch) {
    await handleProjectTaskDetail(request, response, taskMatch[1], taskMatch[2]);
    return;
  }

  const projectMatch = requestPath.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    await handleProjectDetail(request, response, projectMatch[1]);
    return;
  }

  const routeMap = {
    "/": "index.html",
    "/dashboard": "dashboard.html",
    "/gantt": "gantt.html",
    "/projects": "projects.html",
    "/members": "members.html",
    "/attendance": "reports.html",
    "/reports": "reports.html",
    "/tasks": "tasks.html",
    "/activity": "activity.html",
    "/settings": "settings.html"
  };
  const requestedRelativePath = routeMap[requestPath] || requestPath.replace(/^\/+/, "");
  let filePath = normalize(join(publicRoot, requestedRelativePath));

  if (
    !routeMap[requestPath] &&
    !extname(requestedRelativePath) &&
    (!filePath.startsWith(publicRoot) || !existsSync(filePath))
  ) {
    filePath = normalize(join(publicRoot, `${requestedRelativePath}.html`));
  }

  if (!filePath.startsWith(publicRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Cache-Control": staticCacheControl(requestPath, extension),
    "Content-Type": types[extension] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Project Management Panel: http://127.0.0.1:${port}`);
});
