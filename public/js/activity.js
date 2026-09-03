import { watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";
import { dataCacheKeys, readDataCache, writeDataCache } from "./data-cache.js?v=pmp-20260820-1";

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
const pagination = byId("activityPagination");
const pageSize = 6;

let activities = [];
let filteredActivities = [];
let currentPage = 1;
let toastTimer;

watchFirebaseUserProfile();
loadActivity();

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
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSidebar(false); });

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    const routes = {
      Dashboard: "/dashboard",
      Projects: "/projects",
      Tasks: "/tasks",
      "Gantt Chart": "/gantt",
      Members: "/members",
      Attendance: "/attendance",
      Reports: "/attendance",
      Settings: "/settings"
    };
    if (routes[button.dataset.screen]) window.location.href = routes[button.dataset.screen];
    else showToast(`${button.dataset.screen} is planned next.`);
  });
});

[searchInput, actorFilter, typeFilter, dateFilter].forEach((control) => {
  control.addEventListener(control === searchInput ? "input" : "change", () => {
    currentPage = 1;
    applyFilters();
  });
});

activityList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-activity-id]");
  const activity = activities.find((item) => item.id === row?.dataset.activityId);
  if (!activity) return;
  if (activity.entity_type === "project") window.location.href = "/projects";
  else if (activity.project_id) window.location.href = `/tasks?project=${encodeURIComponent(activity.project_name)}&projectId=${encodeURIComponent(activity.project_id)}`;
});

byId("exportActivity").addEventListener("click", exportActivityCsv);

async function loadActivity() {
  const cached = readDataCache(dataCacheKeys.activities);
  if (Array.isArray(cached)) {
    activities = normalizeActivities(cached);
    renderActorFilter();
    applyFilters();
  } else {
    footerCount.textContent = "Loading activity";
  }

  try {
    const response = await fetch(`/api/activities?_=${Date.now()}`, { cache: "no-store" });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Activity could not be loaded.");
    activities = normalizeActivities(result.activities);
    writeDataCache(dataCacheKeys.activities, activities);
    renderActorFilter();
    applyFilters();
  } catch (error) {
    if (!Array.isArray(cached)) {
      activities = [];
      applyFilters();
    }
    showToast(error.message || "Activity could not be loaded.");
  }
}

function normalizeActivities(list) {
  return (Array.isArray(list) ? list : [])
    .map((activity) => ({ ...activity, created_at: String(activity.created_at || "") }))
    .sort((left, right) => activityTime(right) - activityTime(left));
}

function renderActorFilter() {
  const selected = actorFilter.value;
  const actors = new Map();
  activities.forEach((activity) => {
    if (activity.actor_email) actors.set(activity.actor_email, activity.actor_name || activity.actor_email);
  });
  actorFilter.replaceChildren(option("all", "All Actors"), ...[...actors.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([email, name]) => option(email, name)));
  actorFilter.value = actors.has(selected) ? selected : "all";
}

function option(value, label) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const actor = actorFilter.value;
  const type = typeFilter.value;
  const date = dateFilter.value;
  filteredActivities = activities.filter((activity) => {
    const description = activityDescription(activity);
    const text = [activity.summary, description, activity.actor_name, activity.actor_email, activity.project_name, activity.entity_name].join(" ").toLowerCase();
    return (!query || text.includes(query))
      && (actor === "all" || activity.actor_email === actor)
      && (type === "all" || activityCategory(activity) === type)
      && matchesDate(activity.created_at, date);
  });
  const pageCount = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  currentPage = Math.min(currentPage, pageCount);
  renderActivityRows();
  renderPagination(pageCount);
}

function renderActivityRows() {
  const start = (currentPage - 1) * pageSize;
  const pageItems = filteredActivities.slice(start, start + pageSize);
  activityList.replaceChildren(...pageItems.map(activityRow));
  emptyState.hidden = filteredActivities.length !== 0;
  if (!filteredActivities.length) footerCount.textContent = "No activity events";
  else footerCount.textContent = `Showing ${start + 1} to ${Math.min(start + pageSize, filteredActivities.length)} of ${filteredActivities.length} events`;
}

function activityRow(activity) {
  const row = document.createElement("article");
  row.className = "activity-item";
  row.dataset.activityId = activity.id;
  row.tabIndex = 0;
  row.setAttribute("aria-label", `${activity.summary}. ${activityDescription(activity)}`);

  const actor = document.createElement("span");
  actor.className = "activity-relation";
  actor.title = `${activity.actor_name || "User"} acted on ${activity.project_name || "this project"}`;
  const avatar = document.createElement("span");
  avatar.className = "activity-avatar";
  renderVisualIcon(avatar, activity.actor_profile_url, userFallbackIcon());
  const arrow = document.createElement("span");
  arrow.className = "activity-link-arrow";
  arrow.setAttribute("aria-hidden", "true");
  const projectIcon = document.createElement("span");
  projectIcon.className = "activity-project-icon";
  renderVisualIcon(projectIcon, activity.project_icon_url, projectFallbackIcon());
  actor.append(avatar, arrow, projectIcon);

  const copy = document.createElement("div");
  copy.className = "activity-copy";
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  title.textContent = activity.summary || "Activity recorded";
  detail.textContent = activityDescription(activity);
  copy.append(title, detail);

  const time = document.createElement("time");
  time.className = "activity-meta";
  time.dateTime = activity.created_at;
  time.textContent = formatActivityTime(activity.created_at);
  row.append(actor, copy, time);
  row.addEventListener("keydown", (event) => { if (event.key === "Enter") row.click(); });
  return row;
}

function activityDescription(activity) {
  const actor = activity.actor_name || activity.actor_email || "A user";
  const project = activity.project_name || "the project";
  const changes = activity.changes || {};
  const metadata = activity.metadata || {};
  switch (activity.event_type) {
    case "project_created":
      return `${actor} created a new ${metadata.platform || ""} project.`.replace("new  project", "new project");
    case "project_status_changed":
      return `${actor} changed the project status from ${changes.from || "its previous status"} to ${changes.to || "a new status"}.`;
    case "project_members_changed": {
      const added = Array.isArray(metadata.added) ? metadata.added.length : 0;
      const removed = Array.isArray(metadata.removed) ? metadata.removed.length : 0;
      const parts = [added ? `added ${added} ${added === 1 ? "member" : "members"}` : "", removed ? `removed ${removed} ${removed === 1 ? "member" : "members"}` : ""].filter(Boolean);
      return `${actor} ${parts.join(" and ") || "updated project members"} in ${project}.`;
    }
    case "project_updated":
      return `${actor} updated ${fieldList(changes.fields)} in ${project}.`;
    case "task_created":
      return `${actor} created a new task in ${project}${metadata.subtask_count ? ` with ${metadata.subtask_count} ${metadata.subtask_count === 1 ? "subtask" : "subtasks"}` : ""}.`;
    case "bulk_tasks_uploaded":
      return `${actor} uploaded ${metadata.main_task_count || 0} main tasks and ${metadata.subtask_count || 0} subtasks to ${project}.`;
    case "task_status_changed":
      return `${actor} changed the task status in ${project} from ${changes.from || "its previous status"} to ${changes.to || "a new status"}${metadata.auto_completed_subtasks ? ` and completed ${metadata.auto_completed_subtasks} remaining subtasks` : ""}.`;
    case "subtask_status_changed":
      return `${actor} changed this subtask in ${metadata.parent_task_name || "its parent task"} from ${changes.from || "its previous status"} to ${changes.to || "a new status"}.`;
    case "task_updated":
      return `${actor} updated ${fieldList(changes.fields)} on this task in ${project}.`;
    case "task_deleted":
      return `${actor} deleted this task from ${project}.`;
    default:
      return `${actor} made an update in ${project}.`;
  }
}

function fieldList(fields) {
  const labels = {
    main_task_name: "task name",
    description: "description",
    assignee: "assignees",
    start_date: "start date",
    due_date: "end date",
    priority: "priority",
    dependency_tasks: "dependencies",
    sub_tasks: "subtasks",
    project_name: "project name",
    platform: "platform",
    project_icon_url: "project icon"
  };
  const values = (Array.isArray(fields) ? fields : []).map((field) => labels[field] || field.replaceAll("_", " "));
  if (!values.length) return "task details";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}

function activityCategory(activity) {
  if (activity.event_type === "project_members_changed") return "Member";
  if (activity.entity_type === "project") return "Project";
  return "Task";
}

function renderVisualIcon(container, imageUrl, fallback) {
  container.replaceChildren(fallback);
  if (!imageUrl) return;
  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("load", () => container.replaceChildren(image), { once: true });
  image.src = imageUrl;
}

function userFallbackIcon() {
  return svgIcon([
    ["circle", { cx: "12", cy: "8", r: "3.5" }],
    ["path", { d: "M5 20v-1.5a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6V20" }]
  ]);
}

function projectFallbackIcon() {
  return svgIcon([
    ["circle", { cx: "9", cy: "7", r: "3" }],
    ["path", { d: "M3.5 20v-2A4.5 4.5 0 0 1 8 13.5h2a4.5 4.5 0 0 1 4.5 4.5v2" }],
    ["path", { d: "M16 8a3 3 0 0 1 0 5.8" }],
    ["path", { d: "M17 20v-1.5a4.5 4.5 0 0 0-2.3-3.9" }]
  ]);
}

function svgIcon(elements) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  elements.forEach(([tag, attributes]) => {
    const element = document.createElementNS(namespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    svg.append(element);
  });
  return svg;
}

function renderPagination(pageCount) {
  pagination.replaceChildren();
  if (filteredActivities.length <= pageSize) return;
  pagination.append(pageButton("Previous page", "‹", currentPage - 1, currentPage === 1));
  paginationPages(currentPage, pageCount).forEach((page) => {
    if (page === "ellipsis") {
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      pagination.append(ellipsis);
      return;
    }
    const button = pageButton(`Page ${page}`, String(page), page, false);
    if (page === currentPage) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    pagination.append(button);
  });
  pagination.append(pageButton("Next page", "›", currentPage + 1, currentPage === pageCount));
}

function paginationPages(page, pageCount) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) result.push("ellipsis");
    result.push(value);
  });
  return result;
}

function pageButton(label, text, page, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.textContent = text;
  button.disabled = disabled;
  button.addEventListener("click", () => {
    currentPage = page;
    renderActivityRows();
    renderPagination(Math.max(1, Math.ceil(filteredActivities.length / pageSize)));
    activityList.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return button;
}

function matchesDate(value, filter) {
  if (filter === "all") return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  if (filter === "Today") return date.toDateString() === now.toDateString();
  if (filter === "This Month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  const weekStart = new Date(now);
  const day = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);
  return date >= weekStart && date <= now;
}

function formatActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const now = new Date();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

function exportActivityCsv() {
  if (!filteredActivities.length) return showToast("There is no activity to export.");
  const rows = [["Timestamp", "Actor", "Actor Email", "Type", "Project", "Activity", "Details"], ...filteredActivities.map((activity) => [
    activity.created_at,
    activity.actor_name,
    activity.actor_email,
    activityCategory(activity),
    activity.project_name,
    activity.summary,
    activityDescription(activity)
  ])];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pmp-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function activityTime(activity) {
  const time = Date.parse(activity.created_at);
  return Number.isNaN(time) ? 0 : time;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
