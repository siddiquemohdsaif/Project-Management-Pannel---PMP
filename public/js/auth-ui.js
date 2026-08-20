import { warmDataCache } from "./data-cache.js?v=pmp-20260819-4";

const USER_STORAGE_KEY = "pmpUser";
const LOGIN_PATH = "/";
let authMenu;
let activeAuthTrigger;

function isLoginPage() {
  return (window.location.pathname.replace(/\/+$/, "") || "/") === LOGIN_PATH;
}

export function requireSignedInUser() {
  const user = getStoredUser();
  if (!user && !isLoginPage()) {
    window.location.replace(LOGIN_PATH);
  }
  return user;
}

function getInitials(name, email) {
  const source = (name || email || "PMP").trim();
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/);
  return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function getUserPhotoUrl(user) {
  return String(user?.photoURL || user?.photoUrl || user?.avatarUrl || "").trim();
}

function renderProfileImage(node, photoURL, name) {
  node.textContent = "";
  node.style.backgroundImage = `url("${photoURL.replace(/"/g, "%22")}")`;
  node.classList.add("has-profile-image");
  node.setAttribute("aria-label", name);
}

function clearProfileImage(node) {
  node.style.removeProperty("background-image");
  node.classList.remove("has-profile-image");
}

export function storeSignedInUser(user) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function clearSignedInUser() {
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function updateStoredUser(updates) {
  const user = { ...(getStoredUser() || {}), ...updates };
  storeSignedInUser(user);
  applyUserProfile(user);
  return user;
}

export function applyUserProfile(user) {
  if (!user) return;

  const name = user.name || user.displayName || user.email || "Signed in user";
  const email = user.email || "";
  const initials = getInitials(name, email);
  const photoURL = getUserPhotoUrl(user);

  document.querySelectorAll(".profile-copy strong").forEach((node) => {
    node.textContent = name;
  });
  document.querySelectorAll(".profile-copy small").forEach((node) => {
    node.textContent = email;
  });
  document.querySelectorAll(".avatar, .top-avatar, .owner-dot, .owner-stack i").forEach((node) => {
    if (node.classList.contains("owner-dot") || node.closest(".owner-stack")) return;
    if (photoURL) renderProfileImage(node, photoURL, name);
    else {
      clearProfileImage(node);
      node.textContent = initials;
    }
    node.setAttribute("aria-label", name);
  });
}

export function hydrateStoredUserProfile() {
  applyUserProfile(getStoredUser());
}

export function watchFirebaseUserProfile() {
  if (!requireSignedInUser()) return;
  hydrateStoredUserProfile();
  setupAuthMenu();
  const dataPages = new Set(["/projects", "/tasks", "/members"]);
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (!dataPages.has(path)) warmDataCache();
}

function getUserName() {
  const user = getStoredUser();
  return user?.name || user?.displayName || user?.email || "Signed in user";
}

function ensureAuthMenu() {
  if (authMenu) return authMenu;

  authMenu = document.createElement("div");
  authMenu.className = "auth-menu";
  authMenu.setAttribute("role", "menu");
  authMenu.hidden = true;
  authMenu.innerHTML = `
    <button class="auth-menu-item auth-logout-button" type="button" role="menuitem">
      <span class="auth-logout-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M10 6H5.8A1.8 1.8 0 0 0 4 7.8v8.4A1.8 1.8 0 0 0 5.8 18H10" />
          <path d="M15 8l4 4-4 4" />
          <path d="M9 12h10" />
        </svg>
      </span>
      <span>Logout</span>
    </button>
  `;
  document.body.append(authMenu);
  authMenu.querySelector(".auth-logout-button").addEventListener("click", (event) => {
    event.stopPropagation();
    logoutCurrentUser();
  });
  document.addEventListener("click", (event) => {
    if (authMenu.hidden) return;
    if (event.target.closest(".auth-menu") || event.target.closest(".sidebar-profile, .top-avatar")) return;
    closeAuthMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAuthMenu();
  });

  return authMenu;
}

function positionAuthMenu(trigger) {
  const menu = ensureAuthMenu();
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const gap = 10;
  const viewportPadding = 12;
  const top = trigger.classList.contains("sidebar-profile")
    ? triggerRect.top - menuRect.height - gap
    : triggerRect.bottom + gap;
  const left = trigger.classList.contains("sidebar-profile")
    ? triggerRect.left + Math.min(18, Math.max(0, triggerRect.width - menuRect.width))
    : triggerRect.right - menuRect.width;

  menu.style.top = `${Math.max(viewportPadding, Math.min(window.innerHeight - menuRect.height - viewportPadding, top))}px`;
  menu.style.left = `${Math.max(viewportPadding, Math.min(window.innerWidth - menuRect.width - viewportPadding, left))}px`;
}

function openAuthMenu(trigger) {
  activeAuthTrigger = trigger;
  const menu = ensureAuthMenu();
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  positionAuthMenu(trigger);
}

function closeAuthMenu() {
  if (authMenu) authMenu.hidden = true;
  if (activeAuthTrigger) activeAuthTrigger.setAttribute("aria-expanded", "false");
  activeAuthTrigger = null;
}

function toggleAuthMenu(trigger) {
  if (!authMenu?.hidden && activeAuthTrigger === trigger) {
    closeAuthMenu();
    return;
  }
  if (activeAuthTrigger) activeAuthTrigger.setAttribute("aria-expanded", "false");
  openAuthMenu(trigger);
}

function setupAuthMenu() {
  document.querySelectorAll(".sidebar-profile, .top-avatar").forEach((trigger) => {
    if (trigger.dataset.authMenuReady === "true") return;
    trigger.dataset.authMenuReady = "true";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", `Open account menu for ${getUserName()}`);
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleAuthMenu(trigger);
    });
  });
}

async function signOutFirebaseUser() {
  try {
    const [{ firebaseConfig, isFirebaseConfigured }, { initializeApp, getApps }, { getAuth, signOut }] = await Promise.all([
      import("./firebase-config.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
    ]);
    if (!isFirebaseConfigured) return;
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    await signOut(getAuth(app));
  } catch {
    // Local sign-out still succeeds when Firebase scripts are unavailable.
  }
}

function logoutCurrentUser() {
  closeAuthMenu();
  clearSignedInUser();
  const timeout = new Promise((resolve) => setTimeout(resolve, 700));
  Promise.race([signOutFirebaseUser(), timeout]).finally(() => {
    window.location.href = LOGIN_PATH;
  });
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/image-cache-sw.js?v=pmp-20260820-2", { updateViaCache: "none" }).catch(() => {});
  }, { once: true });
}
