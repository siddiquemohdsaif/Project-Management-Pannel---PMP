import { watchFirebaseUserProfile } from "./auth-ui.js";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const timeline = byId("timeline");
const filterButton = byId("filterButton");
const filterPopover = byId("filterPopover");
const taskTooltip = byId("taskTooltip");
let toastTimer;
let dayWidth = 45;

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

document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { window.location.href = button.dataset.route; }));
document.querySelectorAll("[data-screen]").forEach((button) => button.addEventListener("click", () => {
  const s = button.dataset.screen;
  if (s === "Dashboard") { window.location.href = "/dashboard"; return; }
  if (s === "Projects") { window.location.href = "/projects"; return; }
  if (s === "Tasks") { window.location.href = "/tasks"; return; }
  if (s === "Members") { window.location.href = "/members"; return; }
  if (s === "Activity") { window.location.href = "/activity"; return; }
  if (s === "Settings") { window.location.href = "/settings"; return; }
  showToast(`${s} screen is planned next.`);
}));

const projectSelector = byId("projectSelector");
const projectDropdown = byId("projectDropdown");
projectSelector.addEventListener("click", (event) => {
  event.stopPropagation();
  projectDropdown.hidden = !projectDropdown.hidden;
  projectSelector.setAttribute("aria-expanded", String(!projectDropdown.hidden));
});
document.querySelectorAll("[data-project]").forEach((button) => button.addEventListener("click", () => {
  byId("selectedProject").textContent = button.dataset.project;
  projectDropdown.hidden = true;
  projectSelector.setAttribute("aria-expanded", "false");
  showToast(`${button.dataset.project} selected. Timeline data remains mocked.`);
}));

filterButton.addEventListener("click", (event) => {
  event.stopPropagation();
  filterPopover.hidden = !filterPopover.hidden;
  filterButton.setAttribute("aria-expanded", String(!filterPopover.hidden));
});
byId("applyFilters").addEventListener("click", () => {
  const activeStatuses = new Set([...document.querySelectorAll("[data-filter-status]:checked")].map((input) => input.dataset.filterStatus));
  const showOverdue = document.querySelector("[data-filter-overdue]").checked;
  document.querySelectorAll("[data-status]").forEach((row) => row.classList.toggle("status-filtered", !activeStatuses.has(row.dataset.status)));
  byId("ganttFrame").classList.toggle("hide-overdue", !showOverdue);
  document.querySelector(".filter-count").textContent = String(activeStatuses.size + (showOverdue ? 1 : 0));
  requestAnimationFrame(renderDependencies);
  filterPopover.hidden = true;
  filterButton.setAttribute("aria-expanded", "false");
  showToast(`${activeStatuses.size} task statuses visible.`);
});

function setZoom(nextWidth) {
  dayWidth = Math.max(32, Math.min(61, nextWidth));
  timeline.style.setProperty("--day-width", `${dayWidth}px`);
  requestAnimationFrame(renderDependencies);
  showToast(`Timeline zoom: ${dayWidth}px per date column`);
}
byId("zoomOut").addEventListener("click", () => setZoom(dayWidth - 8));
byId("zoomIn").addEventListener("click", () => setZoom(dayWidth + 8));

byId("ganttSettings").addEventListener("click", () => {
  byId("ganttFrame").classList.toggle("compact");
  requestAnimationFrame(renderDependencies);
  showToast(byId("ganttFrame").classList.contains("compact") ? "Compact rows enabled" : "Comfortable rows enabled");
});

document.querySelectorAll(".row-toggle").forEach((button) => button.addEventListener("click", () => {
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  document.querySelectorAll(`[data-member="${button.dataset.group}"]`).forEach((row) => row.classList.toggle("is-hidden", expanded));
  requestAnimationFrame(renderDependencies);
}));

function positionTooltip(event) {
  const margin = 14;
  const width = 255;
  const height = taskTooltip.offsetHeight || 190;
  const left = Math.min(event.clientX + margin, window.innerWidth - width - margin);
  const top = event.clientY + margin + height > window.innerHeight ? event.clientY - height - margin : event.clientY + margin;
  taskTooltip.style.left = `${Math.max(margin, left)}px`;
  taskTooltip.style.top = `${Math.max(margin, top)}px`;
}

document.querySelectorAll(".gantt-bar[data-task]").forEach((bar) => {
  bar.addEventListener("mouseenter", (event) => {
    taskTooltip.innerHTML = `<strong>${bar.dataset.task}</strong><span class="tooltip-status">${bar.dataset.statusLabel}</span><dl><dt>Owner</dt><dd>${bar.dataset.owner}</dd><dt>Progress</dt><dd>${bar.dataset.progress}</dd><dt>Timeline</dt><dd>${bar.dataset.dates}</dd><dt>Variance</dt><dd>${bar.dataset.variance}</dd></dl>${bar.dataset.dependency ? `<div class="tooltip-dependency">Dependency: ${bar.dataset.dependency}</div>` : ""}`;
    taskTooltip.hidden = false;
    positionTooltip(event);
  });
  bar.addEventListener("mousemove", positionTooltip);
  bar.addEventListener("mouseleave", () => { taskTooltip.hidden = true; });
});

function findTaskBar(taskName) {
  return [...document.querySelectorAll(".gantt-bar[data-task]")].find((bar) => bar.dataset.task === taskName);
}

function dependencySegment(className, styles, title) {
  const segment = document.createElement("i");
  segment.className = `dependency-segment ${className}`;
  Object.assign(segment.style, styles);
  segment.title = title;
  return segment;
}

function bindDependencyTooltip(segment, linkText) {
  segment.addEventListener("mouseenter", (event) => {
    taskTooltip.innerHTML = `<strong>Task dependency</strong><span class="tooltip-status">Finish-to-start (FS)</span><div class="tooltip-dependency">${linkText}</div>`;
    taskTooltip.hidden = false;
    positionTooltip(event);
  });
  segment.addEventListener("mousemove", positionTooltip);
  segment.addEventListener("mouseleave", () => { taskTooltip.hidden = true; });
}

function renderDependencies() {
  const layer = byId("dependencyLayer");
  const body = document.querySelector(".timeline-body");
  if (!layer || !body) return;
  const bodyRect = body.getBoundingClientRect();

  layer.querySelectorAll(".dependency-edge").forEach((edge) => {
    edge.replaceChildren();
    const from = findTaskBar(edge.dataset.fromTask);
    const to = findTaskBar(edge.dataset.toTask);
    if (!from || !to || getComputedStyle(from).visibility === "hidden" || getComputedStyle(to).visibility === "hidden" || !from.offsetParent || !to.offsetParent) return;

    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const startX = fromRect.right - bodyRect.left;
    const startY = fromRect.top + fromRect.height / 2 - bodyRect.top;
    const endX = toRect.left - bodyRect.left;
    const endY = toRect.top + toRect.height / 2 - bodyRect.top;
    const gap = endX - startX;
    const routeX = gap >= 24 ? startX + gap / 2 : startX + 14;
    const title = edge.dataset.link;

    const first = dependencySegment("horizontal", { left: `${startX}px`, top: `${startY - 1}px`, width: `${Math.max(7, routeX - startX)}px` }, title);
    const vertical = dependencySegment("vertical", { left: `${routeX - 1}px`, top: `${Math.min(startY, endY)}px`, height: `${Math.abs(endY - startY)}px` }, title);
    const last = dependencySegment("horizontal", { left: `${Math.min(routeX, endX)}px`, top: `${endY - 1}px`, width: `${Math.max(7, Math.abs(endX - routeX))}px` }, title);
    [first, vertical, last].forEach((segment) => bindDependencyTooltip(segment, title));

    const anchor = document.createElement("i");
    anchor.className = "dependency-anchor";
    anchor.style.left = `${startX}px`;
    anchor.style.top = `${startY}px`;
    const arrow = document.createElement("i");
    arrow.className = "dependency-arrow";
    arrow.style.left = `${endX}px`;
    arrow.style.top = `${endY}px`;
    const label = document.createElement("small");
    label.className = "dependency-edge-label";
    label.textContent = "FS";
    label.style.left = `${routeX}px`;
    label.style.top = `${startY + (endY - startY) / 2}px`;
    edge.append(first, vertical, last, anchor, arrow, label);
  });
}

window.addEventListener("resize", renderDependencies);
requestAnimationFrame(renderDependencies);

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-wrap")) { filterPopover.hidden = true; filterButton.setAttribute("aria-expanded", "false"); }
  if (!event.target.closest(".project-menu-wrap")) { projectDropdown.hidden = true; projectSelector.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { filterPopover.hidden = true; projectDropdown.hidden = true; setSidebar(false); } });
