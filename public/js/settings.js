import { getStoredUser, updateStoredUser, watchFirebaseUserProfile } from "./auth-ui.js";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const form = byId("profileSettingsForm");
const nameInput = byId("profileNameInput");
const emailInput = byId("profileEmailInput");
const iconPreview = byId("profileIconPreview");
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
  loadProfileForm();
  showToast("Profile form reset.");
});

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
