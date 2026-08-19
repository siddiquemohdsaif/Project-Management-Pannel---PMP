import { getStoredUser, watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";
import { dataCacheKeys, readDataCache, writeDataCache } from "./data-cache.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const searchInput = byId("memberSearchInput");
const membersBody = byId("membersBody");
const emptyState = byId("emptyState");
const footerCount = byId("footerCount");
const membersCount = byId("membersCount");
let toastTimer;
let members = [];

watchFirebaseUserProfile();
loadMembers();

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
    if (screen === "Activity") { window.location.href = "/activity"; return; }
    if (screen === "Settings") { window.location.href = "/settings"; return; }
    if (screen === "Members") return;
    setSidebar(false);
    showToast(`${screen} is planned next. Members is now live.`);
  });
});

searchInput.addEventListener("input", applyFilters);

async function loadMembers() {
  const cachedMembers = readDataCache(dataCacheKeys.members);
  if (Array.isArray(cachedMembers)) {
    members = cachedMembers;
    renderMembers();
  } else {
    setLoadingState();
  }

  try {
    const response = await freshFetch("/api/members");
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Members could not be loaded.");
    members = Array.isArray(result.members) ? result.members : [];
    writeDataCache(dataCacheKeys.members, members);
  } catch (error) {
    if (!Array.isArray(cachedMembers)) {
      const storedUser = getStoredUser();
      members = storedUser ? [{ ...storedUser, status: "Active", role: "Member" }] : [];
    }
    showToast("Latest members could not be loaded. Showing saved data.");
  }
  renderMembers();
}

function setLoadingState() {
  membersBody.innerHTML = "";
  emptyState.hidden = true;
  membersCount.textContent = "Loading";
  footerCount.textContent = "Loading members";
}

function renderMembers() {
  membersBody.replaceChildren(...members.map((member) => {
    const row = document.createElement("tr");
    row.dataset.searchText = [
      member.name,
      member.displayName,
      member.role,
      member.status
    ].filter(Boolean).join(" ").toLowerCase();
    row.innerHTML = `
      <td>${memberProfileMarkup(member)}</td>
      <td><span class="status-pill ${statusClass(member.status)}">${escapeHtml(member.status || "Active")}</span></td>
      <td><span class="role-pill">${escapeHtml(member.role || "Member")}</span></td>
      <td class="muted">${escapeHtml(formatDateTime(member.lastLoginAt))}</td>
      <td class="muted">${escapeHtml(formatDateTime(member.createdAt))}</td>
    `;
    return row;
  }));
  applyFilters();
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const rows = [...membersBody.querySelectorAll("tr")];
  let visible = 0;
  rows.forEach((row) => {
    const show = !query || row.dataset.searchText.includes(query);
    row.hidden = !show;
    if (show) visible++;
  });
  emptyState.hidden = visible !== 0;
  membersCount.textContent = `${members.length} ${members.length === 1 ? "member" : "members"}`;
  footerCount.textContent = members.length
    ? visible === members.length ? `Showing 1 to ${members.length} of ${members.length} members` : `Showing ${visible} of ${members.length} members`
    : "No members found";
}

function memberProfileMarkup(member) {
  const name = member.name || member.displayName || member.email || "Unnamed user";
  const email = member.email || "";
  const photoURL = String(member.photoURL || member.photoUrl || member.avatarUrl || "").trim();
  const avatar = photoURL
    ? `<span class="member-avatar has-profile-image"><img src="${escapeAttr(photoURL)}" alt="${escapeAttr(name)}" referrerpolicy="no-referrer" loading="lazy" /></span>`
    : `<span class="member-avatar" aria-label="${escapeAttr(name)}">${escapeHtml(initials(name, email))}</span>`;
  return `
    <span class="member-profile">
      ${avatar}
      <span class="member-copy"><strong>${escapeHtml(name)}</strong></span>
    </span>
  `;
}

function statusClass(status) {
  return {
    Active: "active",
    Disabled: "archived",
    Invited: "on-hold",
    Pending: "on-hold"
  }[status || "Active"] || "active";
}

function initials(name, email) {
  const source = (name || email || "PMP").trim();
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/);
  return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return String(value);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function readApiResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function freshFetch(url, options = {}) {
  const cacheBust = `_=${Date.now()}`;
  const separator = url.includes("?") ? "&" : "?";
  return fetch(`${url}${separator}${cacheBust}`, { cache: "no-store", ...options });
}
