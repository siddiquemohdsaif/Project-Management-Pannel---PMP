import { watchFirebaseUserProfile } from "./auth-ui.js";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const searchInput = byId("searchInput");
const statusFilter = byId("statusFilter");
const projectsBody = byId("projectsBody");
const emptyState = byId("emptyState");
const footerCount = byId("footerCount");
let toastTimer;
let editingProjectRow = null;
const projectMembers = [
  { id: "john", name: "John Doe", initials: "JD", photo: "https://i.pravatar.cc/100?img=12" },
  { id: "sarah", name: "Sarah Johnson", initials: "SJ", photo: "https://i.pravatar.cc/100?img=32" },
  { id: "priya", name: "Priya Rao", initials: "PR", photo: "https://i.pravatar.cc/100?img=47" },
  { id: "arun", name: "Arun Roy", initials: "AR", photo: "https://i.pravatar.cc/100?img=56" },
  { id: "vikram", name: "Vikram Kumar", initials: "VK", photo: "https://i.pravatar.cc/100?img=15" }
];
let selectedProjectIcon = "";

watchFirebaseUserProfile();

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
  if (e.key === "Escape") setSidebar(false);
});

// Sidebar navigation — mirrors dashboard.js routing
document.querySelectorAll("[data-screen]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const screen = btn.dataset.screen;
    if (screen === "Dashboard") { window.location.href = "/dashboard"; return; }
    if (screen === "Gantt Chart") { window.location.href = "/gantt"; return; }
    if (screen === "Tasks") { window.location.href = "/tasks"; return; }
    if (screen === "Members") { window.location.href = "/members"; return; }
    if (screen === "Activity") { window.location.href = "/activity"; return; }
    if (screen === "Settings") { window.location.href = "/settings"; return; }
    if (screen === "Projects") return; // already here
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item === btn;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    setSidebar(false);
    showToast(`${screen} is planned next. Projects is now live.`);
  });
});

// Filter logic
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
  footerCount.textContent = visible === rows.length
    ? `Showing 1 to ${rows.length} of ${rows.length} projects`
    : `Showing ${visible} of ${rows.length} projects`;
}

searchInput.addEventListener("input", applyFilters);
statusFilter.addEventListener("change", applyFilters);

// Row click → toast + future navigation
projectsBody.addEventListener("click", (e) => {
  const editButton = e.target.closest(".edit-project-button");
  if (editButton) {
    e.stopPropagation();
    openEditProject(editButton.closest("tr"));
    return;
  }

  const row = e.target.closest("tr");
  if (!row || row.hidden) return;
  const name = row.dataset.name;
  localStorage.setItem("activeProject", name);
  window.location.href = `/tasks?project=${encodeURIComponent(name)}`;
});

// New Project dialog
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

newProjectBtn.addEventListener("click", () => {
  openProjectDialog();
});

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

newProjectForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(newProjectForm);
  const name = String(data.get("name") || "").trim();
  const platform = String(data.get("platform") || "Android");
  const members = getSelectedProjectMembers();
  if (!name) { showToast("Project name is required."); return; }
  if (!members.length) { showToast("Choose at least one project member."); return; }
  if (editingProjectRow) {
    updateProjectRow(editingProjectRow, { name, platform, members, icon: selectedProjectIcon });
    closeProjectDialog();
    applyFilters();
    showToast(`Project "${name}" updated.`);
    return;
  }
  // Create optimistic row (mock — will be replaced by API)
  const tr = document.createElement("tr");
  tr.dataset.name = name;
  tr.dataset.status = "Active";
  tr.dataset.category = platform;
  tr.dataset.tasks = "0 tasks";
  tr.dataset.members = members.join(",");
  tr.dataset.icon = selectedProjectIcon;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  tr.innerHTML = `
    <td class="project-name">${projectIconMarkup(name, selectedProjectIcon)}<span class="project-name-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(platform)} · 0 tasks</small></span></td>
    <td><span class="status-pill active">Active</span></td>
    <td><div class="progress-cell"><div class="progress-bar"><i style="width: 0%"></i></div><span>0%</span></div></td>
    <td>${memberCell(members)}</td>
    <td class="muted">${today}</td>
    <td><button class="edit-project-button" type="button" aria-label="Edit ${escapeHtml(name)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button></td>
  `;
  projectsBody.prepend(tr);
  closeProjectDialog();
  applyFilters();
  showToast(`Project "${name}" created (mock). Connect to POST /api/v1/projects.`);
});

function openProjectDialog(row = null) {
  editingProjectRow = row;
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
  if (!row) return;
  ensureRowProjectData(row);
  openProjectDialog(row);
}

function prepareProjectForm(row = null) {
  projectMembersOptions.innerHTML = projectMembers.map((member) => `
    <label class="project-member-option">
      <input data-project-member-input type="checkbox" name="members" value="${escapeHtml(member.name)}" />
      <img src="${member.photo}" alt="" />
      <span>${escapeHtml(member.name)}</span>
    </label>
  `).join("");
  if (row) populateProjectForm(row);
  updateProjectMembersSummary();
  updateProjectPlatformSummary();
}

function closeProjectDialog() {
  if (dialog.open) dialog.close();
  newProjectForm.reset();
  editingProjectRow = null;
  selectedProjectIcon = "";
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

  newProjectForm.elements.name.value = name;
  const platformInput = newProjectForm.querySelector(`input[name="platform"][value="${cssEscape(platform)}"]`);
  if (platformInput) platformInput.checked = true;
  newProjectForm.querySelectorAll("input[name='members']").forEach((input) => {
    input.checked = members.includes(input.value);
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
    .map((input) => input.value);
}

function updateProjectMembersSummary() {
  const selected = getSelectedProjectMembers();
  if (!selected.length) {
    projectMembersSummary.textContent = "Choose members";
    return;
  }
  projectMembersSummary.textContent = selected.length <= 2
    ? selected.join(", ")
    : `${selected.length} members selected`;
}

function updateProjectPlatformSummary() {
  const selected = new FormData(newProjectForm).get("platform") || "Android";
  projectPlatformSummary.textContent = selected;
}

function memberCell(names) {
  const selectedMembers = names.map((name) => projectMembers.find((member) => member.name === name)).filter(Boolean);
  const visibleMembers = selectedMembers.slice(0, 3);
  const extraCount = Math.max(0, selectedMembers.length - visibleMembers.length);
  return `<div class="members-cell"><span class="member-avatars">${visibleMembers.map((member) => `<img src="${member.photo}" alt="${escapeHtml(member.name)}" />`).join("")}</span>${extraCount ? `<span class="more-count">+${extraCount}</span>` : ""}</div>`;
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

function updateProjectRow(row, values) {
  row.dataset.name = values.name;
  row.dataset.category = values.platform;
  row.dataset.members = values.members.join(",");
  row.dataset.icon = values.icon;
  row.querySelector(".project-name").innerHTML = `${projectIconMarkup(values.name, values.icon)}<span class="project-name-copy"><strong>${escapeHtml(values.name)}</strong><small>${escapeHtml(values.platform)} · ${escapeHtml(row.dataset.tasks || "0 tasks")}</small></span>`;
  row.children[3].innerHTML = memberCell(values.members);
  row.querySelector(".edit-project-button")?.setAttribute("aria-label", `Edit ${values.name}`);
}

function ensureRowProjectData(row) {
  if (!row.dataset.members) row.dataset.members = defaultMembersForProject(row.dataset.name).join(",");
  if (!row.dataset.icon) row.dataset.icon = row.querySelector(".project-logo")?.getAttribute("src") || "";
}

function defaultMembersForProject(name) {
  const map = {
    "Acme Mobile App": ["John Doe", "Sarah Johnson", "Priya Rao", "Arun Roy", "Vikram Kumar"],
    "Website Redesign": ["Sarah Johnson", "Priya Rao", "Arun Roy"],
    "API Integration": ["John Doe", "Priya Rao", "Vikram Kumar"],
    "Marketing Platform": ["Sarah Johnson", "Arun Roy"],
    "Internal Tool": ["John Doe", "Vikram Kumar"]
  };
  return map[name] || ["John Doe"];
}

function splitValues(value) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
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

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// Demo: mark Active rows behavior for On Hold/Archived styling check already in CSS

// Initial
applyFilters();
