import { watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const searchInput = byId("searchInput");
const actorFilter = byId("actorFilter");
const typeFilter = byId("typeFilter");
const dateFilter = byId("dateFilter");
const activityList = byId("activityList");
const emptyState = byId("emptyState");
const footerCount = byId("footerCount");
let toastTimer;

watchFirebaseUserProfile();

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
    if (screen === "Members") { window.location.href = "/members"; return; }
    if (screen === "Settings") { window.location.href = "/settings"; return; }
    setSidebar(false);
    showToast(`${screen} is planned next. Activity is now live.`);
  });
});

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const actor = actorFilter.value;
  const type = typeFilter.value;
  const date = dateFilter.value;
  let visible = 0;
  const items = [...activityList.querySelectorAll(".activity-item")];

  items.forEach((item) => {
    const matchesSearch = !q || item.dataset.text.toLowerCase().includes(q);
    const matchesActor = actor === "all" || item.dataset.actor === actor;
    const matchesType = type === "all" || item.dataset.type === type;
    const matchesDate = date === "all" || item.dataset.date === date;
    const show = matchesSearch && matchesActor && matchesType && matchesDate;
    item.hidden = !show;
    if (show) visible++;
  });

  emptyState.hidden = visible !== 0;
  footerCount.textContent = visible === items.length
    ? "Showing 1 to 6 of 42 events"
    : `Showing ${visible} of ${items.length} visible events`;
}

[searchInput, actorFilter, typeFilter, dateFilter].forEach((control) => {
  control.addEventListener(control === searchInput ? "input" : "change", applyFilters);
});

byId("exportActivity").addEventListener("click", () => {
  showToast("Activity export will connect to the audit API.");
});

activityList.addEventListener("click", (event) => {
  const item = event.target.closest(".activity-item");
  if (item && !item.hidden) showToast("Activity detail link will open next.");
});

applyFilters();
