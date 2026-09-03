import { getStoredUser, watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";
import { dataCacheKeys, readDataCache, warmProjectTasks, writeDataCache } from "./data-cache.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const searchInput = byId("searchInput");
const statusFilter = byId("statusFilter");
const projectsBody = byId("projectsBody");
const emptyState = byId("emptyState");
const footerCount = byId("footerCount");
const projectStatusMenu = byId("projectStatusMenu");
const summaryStrip = document.querySelector(".projects-summary-strip");
const statusLabels = { active: "Active", on_hold: "On Hold", archived: "Archived", completed: "Completed" };
const projectStatusOptions = ["Active", "On Hold", "Archived", "Completed"];
let toastTimer;
let editingProjectRow = null;
let activeStatusButton = null;
let projectMembers = [];
let projects = [];
let selectedProjectIcon = "";
let selectedProjectIconMimeType = "";

watchFirebaseUserProfile();
loadPageData();

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function setSidebar(open) {
  sidebar.classList.toggle("open", open);
  sidebarScrim.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

byId("mobileMenu").addEventListener("click", () => setSidebar(true));
byId("sidebarClose").addEventListener("click", () => setSidebar(false));
sidebarScrim.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeStatusMenu();
    setSidebar(false);
  }
});

document.querySelectorAll("[data-screen]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const screen = btn.dataset.screen;
    if (screen === "Dashboard") { window.location.href = "/dashboard"; return; }
    if (screen === "Gantt Chart") { window.location.href = "/gantt"; return; }
    if (screen === "Tasks") { window.location.href = "/tasks"; return; }
    if (screen === "Members") { window.location.href = "/members"; return; }
    if (screen === "Attendance" || screen === "Reports") { window.location.href = "/attendance"; return; }
    if (screen === "Activity") { window.location.href = "/activity"; return; }
    if (screen === "Settings") { window.location.href = "/settings"; return; }
    if (screen === "Projects") return;
    setSidebar(false);
  });
});

searchInput.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);

projectsBody.addEventListener("click", async (e) => {
  const statusButton = e.target.closest("[data-project-status-button]");
  if (statusButton) {
    e.stopPropagation();
    openStatusMenu(statusButton);
    return;
  }

  const editButton = e.target.closest(".edit-project-button");
  if (editButton) {
    e.stopPropagation();
    openEditProject(editButton.closest("tr"));
    return;
  }

  const row = e.target.closest("tr");
  if (!row || row.hidden) return;
  localStorage.setItem("activeProject", row.dataset.name);
  localStorage.setItem("activeProjectId", row.dataset.id);
  window.location.href = `/tasks?project=${encodeURIComponent(row.dataset.name)}`;
});

projectsBody.addEventListener("pointerover", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (row?.dataset.id) warmProjectTasks(row.dataset.id);
});

const dialog = byId("newProjectDialog");
const newProjectBtn = byId("newProjectBtn");
const newProjectForm = byId("newProjectForm");
const projectMemberSelect = byId("projectMemberSelect");
const projectMembersOptions = byId("projectMembersOptions");
const projectMembersSummary = byId("projectMembersSummary");
const projectPlatformSelect = byId("projectPlatformSelect");
const projectPlatformSummary = byId("projectPlatformSummary");
const projectIconInput = byId("projectIconInput");
const projectIconPreviewImage = byId("projectIconPreviewImage");
const projectIconPreviewText = byId("projectIconPreviewText");
const projectDialogTitle = dialog.querySelector("h3");
const projectDialogSubtitle = dialog.querySelector(".project-dialog-head p");
const projectSubmitButton = dialog.querySelector("menu .btn-primary");
const projectDialogIconImage = dialog.querySelector(".project-dialog-icon img");

newProjectBtn.addEventListener("click", () => openProjectDialog());
byId("dialogCancel").addEventListener("click", closeProjectDialog);
byId("dialogClose").addEventListener("click", closeProjectDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeProjectDialog(); });
newProjectForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-project-member-input]")) updateProjectMembersSummary();
  if (event.target.matches("[data-project-platform-input]")) {
    updateProjectPlatformSummary();
    projectPlatformSelect?.removeAttribute("open");
  }
  if (event.target === projectIconInput) updateProjectIconPreview();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest("#projectPlatformSelect")) projectPlatformSelect?.removeAttribute("open");
  if (!event.target.closest("#projectMemberSelect")) projectMemberSelect?.removeAttribute("open");
});

newProjectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(newProjectForm);
  const name = String(data.get("name") || "").trim();
  const platform = String(data.get("platform") || "Android");
  const memberEmails = getSelectedProjectMembers();
  if (!name) { showToast("Project name is required."); return; }
  if (!memberEmails.length) { showToast("Choose at least one project member."); return; }

  projectSubmitButton.disabled = true;
  try {
    const payload = {
      project_name: name,
      platform,
      member_emails: memberEmails,
      status: "active",
      created_by: getStoredUser()?.email || "",
      actor_email: getStoredUser()?.email || ""
    };
    if (selectedProjectIcon) {
      payload.project_icon_base64 = selectedProjectIcon;
      payload.project_icon_mime_type = selectedProjectIconMimeType;
    }

    const url = editingProjectRow ? `/api/projects/${encodeURIComponent(editingProjectRow.dataset.id)}` : "/api/projects";
    const method = editingProjectRow ? "PATCH" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Project could not be saved.");

    upsertProject(result.project);
    writeDataCache(dataCacheKeys.projects, projects);
    renderProjects();
    closeProjectDialog();
    showToast(`Project "${name}" ${editingProjectRow ? "updated" : "created"}.`);
  } catch (error) {
    showToast(error.message || "Project could not be saved.");
  } finally {
    projectSubmitButton.disabled = false;
  }
});

async function loadPageData() {
  const cachedMembers = readDataCache(dataCacheKeys.members);
  const cachedProjects = readDataCache(dataCacheKeys.projects);
  const hasCachedData = Array.isArray(cachedProjects);
  if (Array.isArray(cachedMembers)) projectMembers = normalizeMembers(cachedMembers);
  if (Array.isArray(cachedProjects)) projects = cachedProjects;
  if (hasCachedData) renderProjects();
  else setLoadingState();

  try {
    const [membersResponse, projectsResponse] = await Promise.all([
      freshFetch("/api/members"),
      freshFetch("/api/projects?progress=false")
    ]);
    const membersResult = await readApiResponse(membersResponse);
    const projectsResult = await readApiResponse(projectsResponse);
    if (!membersResponse.ok) throw new Error(membersResult.error || "Members could not be loaded.");
    if (!projectsResponse.ok) throw new Error(projectsResult.error || "Projects could not be loaded.");
    projectMembers = normalizeMembers(membersResult.members);
    projects = Array.isArray(projectsResult.projects) ? projectsResult.projects : [];
    writeDataCache(dataCacheKeys.members, projectMembers);
    writeDataCache(dataCacheKeys.projects, projects);
    const projectToWarm = projects.find((project) => project.id === localStorage.getItem("activeProjectId")) || projects[0];
    if (projectToWarm?.id) warmProjectTasks(projectToWarm.id);
  } catch (error) {
    if (!projectMembers.length) projectMembers = fallbackMembers();
    if (!Array.isArray(cachedProjects)) projects = [];
    showToast(error.message || "Project data could not be loaded.");
  }
  renderProjects();
}

function setLoadingState() {
  projectsBody.innerHTML = "";
  emptyState.hidden = true;
  footerCount.textContent = "Loading projects";
}

function renderProjects() {
  projectsBody.replaceChildren(...projects.map(projectRow));
  updateSummary();
  applyFilters();
}

function projectRow(project) {
  const row = document.createElement("tr");
  const name = project.project_name || "Untitled Project";
  const status = normalizeStatus(project.status);
  const taskCount = Number(project.task_count || 0);
  const progress = Math.max(0, Math.min(100, Number(project.progress_percent || 0)));
  row.dataset.id = project.id || "";
  row.dataset.name = name;
  row.dataset.status = statusLabels[status] || "Active";
  row.dataset.category = project.platform || "Android";
  row.dataset.members = (project.member_emails || []).join(",");
  row.dataset.icon = project.project_icon_url || "";
  row.dataset.tasks = `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;
  row.innerHTML = `
    <td class="project-name">${projectIconMarkup(name, project.project_icon_url)}<span class="project-name-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(project.platform || "Android")} · ${taskCount} ${taskCount === 1 ? "task" : "tasks"}</small></span></td>
    <td>${statusSelectMarkup(status)}</td>
    <td><div class="progress-cell"><div class="progress-bar ${progressBarClass(status)}"><i style="width: ${progress}%"></i></div><span>${progress}%</span></div></td>
    <td>${memberCell(project.member_emails || [])}</td>
    <td class="muted">${escapeHtml(formatDateTime(project.updated_at || project.created_at))}</td>
    <td><button class="edit-project-button" type="button" aria-label="Edit ${escapeAttr(name)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button></td>
  `;
  return row;
}

function statusSelectMarkup(status) {
  return `<button class="status-pill ${statusClass(status)} status-button" type="button" data-project-status-button>${escapeHtml(statusLabels[status] || "Active")}</button>`;
}

async function updateProjectStatus(button, statusLabel) {
  const row = button.closest("tr");
  if (!row?.dataset.id) return;
  const previous = row.dataset.status;
  const status = statusValueFromLabel(statusLabel);
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(row.dataset.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, actor_email: getStoredUser()?.email || "" })
    });
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Project status could not be updated.");
    upsertProject(result.project);
    writeDataCache(dataCacheKeys.projects, projects);
    closeStatusMenu();
    renderProjects();
    showToast(`${row.dataset.name}: ${previous} -> ${statusLabels[normalizeStatus(status)]}.`);
  } catch (error) {
    closeStatusMenu();
    renderProjects();
    showToast(error.message || "Project status could not be updated.");
  }
}

function openStatusMenu(button) {
  activeStatusButton = button;
  projectStatusMenu.replaceChildren();
  projectStatusOptions.forEach((status) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = statusClass(status);
    option.textContent = status;
    option.setAttribute("role", "menuitem");
    option.addEventListener("click", () => updateProjectStatus(button, status));
    projectStatusMenu.append(option);
  });

  const rect = button.getBoundingClientRect();
  projectStatusMenu.hidden = false;
  const menuWidth = projectStatusMenu.offsetWidth || 170;
  projectStatusMenu.style.top = `${rect.bottom + 7}px`;
  projectStatusMenu.style.left = `${Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left + rect.width / 2 - menuWidth / 2))}px`;
}

function closeStatusMenu() {
  projectStatusMenu.hidden = true;
  activeStatusButton = null;
}

document.addEventListener("click", (event) => {
  if (!activeStatusButton) return;
  if (event.target.closest("#projectStatusMenu") || event.target.closest("[data-project-status-button]")) return;
  closeStatusMenu();
});

window.addEventListener("resize", closeStatusMenu);

function upsertProject(project) {
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.unshift(project);
}

function updateSummary() {
  const counts = projects.reduce((result, project) => {
    result.total += 1;
    result[normalizeStatus(project.status)] += 1;
    return result;
  }, { total: 0, active: 0, on_hold: 0, archived: 0, completed: 0 });

  summaryStrip.innerHTML = `
    <span><strong>${counts.total}</strong> Projects</span>
    <span><strong>${counts.active}</strong> Active</span>
    <span><strong>${counts.on_hold}</strong> On Hold</span>
    <span><strong>${counts.archived}</strong> Archived</span>
  `;
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  let visible = 0;
  const rows = [...projectsBody.querySelectorAll("tr")];
  rows.forEach((row) => {
    const name = row.dataset.name.toLowerCase();
    const s = row.dataset.status;
    const bySearch = !q || name.includes(q);
    const byStatus = status === "all" || s === status;
    const show = bySearch && byStatus;
    row.hidden = !show;
    if (show) visible++;
  });
  emptyState.hidden = visible !== 0;
  footerCount.textContent = rows.length
    ? visible === rows.length ? `Showing 1 to ${rows.length} of ${rows.length} projects` : `Showing ${visible} of ${rows.length} projects`
    : "No projects found";
}

async function openProjectDialog(row = null) {
  editingProjectRow = row;
  await refreshProjectMembers(row);
  prepareProjectForm(row);
  projectDialogTitle.textContent = row ? "Edit Project" : "Create New Project";
  projectDialogSubtitle.textContent = row
    ? "Update the project identity, platform, and team."
    : "Set the project identity, platform, and starting team.";
  projectSubmitButton.textContent = row ? "Save Changes" : "Create Project";
  projectDialogIconImage.src = row ? "./assets/photos/edit_task_icon.png" : "./assets/photos/create_task_icon.png";

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    requestAnimationFrame(() => newProjectForm.elements.name.focus());
  } else {
    dialog.setAttribute("open", "");
  }
}

function openEditProject(row) {
  if (row) openProjectDialog(row);
}

async function refreshProjectMembers(row = null) {
  const selectedEmails = splitValues(row?.dataset.members || "");
  try {
    const memberUrl = selectedEmails.length ? `/api/members?emails=${encodeURIComponent(selectedEmails.join(","))}` : "/api/members";
    const response = await freshFetch(memberUrl);
    const result = await readApiResponse(response);
    if (!response.ok) throw new Error(result.error || "Members could not be loaded.");
    projectMembers = normalizeMembers(result.members);
    writeDataCache(dataCacheKeys.members, projectMembers);
  } catch {
    projectMembers = normalizeMembers(projectMembers.length ? projectMembers : fallbackMembers());
  }

  const existingEmails = new Set(projectMembers.map((member) => member.email));
  selectedEmails.forEach((email) => {
    if (email && !existingEmails.has(email)) {
      projectMembers.push({ email, name: email, photoURL: "" });
    }
  });
}

function prepareProjectForm(row = null) {
  projectMembersOptions.innerHTML = projectMembers.length ? projectMembers.map((member) => `
    <label class="project-member-option">
      <input data-project-member-input type="checkbox" name="members" value="${escapeAttr(member.email)}" />
      ${memberAvatarMarkup(member)}
      <span>${escapeHtml(member.name || member.email)}</span>
    </label>
  `).join("") : `<p class="project-member-empty">No users found.</p>`;
  if (row) populateProjectForm(row);
  updateProjectMembersSummary();
  updateProjectPlatformSummary();
}

function closeProjectDialog() {
  if (dialog.open) dialog.close();
  newProjectForm.reset();
  editingProjectRow = null;
  selectedProjectIcon = "";
  selectedProjectIconMimeType = "";
  resetProjectIconPreview();
  projectPlatformSelect?.removeAttribute("open");
  projectMemberSelect?.removeAttribute("open");
  updateProjectMembersSummary();
  updateProjectPlatformSummary();
}

function populateProjectForm(row) {
  const name = row.dataset.name || "";
  const platform = normalizePlatform(row.dataset.category || "Android");
  const members = splitValues(row.dataset.members);
  selectedProjectIcon = row.dataset.icon || "";
  selectedProjectIconMimeType = "";

  newProjectForm.elements.name.value = name;
  const platformInput = newProjectForm.querySelector(`input[name="platform"][value="${cssEscape(platform)}"]`);
  if (platformInput) platformInput.checked = true;
  newProjectForm.querySelectorAll("input[name='members']").forEach((input) => {
    input.checked = members.includes(input.value.toLowerCase());
  });

  if (selectedProjectIcon) setProjectIconPreviewImage(selectedProjectIcon);
  else setProjectIconPreviewText(projectInitials(name));
}

function updateProjectIconPreview() {
  const file = projectIconInput.files?.[0];
  if (!file) {
    selectedProjectIcon = "";
    resetProjectIconPreview();
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedProjectIcon = String(reader.result || "");
    selectedProjectIconMimeType = file.type;
    setProjectIconPreviewImage(selectedProjectIcon);
  });
  reader.readAsDataURL(file);
}

function resetProjectIconPreview() {
  projectIconPreviewImage.removeAttribute("src");
  projectIconPreviewImage.hidden = true;
  projectIconPreviewText.innerHTML = `<img src="./assets/photos/project_icon_add.png" alt="" />`;
  projectIconPreviewText.hidden = false;
}

function setProjectIconPreviewImage(src) {
  projectIconPreviewImage.src = src;
  projectIconPreviewImage.hidden = false;
  projectIconPreviewText.hidden = true;
}

function setProjectIconPreviewText(text) {
  projectIconPreviewImage.removeAttribute("src");
  projectIconPreviewImage.hidden = true;
  projectIconPreviewText.textContent = text;
  projectIconPreviewText.hidden = false;
}

function getSelectedProjectMembers() {
  return [...newProjectForm.querySelectorAll("input[name='members']:checked")]
    .map((input) => input.value.trim().toLowerCase());
}

function updateProjectMembersSummary() {
  const selected = getSelectedProjectMembers();
  if (!selected.length) {
    projectMembersSummary.textContent = "Choose members";
    return;
  }
  projectMembersSummary.textContent = selected.length <= 2
    ? selected.map(memberNameByEmail).join(", ")
    : `${selected.length} members selected`;
}

function updateProjectPlatformSummary() {
  const selected = new FormData(newProjectForm).get("platform") || "Android";
  projectPlatformSummary.textContent = selected;
}

function memberCell(emails) {
  const selectedMembers = emails.map((email) => projectMembers.find((member) => member.email === email)).filter(Boolean);
  const visibleMembers = selectedMembers.slice(0, 3);
  const extraCount = Math.max(0, selectedMembers.length - visibleMembers.length);
  if (!visibleMembers.length) return `<div class="members-cell"><span class="more-count">${emails.length}</span></div>`;
  return `<div class="members-cell"><span class="member-avatars">${visibleMembers.map((member) => memberAvatarMarkup(member, "img")).join("")}</span>${extraCount ? `<span class="more-count">+${extraCount}</span>` : ""}</div>`;
}

function projectIconMarkup(name, iconUrl = "") {
  if (iconUrl) return `<img class="project-logo" src="${escapeHtml(iconUrl)}" alt="${escapeHtml(name)} icon" />`;
  return `<span class="project-mark">${escapeHtml(projectInitials(name))}</span>`;
}

function projectInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "PR";
}

function splitValues(value) {
  return (value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function normalizePlatform(value) {
  return {
    "Mobile app": "Android",
    Website: "Web",
    Platform: "Webapp",
    Marketing: "Other",
    Operations: "Other",
    "Web App": "Webapp"
  }[value] || value || "Android";
}

function normalizeStatus(value) {
  const status = statusValueFromLabel(value);
  return statusLabels[status] ? status : "active";
}

function statusValueFromLabel(value) {
  return String(value || "active").trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function statusClass(status) {
  return normalizeStatus(status).replace("_", "-");
}

function progressBarClass(status) {
  return normalizeStatus(status) === "on_hold" ? "hold" : statusClass(status);
}

function memberNameByEmail(email) {
  const member = projectMembers.find((item) => item.email === email);
  return member?.name || email;
}

function memberAvatarMarkup(member, mode = "label") {
  const name = member.name || member.email || "Member";
  const photoURL = String(member.photoURL || member.photoUrl || member.avatarUrl || "").trim();
  if (photoURL) {
    return mode === "img"
      ? `<img src="${escapeAttr(photoURL)}" alt="${escapeAttr(name)}" referrerpolicy="no-referrer" loading="lazy" />`
      : `<img src="${escapeAttr(photoURL)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`;
  }
  const fallback = escapeHtml(projectInitials(name));
  return mode === "img"
    ? `<span class="member-avatar-fallback" aria-label="${escapeAttr(name)}">${fallback}</span>`
    : `<span class="project-member-initials" aria-hidden="true">${fallback}</span>`;
}

function fallbackMembers() {
  const user = getStoredUser();
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return [];
  return [{ email, name: user.name || user.displayName || email, photoURL: user.photoURL || user.photoUrl || user.avatarUrl || "" }];
}

function normalizeMembers(list) {
  return (Array.isArray(list) ? list : [])
    .map((member) => ({
      ...member,
      email: String(member.email || "").trim().toLowerCase()
    }))
    .filter((member) => member.email);
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return String(value).split(" ").slice(0, 3).join(" ");
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
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
