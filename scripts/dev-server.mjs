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

async function readCloudsw3Users() {
  return cloudsw3Request(`rcds?collName=Users&parentPath=/`);
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
  return {
    photoURL: user.photoURL || user.photoUrl || user.avatarUrl || "",
    name: user.name || user.displayName || "Unnamed user",
    createdAt: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || "",
    status: user.status || "Active",
    role: user.role || "Member"
  };
}

async function handleMembersList(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const users = await readCloudsw3Users();
    const members = (Array.isArray(users) ? users : [])
      .map(publicMemberDocument)
      .sort((a, b) => a.name.localeCompare(b.name));
    sendJson(response, 200, { members });
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Members could not be loaded." });
  }
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

  const routeMap = {
    "/": "index.html",
    "/dashboard": "dashboard.html",
    "/gantt": "gantt.html",
    "/projects": "projects.html",
    "/members": "members.html",
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

  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": types[extname(filePath).toLowerCase()] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Project Management Panel: http://127.0.0.1:${port}`);
});
