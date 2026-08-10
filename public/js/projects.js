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
    if (screen === "Dashboard") { window.location.href = "/"; return; }
    if (screen === "Gantt Chart") { window.location.href = "/gantt"; return; }
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
  const row = e.target.closest("tr");
  if (!row || row.hidden) return;
  const name = row.dataset.name;
  showToast(`${name} — detail view will open Dashboard for this project.`);
  // Example: set selected project and navigate
  // window.location.href = `/dashboard?project=${encodeURIComponent(name)}`;
});

// New Project dialog
const dialog = byId("newProjectDialog");
const newProjectBtn = byId("newProjectBtn");
const newProjectForm = byId("newProjectForm");

newProjectBtn.addEventListener("click", () => {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
});

byId("dialogCancel").addEventListener("click", () => dialog.close());

newProjectForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(newProjectForm);
  const name = String(data.get("name") || "").trim();
  const desc = String(data.get("description") || "").trim();
  if (!name) { showToast("Project name is required."); return; }
  // Create optimistic row (mock — will be replaced by API)
  const tr = document.createElement("tr");
  tr.dataset.name = name;
  tr.dataset.status = "Active";
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  tr.innerHTML = `
    <td class="project-name">${escapeHtml(name)}</td>
    <td><span class="status-pill active">Active</span></td>
    <td><div class="progress-cell"><div class="progress-bar"><i style="width: 0%"></i></div><span>0%</span></div></td>
    <td><div class="members-cell"><span class="member-avatars"><img src="https://i.pravatar.cc/100?img=32" alt="Member"/></span></div></td>
    <td class="muted">${today}</td>
  `;
  projectsBody.prepend(tr);
  dialog.close();
  newProjectForm.reset();
  applyFilters();
  showToast(`Project "${name}" created (mock). Connect to POST /api/v1/projects.`);
  if (desc) console.log("Project description:", desc);
});

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// Demo: mark Active rows behavior for On Hold/Archived styling check already in CSS

// Initial
applyFilters();
