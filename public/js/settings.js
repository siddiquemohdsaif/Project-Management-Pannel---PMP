import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { getStoredUser, updateStoredUser, watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const form = byId("profileSettingsForm");
const nameInput = byId("profileNameInput");
const emailInput = byId("profileEmailInput");
const photoInput = byId("profilePhotoInput");
const iconPreview = byId("profileIconPreview");
const photoHint = byId("profilePhotoHint");
const resetButton = byId("resetProfileButton");
const saveButton = byId("saveProfileButton");
const syncStatus = byId("profileSyncStatus");
let toastTimer;
let initialUser = null;

watchFirebaseUserProfile();
loadProfileForm();

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

function setSidebar(open) {
  sidebar.classList.toggle("open", open);
  sidebarScrim.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

function setStatus(message, state = "") {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("is-saving", state === "saving");
  syncStatus.classList.toggle("is-error", state === "error");
  syncStatus.classList.toggle("is-success", state === "success");
}

byId("mobileMenu").addEventListener("click", () => setSidebar(true));
byId("sidebarClose").addEventListener("click", () => setSidebar(false));
sidebarScrim.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSidebar(false);
});

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    const screen = button.dataset.screen;
    if (screen === "Dashboard") { window.location.href = "/dashboard"; return; }
    if (screen === "Projects") { window.location.href = "/projects"; return; }
    if (screen === "Tasks") { window.location.href = "/tasks"; return; }
    if (screen === "Gantt Chart") { window.location.href = "/gantt"; return; }
    if (screen === "Members") { window.location.href = "/members"; return; }
    if (screen === "Attendance" || screen === "Reports") { window.location.href = "/attendance"; return; }
    if (screen === "Activity") { window.location.href = "/activity"; return; }
    if (screen === "Settings") return;
    setSidebar(false);
    showToast(`${screen} is planned next. Settings is now live.`);
  });
});

function loadProfileForm() {
  initialUser = getStoredUser() || {};
  const name = initialUser.name || initialUser.displayName || initialUser.email || "";
  const email = initialUser.email || "";
  nameInput.value = name;
  emailInput.value = email;
  renderProfileIcon(initialUser, name, email);
  photoHint.textContent = getPhotoUrl(initialUser) ? "Select image to replace" : "Select image to upload";
  setStatus(email ? "Ready" : "Sign in first", email ? "" : "error");
}

function getPhotoUrl(user) {
  return String(user?.photoURL || user?.photoUrl || user?.avatarUrl || "").trim();
}

function renderProfileIcon(user, name, email) {
  const photoURL = getPhotoUrl(user);
  iconPreview.style.removeProperty("background-image");
  iconPreview.classList.remove("has-profile-image");

  if (photoURL) {
    iconPreview.textContent = "";
    iconPreview.style.backgroundImage = `url("${photoURL.replace(/"/g, "%22")}")`;
    iconPreview.classList.add("has-profile-image");
    iconPreview.setAttribute("aria-label", name || email || "Profile icon");
    return;
  }

  const source = (name || email || "PMP").trim();
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/);
  iconPreview.textContent = parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

nameInput.addEventListener("input", () => {
  renderProfileIcon(initialUser, nameInput.value, emailInput.value);
  setStatus("Unsaved changes");
});

resetButton.addEventListener("click", () => {
  photoInput.value = "";
  loadProfileForm();
  showToast("Profile form reset.");
});

photoInput?.addEventListener("change", uploadSelectedProfilePhoto);

async function uploadSelectedProfilePhoto() {
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    photoInput.value = "";
    showToast("Choose a JPG, PNG, or WebP image.");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    photoInput.value = "";
    showToast("Profile photo must be 2 MB or smaller.");
    return;
  }

  const previousUser = initialUser;
  const previewUrl = URL.createObjectURL(file);
  renderProfileIcon({ ...initialUser, photoURL: previewUrl }, nameInput.value, emailInput.value);
  setStatus("Uploading photo", "saving");
  photoHint.textContent = "Uploading";
  saveButton.disabled = true;

  try {
    const idToken = await getFirebaseIdToken();
    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch("/api/user/photo", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ profilePhotoBase64: dataUrl, mimeType: file.type })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Profile photo upload failed.");

    initialUser = updateStoredUser(result.user || { ...initialUser, photoURL: result.photoURL });
    renderProfileIcon(initialUser, nameInput.value, emailInput.value);
    photoHint.textContent = "Select image to replace";
    setStatus("Photo saved", "success");
    showToast("Profile photo updated.");
  } catch (error) {
    initialUser = previousUser;
    renderProfileIcon(initialUser, nameInput.value, emailInput.value);
    photoHint.textContent = getPhotoUrl(initialUser) ? "Select image to replace" : "Select image to upload";
    setStatus("Photo not saved", "error");
    showToast(error.message || "Profile photo upload failed.");
  } finally {
    URL.revokeObjectURL(previewUrl);
    photoInput.value = "";
    saveButton.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();

  if (!email) {
    setStatus("Sign in first", "error");
    showToast("Please sign in before updating your profile.");
    return;
  }
  if (!name) {
    setStatus("Name required", "error");
    nameInput.focus();
    return;
  }

  saveButton.disabled = true;
  setStatus("Saving", "saving");

  try {
    const response = await fetch("/api/user/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Profile update failed.");

    initialUser = updateStoredUser({ ...(result.user || {}), name, email });
    renderProfileIcon(initialUser, name, email);
    setStatus("Saved", "success");
    showToast("Profile name updated.");
  } catch (error) {
    setStatus("Not saved", "error");
    showToast(error.message || "Profile update failed.");
  } finally {
    saveButton.disabled = false;
  }
});

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Profile photo could not be read.")));
    reader.readAsDataURL(file);
  });
}

async function getFirebaseIdToken() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured.");
  const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
  ]);
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const user = auth.currentUser || await waitForFirebaseUser(auth, onAuthStateChanged);
  if (!user) throw new Error("Please sign in again before changing your photo.");
  return user.getIdToken();
}

function waitForFirebaseUser(auth, onAuthStateChanged) {
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 2500);
    unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}
