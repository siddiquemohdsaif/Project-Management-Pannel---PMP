import { watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";
import { dataCacheKeys, readDataCache, writeDataCache } from "./data-cache.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const projectSelector = byId("projectSelector");
const projectDropdown = byId("projectDropdown");
const selectedProject = byId("selectedProject");
const activeProjectMark = byId("activeProjectMark");
const activeProjectIcon = byId("activeProjectIcon");
const activeProjectIconFallback = byId("activeProjectIconFallback");
const notificationButton = byId("notificationButton");
const notificationDropdown = byId("notificationDropdown");
const toast = byId("toast");
const statusOrder = ["Completed", "In Progress", "Partially Completed", "Blocked", "Not Started"];
const statusColors = ["#25ad53", "#2275ed", "#f69228", "#ed3f42", "#9da8b7"];

let projects = [];
let tasks = [];
let activeProjectId = localStorage.getItem("activeProjectId") || "";
let activeProjectName = localStorage.getItem("activeProject") || "";
let toastTimer;

watchFirebaseUserProfile();
selectedProject.textContent = activeProjectName || "Select Project";
loadDashboard();

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

function closeDropdowns(except) {
  if (except !== projectDropdown) {
    projectDropdown.hidden = true;
    projectSelector.setAttribute("aria-expanded", "false");
  }
  if (except !== notificationDropdown) {
    notificationDropdown.hidden = true;
    notificationButton.setAttribute("aria-expanded", "false");
  }
}

function toggleDropdown(dropdown, trigger) {
  const shouldOpen = dropdown.hidden;
  closeDropdowns(dropdown);
  dropdown.hidden = !shouldOpen;
  trigger.setAttribute("aria-expanded", String(shouldOpen));
}

byId("mobileMenu").addEventListener("click", () => setSidebar(true));
byId("sidebarClose").addEventListener("click", () => setSidebar(false));
sidebarScrim.addEventListener("click", () => setSidebar(false));
projectSelector.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDropdown(projectDropdown, projectSelector);
});
notificationButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDropdown(notificationDropdown, notificationButton);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".dropdown")) closeDropdowns();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDropdowns();
    setSidebar(false);
  }
});

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
      Activity: "/activity",
      Settings: "/settings"
    };
    if (routes[button.dataset.screen]) window.location.href = routes[button.dataset.screen];
    else showToast(`${button.dataset.screen} is planned next.`);
  });
});

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    const routes = { Tasks: "/tasks", Gantt: "/gantt", Members: "/members", Attendance: "/attendance", Reports: "/attendance", Activity: "/activity" };
    if (routes[tab.dataset.tab]) window.location.href = routes[tab.dataset.tab];
  });
});

document.querySelectorAll("[data-filter]").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active-filter"));
    card.classList.add("active-filter");
    showToast(`${card.dataset.filter}: ${card.querySelector(".status-body strong")?.textContent || 0} tasks.`);
  });
});

byId("markRead").addEventListener("click", (event) => {
  event.stopPropagation();
  const count = document.querySelector(".notification-count");
  count.textContent = "0";
  count.hidden = true;
  notificationButton.setAttribute("aria-label", "No unread notifications");
  closeDropdowns();
});

document.querySelectorAll(".card-menu").forEach((button) => {
  button.addEventListener("click", () => showToast("No additional chart actions are available yet."));
});

async function loadDashboard() {
  hydrateCachedDashboard();
  try {
    const projectsResponse = await freshFetch("/api/projects?progress=false");
    const projectsResult = await readJson(projectsResponse);
    if (!projectsResponse.ok) throw new Error(projectsResult.error || "Projects could not be loaded.");
    projects = Array.isArray(projectsResult.projects) ? projectsResult.projects : [];
    writeDataCache(dataCacheKeys.projects, projects);
    renderProjectDropdown();
    const project = findActiveProject();
    if (!project) return renderEmptyProject();
    await activateProject(project, true);
  } catch (error) {
    if (!projects.length) renderEmptyProject();
    showToast(error.message || "Dashboard data could not be loaded.");
  }
}

function hydrateCachedDashboard() {
  const cachedProjects = readDataCache(dataCacheKeys.projects);
  if (!Array.isArray(cachedProjects)) return;
  projects = cachedProjects;
  renderProjectDropdown();
  const project = findActiveProject();
  if (!project) return;
  setActiveProject(project);
  const cachedTasks = readDataCache(dataCacheKeys.tasks(project.id));
  if (Array.isArray(cachedTasks)) {
    tasks = cachedTasks;
    renderDashboard();
  }
}

function findActiveProject() {
  return projects.find((project) => project.id === activeProjectId)
    || projects.find((project) => project.project_name === activeProjectName)
    || projects[0];
}

async function activateProject(project, fetchLive = true) {
  setActiveProject(project);
  const cachedTasks = readDataCache(dataCacheKeys.tasks(project.id));
  tasks = Array.isArray(cachedTasks) ? cachedTasks : [];
  renderDashboard();
  if (!fetchLive) return;

  try {
    const response = await freshFetch(`/api/projects/${encodeURIComponent(project.id)}/tasks`);
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Tasks could not be loaded.");
    if (activeProjectId !== project.id) return;
    tasks = Array.isArray(result.tasks) ? result.tasks : [];
    writeDataCache(dataCacheKeys.tasks(project.id), tasks);
    renderDashboard();
  } catch (error) {
    showToast(error.message || "Tasks could not be loaded.");
  }
}

function setActiveProject(project) {
  activeProjectId = project.id;
  activeProjectName = project.project_name || "Untitled Project";
  localStorage.setItem("activeProjectId", activeProjectId);
  localStorage.setItem("activeProject", activeProjectName);
  selectedProject.textContent = activeProjectName;
  renderActiveProjectIcon(project);
}

function renderProjectDropdown() {
  projectDropdown.replaceChildren();
  const label = document.createElement("span");
  label.className = "dropdown-label";
  label.textContent = "Switch project";
  projectDropdown.append(label);
  projects.forEach((project) => {
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("strong");
    const detail = document.createElement("small");
    name.textContent = project.project_name || "Untitled Project";
    detail.textContent = `${Math.max(0, Math.min(100, Number(project.progress_percent || 0)))}% complete`;
    button.append(name, detail);
    button.addEventListener("click", () => {
      closeDropdowns();
      activateProject(project, true);
    });
    projectDropdown.append(button);
  });
}

function renderActiveProjectIcon(project) {
  const iconUrl = String(project?.project_icon_url || "").trim();
  activeProjectMark.classList.toggle("has-project-icon", Boolean(iconUrl));
  activeProjectIconFallback.hidden = Boolean(iconUrl);
  activeProjectIcon.hidden = !iconUrl;
  if (!iconUrl) {
    activeProjectIcon.removeAttribute("src");
    return;
  }
  activeProjectIcon.src = iconUrl;
  activeProjectIcon.onerror = () => {
    activeProjectMark.classList.remove("has-project-icon");
    activeProjectIcon.hidden = true;
    activeProjectIconFallback.hidden = false;
  };
}

function renderEmptyProject() {
  selectedProject.textContent = "No Projects";
  activeProjectMark.classList.remove("has-project-icon");
  activeProjectIcon.hidden = true;
  activeProjectIconFallback.hidden = false;
  tasks = [];
  renderDashboard();
}

function renderDashboard() {
  const total = tasks.length;
  const counts = Object.fromEntries(statusOrder.map((status) => [status, tasks.filter((task) => task.status === status).length]));
  const completed = counts.Completed;
  const progress = percentage(completed, total);
  const today = endOfDay(new Date());
  const overdue = tasks.filter((task) => task.status !== "Completed" && validDate(task.due_date) && dateFromIsoDay(task.due_date) < startOfDay(today)).length;
  const plannedCount = tasks.filter((task) => validDate(task.due_date) && endOfDay(dateFromIsoDay(task.due_date)) <= today).length;
  const plannedProgress = percentage(plannedCount, total);
  const variance = progress - plannedProgress;
  const latestDueDate = tasks.map((task) => task.due_date).filter(validDate).sort().at(-1) || "";

  byId("plannedFinish").textContent = latestDueDate ? formatLongDate(latestDueDate) : "No date";
  byId("totalTasks").textContent = total;
  byId("completedTasks").textContent = completed;
  byId("completedPercent").textContent = `${progress}%`;
  byId("progressPercent").textContent = progress;
  byId("progressCount").textContent = `${completed} of ${total}`;
  byId("progressBar").style.width = `${progress}%`;
  byId("progressBarLabel").textContent = `${progress}%`;
  byId("progressOrbit").style.background = `conic-gradient(var(--blue-600) 0 ${progress}%, #dce8fb ${progress}% 100%)`;
  byId("progressOrbit").setAttribute("aria-label", `Project is ${progress} percent complete`);
  renderVariance(variance);

  setMetric("inProgress", counts["In Progress"], total);
  setMetric("partial", counts["Partially Completed"], total);
  setMetric("blocked", counts.Blocked, total);
  setMetric("notStarted", counts["Not Started"], total);
  setMetric("overdue", overdue, total);
  renderStatusChart(counts, total, completed, progress);
  renderProgressChart(buildProgressData(tasks));
}

function setMetric(prefix, count, total) {
  byId(`${prefix}Tasks`).textContent = count;
  byId(`${prefix}Percent`).textContent = `${percentage(count, total)}%`;
}

function renderVariance(variance) {
  const absolute = Math.abs(variance);
  const state = variance > 0 ? "Ahead of plan" : variance < 0 ? "Behind plan" : "On plan";
  const direction = variance > 0 ? "↑" : variance < 0 ? "↓" : "•";
  const comparison = variance > 0 ? `${absolute}% ahead of plan` : variance < 0 ? `${absolute}% behind plan` : "on plan";
  byId("progressTrend").innerHTML = `<b>${direction}</b> ${absolute}% vs plan`;
  byId("progressTrend").classList.toggle("behind", variance < 0);
  byId("progressState").textContent = state;
  byId("progressComparison").innerHTML = `Actual delivery is <strong>${comparison}</strong>`;
}

function renderStatusChart(counts, total, completed, progress) {
  byId("statusTasksSummary").textContent = `${total} active ${total === 1 ? "task" : "tasks"} in this project`;
  byId("statusInsight").lastChild.textContent = `${progress}% completed`;
  byId("donutTotal").textContent = total;
  byId("donutCompleted").textContent = `${completed} completed`;

  const legendIds = ["Completed", "InProgress", "Partial", "Blocked", "NotStarted"];
  statusOrder.forEach((status, index) => {
    const count = counts[status];
    const percent = percentage(count, total);
    byId(`legend${legendIds[index]}Count`).textContent = count;
    byId(`legend${legendIds[index]}Percent`).textContent = `${percent}%`;
    byId(`legend${legendIds[index]}Meter`).style.width = `${percent}%`;
  });

  const donut = byId("statusDonut");
  if (!total) {
    donut.style.background = "#edf1f5";
    donut.setAttribute("aria-label", "No tasks");
    return;
  }
  let cursor = 0;
  const segments = statusOrder.flatMap((status, index) => {
    const start = cursor;
    const share = (counts[status] / total) * 100;
    cursor += share;
    if (!share) return [];
    const gap = index < statusOrder.length - 1 ? Math.min(0.6, share / 3) : 0;
    const colorEnd = cursor - gap;
    return gap
      ? [`${statusColors[index]} ${start}% ${colorEnd}%`, `#fff ${colorEnd}% ${cursor}%`]
      : [`${statusColors[index]} ${start}% ${cursor}%`];
  });
  donut.style.background = `conic-gradient(${segments.join(", ")})`;
  donut.setAttribute("aria-label", statusOrder.map((status) => `${counts[status]} ${status.toLowerCase()}`).join(", "));
}

function buildProgressData(taskList) {
  const scheduled = taskList.filter((task) => validDate(task.due_date));
  if (!scheduled.length) {
    const completed = taskList.filter((task) => completionDate(task)).length;
    return { dates: [startOfDay(new Date())], planned: [0], actual: [percentage(completed, taskList.length)] };
  }

  const starts = scheduled.map((task) => validDate(task.start_date) ? dateFromIsoDay(task.start_date) : dateFromIsoDay(task.due_date));
  const start = new Date(Math.min(...starts.map(Number)));
  const end = new Date(Math.max(...scheduled.map((task) => Number(dateFromIsoDay(task.due_date)))));
  const dates = chartDates(start, end);
  const today = endOfDay(new Date());
  const planned = dates.map((date) => percentage(scheduled.filter((task) => endOfDay(dateFromIsoDay(task.due_date)) <= endOfDay(date)).length, taskList.length));
  const actual = dates.map((date) => {
    if (endOfDay(date) > today) return null;
    return percentage(taskList.filter((task) => {
      const completedAt = completionDate(task);
      return completedAt && completedAt <= endOfDay(date);
    }).length, taskList.length);
  });
  return { dates, planned, actual };
}

function chartDates(start, end) {
  const dayMs = 86400000;
  const span = Math.max(0, Math.round((end - start) / dayMs));
  if (!span) return [start];
  const count = Math.min(6, span + 1);
  const values = Array.from({ length: count }, (_, index) => new Date(start.getTime() + (span * dayMs * index) / (count - 1)));
  const today = startOfDay(new Date());
  if (today > start && today < end && !values.some((date) => date.toDateString() === today.toDateString())) values.push(today);
  return values.sort((a, b) => a - b);
}

function renderProgressChart(data) {
  const svg = byId("progressChartSvg");
  const left = 55;
  const right = 610;
  const top = 28;
  const bottom = 244;
  const points = data.dates.length;
  const x = (index) => points === 1 ? (left + right) / 2 : left + ((right - left) * index) / (points - 1);
  const y = (value) => bottom - ((bottom - top) * value) / 100;
  const path = (values) => {
    const available = values.map((value, index) => ({ value, index })).filter(({ value }) => value !== null);
    return available.map(({ value, index }, pathIndex) => `${pathIndex ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");
  };
  const actualPoints = data.actual.map((value, index) => ({ value, index })).filter(({ value }) => value !== null);
  const gridValues = [100, 75, 50, 25, 0];

  svg.innerHTML = `
    <g class="chart-grid">
      ${gridValues.map((value) => `<path d="M${left} ${y(value)}H${right}" />`).join("")}
      ${gridValues.map((value) => `<text x="45" y="${y(value) + 4}">${value}%</text>`).join("")}
    </g>
    <path class="chart-planned-path" d="${path(data.planned)}" />
    <path class="chart-actual-path" d="${path(data.actual)}" />
    <g class="chart-points">${actualPoints.map(({ value, index }) => `<circle cx="${x(index)}" cy="${y(value)}" r="5"/>`).join("")}</g>
    <g class="chart-values">${actualPoints.map(({ value, index }) => `<text x="${x(index)}" y="${Math.max(16, y(value) - 17)}">${value}%</text>`).join("")}</g>
    <g class="chart-dates">${data.dates.map((date, index) => `<text x="${x(index)}" y="278">${formatChartDate(date)}</text>`).join("")}</g>
  `;
  svg.setAttribute("aria-label", `Planned and actual progress over time for ${activeProjectName || "the selected project"}`);
}

function percentage(count, total) {
  return total ? Math.round((count / total) * 100) : 0;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(dateFromIsoDay(value).getTime());
}

function dateFromIsoDay(value) {
  return new Date(`${value}T00:00:00`);
}

function completionDate(task) {
  if (task.status !== "Completed" || !task.completed_at) return null;
  const date = new Date(task.completed_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function formatLongDate(value) {
  return dateFromIsoDay(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatChartDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function freshFetch(url, options = {}) {
  const separator = url.includes("?") ? "&" : "?";
  return fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store", ...options });
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
