import { watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";
import { dataCacheKeys, readDataCache, writeDataCache } from "./data-cache.js?v=pmp-20260820-1";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const projectSelector = byId("projectSelector");
const projectDropdown = byId("projectDropdown");
const selectedProject = byId("selectedProject");
const activeProjectMark = byId("activeProjectMark");
const activeProjectIcon = byId("activeProjectIcon");
const activeProjectIconFallback = byId("activeProjectIconFallback");
const filterButton = byId("filterButton");
const filterPopover = byId("filterPopover");
const ganttFrame = byId("ganttFrame");
const ganttState = byId("ganttState");
const taskRows = byId("taskRows");
const timeline = byId("timeline");
const timelineScroll = byId("timelineScroll");
const monthRow = byId("monthRow");
const daysRow = byId("daysRow");
const timelineBody = byId("timelineBody");
const taskTooltip = byId("taskTooltip");
const scheduleHealth = byId("scheduleHealth");
const statusKeys = new Set(["completed", "progress", "partial", "blocked", "not-started"]);
const dayMilliseconds = 86400000;

let projects = [];
let members = [];
let tasks = [];
let activeProject = null;
let activeProjectId = new URLSearchParams(window.location.search).get("projectId") || localStorage.getItem("activeProjectId") || "";
let activeProjectName = new URLSearchParams(window.location.search).get("project") || localStorage.getItem("activeProject") || "";
let visibleStatuses = new Set(statusKeys);
let collapsedTasks = new Set();
let showOverdue = true;
let dayWidth = 38;
let timelineStart = null;
let timelineEnd = null;
let visibleRows = [];
let dependencyLinks = [];
let toastTimer;

watchFirebaseUserProfile();
hydrateCachedPage();
loadPage();

function showToast(message) {
  clearTimeout(toastTimer);
  const toast = byId("toast");
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
document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { window.location.href = button.dataset.route; }));
document.querySelectorAll("[data-screen]").forEach((button) => button.addEventListener("click", () => {
  const routes = { Projects: "/projects", Tasks: "/tasks", Members: "/members", Activity: "/activity", Settings: "/settings" };
  if (routes[button.dataset.screen]) window.location.href = routes[button.dataset.screen];
  else if (button.dataset.screen !== "Profiles") showToast(`${button.dataset.screen} is planned next.`);
}));

projectSelector.addEventListener("click", (event) => {
  event.stopPropagation();
  projectDropdown.hidden = !projectDropdown.hidden;
  projectSelector.setAttribute("aria-expanded", String(!projectDropdown.hidden));
});
filterButton.addEventListener("click", (event) => {
  event.stopPropagation();
  filterPopover.hidden = !filterPopover.hidden;
  filterButton.setAttribute("aria-expanded", String(!filterPopover.hidden));
});
byId("applyFilters").addEventListener("click", () => {
  visibleStatuses = new Set([...document.querySelectorAll("[data-filter-status]:checked")].map((input) => input.dataset.filterStatus));
  showOverdue = Boolean(document.querySelector("[data-filter-overdue]")?.checked);
  document.querySelector(".filter-count").textContent = String(visibleStatuses.size + (showOverdue ? 1 : 0));
  filterPopover.hidden = true;
  filterButton.setAttribute("aria-expanded", "false");
  renderChart();
});
byId("zoomOut").addEventListener("click", () => setZoom(dayWidth - 7));
byId("zoomIn").addEventListener("click", () => setZoom(dayWidth + 7));
byId("ganttSettings").addEventListener("click", () => {
  ganttFrame.classList.toggle("compact");
  requestAnimationFrame(renderDependencies);
  showToast(ganttFrame.classList.contains("compact") ? "Compact rows enabled" : "Comfortable rows enabled");
});
taskRows.addEventListener("click", (event) => {
  const toggleAll = event.target.closest("[data-toggle-all-tasks]");
  if (toggleAll) {
    const expandableIds = tasks.filter((task) => task.sub_tasks?.length).map((task) => task.id);
    const allExpanded = expandableIds.length > 0 && expandableIds.every((taskId) => !collapsedTasks.has(taskId));
    collapsedTasks = allExpanded ? new Set(expandableIds) : new Set();
    renderChart();
    return;
  }
  const toggle = event.target.closest("[data-toggle-task]");
  if (!toggle) return;
  const taskId = toggle.dataset.toggleTask;
  collapsedTasks.has(taskId) ? collapsedTasks.delete(taskId) : collapsedTasks.add(taskId);
  renderChart();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-wrap")) closeFilter();
  if (!event.target.closest(".project-menu-wrap")) closeProjectDropdown();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeFilter();
  closeProjectDropdown();
  hideTooltip();
  setSidebar(false);
});
window.addEventListener("resize", renderDependencies);

function closeFilter() {
  filterPopover.hidden = true;
  filterButton.setAttribute("aria-expanded", "false");
}

function closeProjectDropdown() {
  projectDropdown.hidden = true;
  projectSelector.setAttribute("aria-expanded", "false");
}

function hydrateCachedPage() {
  const cachedProjects = readDataCache(dataCacheKeys.projects);
  const cachedMembers = readDataCache(dataCacheKeys.members);
  if (Array.isArray(cachedProjects)) projects = cachedProjects;
  if (Array.isArray(cachedMembers)) members = normalizeMembers(cachedMembers);
  renderProjectDropdown();
  const project = findActiveProject();
  if (!project) return setChartState("Loading project schedule...");
  setActiveProject(project);
  const cachedTasks = readDataCache(dataCacheKeys.tasks(project.id));
  if (Array.isArray(cachedTasks)) {
    tasks = normalizeTasks(cachedTasks);
    renderChart();
  } else {
    setChartState("Loading project schedule...");
  }
}

async function loadPage() {
  const [projectResult, memberResult] = await Promise.allSettled([
    fetchJson("/api/projects?progress=false"),
    fetchJson("/api/members")
  ]);

  if (projectResult.status === "fulfilled") {
    projects = Array.isArray(projectResult.value.projects) ? projectResult.value.projects : [];
    writeDataCache(dataCacheKeys.projects, projects);
  }
  if (memberResult.status === "fulfilled") {
    members = normalizeMembers(memberResult.value.members);
    writeDataCache(dataCacheKeys.members, members);
  }
  renderProjectDropdown();
  const project = findActiveProject();
  if (!project) {
    selectedProject.textContent = "No Projects";
    renderActiveProjectIcon(null);
    setChartState("Create a project to start building its schedule.", "empty");
    return;
  }
  await activateProject(project, true);
  if (projectResult.status === "rejected") showToast(projectResult.reason.message || "Projects could not be refreshed.");
  if (memberResult.status === "rejected") showToast(memberResult.reason.message || "Member profiles could not be refreshed.");
}

function findActiveProject() {
  return projects.find((project) => project.id === activeProjectId)
    || projects.find((project) => project.project_name === activeProjectName)
    || projects[0];
}

async function activateProject(project, fetchLive) {
  setActiveProject(project);
  const cached = readDataCache(dataCacheKeys.tasks(project.id));
  tasks = Array.isArray(cached) ? normalizeTasks(cached) : [];
  updateSummary();
  if (tasks.length) renderChart();
  else setChartState(fetchLive ? "Loading project schedule..." : "No tasks have been scheduled for this project.", "empty");
  if (!fetchLive) return;

  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(project.id)}/tasks`);
    if (activeProjectId !== project.id) return;
    tasks = normalizeTasks(result.tasks);
    writeDataCache(dataCacheKeys.tasks(project.id), tasks);
    renderChart();
  } catch (error) {
    if (!tasks.length) setChartState("The project schedule could not be loaded. Refresh to try again.", "error");
    showToast(error.message || "Tasks could not be refreshed.");
  }
}

function setActiveProject(project) {
  activeProject = project;
  activeProjectId = project.id;
  activeProjectName = project.project_name || "Untitled Project";
  localStorage.setItem("activeProjectId", activeProjectId);
  localStorage.setItem("activeProject", activeProjectName);
  selectedProject.textContent = activeProjectName;
  byId("ganttTitle").textContent = `${activeProjectName} Gantt chart`;
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
      closeProjectDropdown();
      collapsedTasks = new Set();
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

function renderChart() {
  updateSummary();
  if (!activeProject) return setChartState("Select a project to view its schedule.", "empty");
  if (!tasks.length) return setChartState("No tasks have been scheduled for this project.", "empty");
  const range = scheduleBounds(tasks);
  if (!range) return setChartState("Add a start date and end date to display these tasks on the timeline.", "empty");
  timelineStart = range.start;
  timelineEnd = range.end;
  visibleRows = buildVisibleRows();
  if (visibleRows.length === 1) return setChartState("No tasks match the selected status filters.", "empty");
  ganttFrame.hidden = false;
  ganttState.hidden = true;
  renderTimelineHeader();
  renderRows();
  renderHealth();
  requestAnimationFrame(() => {
    renderDependencies();
    scrollTodayIntoView();
  });
}

function setChartState(message, state = "loading") {
  ganttFrame.hidden = true;
  ganttState.hidden = false;
  ganttState.className = `gantt-state ${state}`;
  ganttState.textContent = message;
  renderHealth();
}

function updateSummary() {
  const subtasks = tasks.flatMap((task) => task.sub_tasks || []);
  const validIds = new Set(tasks.map((task) => task.id));
  const dependencies = tasks.reduce((count, task) => count + (task.dependency_tasks || []).filter((dependency) => validIds.has(dependency.dependency_task_id)).length, 0);
  const range = scheduleBounds(tasks);
  byId("mainTaskCount").textContent = tasks.length;
  byId("subtaskCount").textContent = subtasks.length;
  byId("dependencyCount").textContent = dependencies;
  byId("workingDays").textContent = range ? countWorkingDays(range.start, range.end) : 0;
  byId("scheduleRange").textContent = range ? `${formatDate(range.start)} - ${formatDate(range.end)}` : "No scheduled dates";
}

function renderHealth() {
  const overdueCount = tasks.filter(isOverdue).length;
  const blockedCount = tasks.filter((task) => task.status === "Blocked").length;
  scheduleHealth.className = overdueCount ? "danger" : blockedCount ? "warning" : "healthy";
  scheduleHealth.querySelector("b").textContent = overdueCount
    ? `${overdueCount} overdue ${overdueCount === 1 ? "task" : "tasks"}`
    : blockedCount
      ? `${blockedCount} blocked ${blockedCount === 1 ? "task" : "tasks"}`
      : tasks.length ? "Schedule healthy" : "No schedule yet";
}

function buildVisibleRows() {
  const rows = [{ type: "project", id: `project:${activeProjectId}`, name: activeProjectName, assignee: activeProject.member_emails || [], start_date: toIsoDay(timelineStart), due_date: toIsoDay(timelineEnd) }];
  sortedTasks(tasks).forEach((task, taskIndex) => {
    const subtasks = sortedSubtasks(task.sub_tasks || []);
    const matchingSubtasks = subtasks.filter((subtask) => visibleStatuses.has(statusKey(subtask.status)));
    const mainMatches = visibleStatuses.has(statusKey(task.status));
    if (!mainMatches && !matchingSubtasks.length) return;
    rows.push({ type: "main", id: task.id, name: task.main_task_name, number: String(taskIndex + 1), task, status: task.status, assignee: task.assignee, start_date: task.start_date, due_date: task.due_date, contextOnly: !mainMatches });
    if (collapsedTasks.has(task.id)) return;
    matchingSubtasks.forEach((subtask, subtaskIndex) => rows.push({
      type: "subtask",
      id: `${task.id}:subtask:${subtaskIndex}`,
      parentId: task.id,
      name: subtask.sub_task_name,
      number: `${taskIndex + 1}.${subtaskIndex + 1}`,
      task: subtask,
      status: subtask.status,
      assignee: subtask.assignee,
      start_date: subtask.start_date,
      due_date: subtask.due_date
    }));
  });
  return rows;
}

function renderTimelineHeader() {
  const dates = dateRange(timelineStart, timelineEnd);
  timeline.style.setProperty("--day-width", `${dayWidth}px`);
  timeline.style.width = `${Math.max(dates.length * dayWidth, timelineScroll.clientWidth || 0)}px`;
  monthRow.replaceChildren(...monthSegments(dates).map((segment) => {
    const cell = document.createElement("span");
    cell.textContent = segment.label;
    cell.style.width = `${segment.days * dayWidth}px`;
    return cell;
  }));
  const today = todayUtc();
  daysRow.replaceChildren(...dates.map((date) => {
    const cell = document.createElement("span");
    const weekday = document.createElement("small");
    const day = document.createElement("b");
    weekday.textContent = new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" }).format(date);
    day.textContent = String(date.getUTCDate());
    cell.append(weekday, day);
    cell.classList.toggle("today-day", sameDay(date, today));
    cell.classList.toggle("weekend-day", [0, 6].includes(date.getUTCDay()));
    cell.style.width = `${dayWidth}px`;
    return cell;
  }));
}

function renderRows() {
  taskRows.replaceChildren(...visibleRows.map(taskRowElement));
  const timelineRows = visibleRows.map(timelineRowElement);
  const dependencyLayer = document.createElement("div");
  dependencyLayer.className = "dependency-layer";
  dependencyLayer.id = "dependencyLayer";
  dependencyLayer.setAttribute("aria-hidden", "true");
  const today = todayUtc();
  const children = [];
  if (today >= timelineStart && today <= timelineEnd) {
    const line = document.createElement("div");
    line.className = "today-line";
    line.style.left = `${dateDifference(timelineStart, today) * dayWidth + dayWidth / 2}px`;
    const label = document.createElement("span");
    label.textContent = "Today";
    line.append(label);
    children.push(line);
  }
  children.push(...timelineRows, dependencyLayer);
  timelineBody.replaceChildren(...children);
  bindBarTooltips();
  dependencyLinks = buildDependencies();
}

function taskRowElement(row) {
  const element = document.createElement("div");
  element.className = `task-row ${row.type === "project" ? "project-row" : row.type === "main" ? "phase-row" : "child-row"}${row.contextOnly ? " context-row" : ""}`;
  element.dataset.rowId = row.id;
  if (row.type === "project") {
    const toggle = document.createElement("button");
    const expandableIds = tasks.filter((task) => task.sub_tasks?.length).map((task) => task.id);
    const allExpanded = expandableIds.length > 0 && expandableIds.every((taskId) => !collapsedTasks.has(taskId));
    toggle.className = "row-toggle all-rows-toggle";
    toggle.type = "button";
    toggle.dataset.toggleAllTasks = "true";
    toggle.disabled = !expandableIds.length;
    toggle.setAttribute("aria-expanded", String(allExpanded));
    toggle.setAttribute("aria-label", allExpanded ? "Collapse all subtasks" : "Expand all subtasks");
    const name = document.createElement("strong");
    name.textContent = row.name;
    element.append(toggle, name, assigneeStack(row.assignee));
    return element;
  }
  if (row.type === "main") {
    const hasSubtasks = Boolean(row.task.sub_tasks?.length);
    const toggle = document.createElement("button");
    toggle.className = "row-toggle";
    toggle.type = "button";
    toggle.dataset.toggleTask = row.id;
    toggle.disabled = !hasSubtasks;
    toggle.setAttribute("aria-expanded", String(!collapsedTasks.has(row.id)));
    toggle.setAttribute("aria-label", hasSubtasks ? `${collapsedTasks.has(row.id) ? "Show" : "Hide"} subtasks for ${row.name}` : `${row.name} has no subtasks`);
    const number = document.createElement("b");
    number.textContent = row.number;
    const name = document.createElement("strong");
    name.textContent = row.name;
    element.append(toggle, number, name, statusPill(row), assigneeStack(row.assignee));
    return element;
  }
  const number = document.createElement("b");
  number.textContent = row.number;
  const name = document.createElement("span");
  name.textContent = row.name;
  element.append(number, name, statusPill(row), assigneeStack(row.assignee));
  return element;
}

function timelineRowElement(row) {
  const element = document.createElement("div");
  element.className = `timeline-row ${row.type === "project" ? "project-row" : row.type === "main" ? "phase-row" : "child-row"}${row.contextOnly ? " context-row" : ""}`;
  element.dataset.rowId = row.id;
  const dates = normalizedRowDates(row);
  if (!dates) {
    element.classList.add("unscheduled-row");
    return element;
  }
  const bar = document.createElement(row.type === "project" ? "span" : "button");
  if (bar instanceof HTMLButtonElement) bar.type = "button";
  const overdue = row.type !== "project" && isOverdue(row);
  bar.className = `gantt-bar ${row.type === "project" ? "summary blue" : `status-${statusKey(row.status)}`}${overdue && showOverdue ? " is-overdue" : ""}`;
  bar.dataset.barId = row.id;
  bar.style.setProperty("--start", dateDifference(timelineStart, dates.start));
  bar.style.setProperty("--span", Math.max(1, dateDifference(dates.start, dates.end) + 1));
  if (row.type === "project") {
    const progress = percentage(tasks.filter((task) => task.status === "Completed").length, tasks.length);
    const fill = document.createElement("i");
    fill.style.width = `${progress}%`;
    const label = document.createElement("b");
    label.textContent = `${progress}% complete`;
    bar.append(fill, label);
  } else {
    const label = document.createElement("b");
    label.textContent = statusBarLabel(row.status);
    bar.append(label);
    if (overdue && showOverdue) {
      const late = document.createElement("em");
      late.textContent = `+${overdueDays(row.due_date)}d`;
      bar.append(late);
    }
    bar.setAttribute("aria-label", `${row.name}, ${row.status}, ${formatDate(dates.start)} to ${formatDate(dates.end)}`);
  }
  element.append(bar);
  return element;
}

function statusPill(row) {
  const content = document.createDocumentFragment();
  const pill = document.createElement("span");
  pill.className = `task-status ${statusKey(row.status)}`;
  pill.title = row.status || "Not Started";
  pill.textContent = row.status || "Not Started";
  content.append(pill);
  if (isOverdue(row) && showOverdue) {
    pill.classList.add("has-overdue");
    pill.title = `${row.status} - ${overdueDays(row.due_date)} days overdue`;
    const late = document.createElement("em");
    late.className = "task-overdue-days";
    late.textContent = `+${overdueDays(row.due_date)}d`;
    late.title = `${overdueDays(row.due_date)} days overdue`;
    content.append(late);
  }
  return content;
}

function assigneeStack(assignees) {
  const stack = document.createElement("span");
  stack.className = "owner-stack";
  const emails = normalizeAssignees(assignees);
  emails.slice(0, 3).forEach((email) => {
    const member = memberByEmail(email);
    const avatar = document.createElement(member?.photoURL ? "img" : "i");
    const name = member?.name || email;
    avatar.title = name;
    if (avatar instanceof HTMLImageElement) {
      avatar.src = member.photoURL;
      avatar.alt = name;
      avatar.loading = "lazy";
      avatar.addEventListener("error", () => {
        const fallback = document.createElement("i");
        fallback.textContent = initials(name);
        fallback.title = name;
        avatar.replaceWith(fallback);
      }, { once: true });
    } else avatar.textContent = initials(name);
    stack.append(avatar);
  });
  if (emails.length > 3) {
    const more = document.createElement("i");
    more.textContent = `+${emails.length - 3}`;
    more.title = emails.slice(3).map((email) => memberByEmail(email)?.name || email).join(", ");
    stack.append(more);
  }
  if (!emails.length) {
    const none = document.createElement("i");
    none.className = "unassigned";
    none.textContent = "-";
    none.title = "Unassigned";
    stack.append(none);
  }
  return stack;
}

function buildDependencies() {
  const visibleMainIds = new Set(visibleRows.filter((row) => row.type === "main" && normalizedRowDates(row)).map((row) => row.id));
  const byTaskId = new Map(tasks.map((task) => [task.id, task]));
  const links = [];
  tasks.forEach((task) => {
    if (!visibleMainIds.has(task.id)) return;
    (task.dependency_tasks || []).forEach((dependency) => {
      if (!visibleMainIds.has(dependency.dependency_task_id)) return;
      const from = byTaskId.get(dependency.dependency_task_id);
      if (!from) return;
      links.push({ fromId: from.id, toId: task.id, text: `${from.main_task_name} -> ${task.main_task_name}` });
    });
  });
  return links;
}

function renderDependencies() {
  const layer = byId("dependencyLayer");
  if (!layer || !dependencyLinks.length) return;
  layer.replaceChildren();
  const bodyRect = timelineBody.getBoundingClientRect();
  const bars = new Map([...timelineBody.querySelectorAll(".gantt-bar[data-bar-id]")].map((bar) => [bar.dataset.barId, bar]));
  dependencyLinks.forEach((link) => {
    const from = bars.get(link.fromId);
    const to = bars.get(link.toId);
    if (!from || !to) return;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const startX = fromRect.right - bodyRect.left;
    const startY = fromRect.top + fromRect.height / 2 - bodyRect.top;
    const endX = toRect.left - bodyRect.left;
    const endY = toRect.top + toRect.height / 2 - bodyRect.top;
    const routeX = endX - startX >= 28 ? startX + (endX - startX) / 2 : Math.max(startX, endX) + 14;
    const edge = document.createElement("span");
    edge.className = "dependency-edge";
    edge.append(
      dependencySegment("horizontal", startX, startY - 1, Math.max(8, Math.abs(routeX - startX)), 2, link.text),
      dependencySegment("vertical", routeX - 1, Math.min(startY, endY), 2, Math.max(2, Math.abs(endY - startY)), link.text),
      dependencySegment("horizontal", Math.min(routeX, endX), endY - 1, Math.max(8, Math.abs(endX - routeX)), 2, link.text)
    );
    const arrow = document.createElement("i");
    arrow.className = "dependency-arrow";
    arrow.style.left = `${endX}px`;
    arrow.style.top = `${endY}px`;
    edge.append(arrow);
    layer.append(edge);
  });
}

function dependencySegment(className, left, top, width, height, title) {
  const segment = document.createElement("i");
  segment.className = `dependency-segment ${className}`;
  Object.assign(segment.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  segment.title = title;
  segment.addEventListener("pointerenter", (event) => showDependencyTooltip(event, title));
  segment.addEventListener("pointermove", positionTooltip);
  segment.addEventListener("pointerleave", hideTooltip);
  return segment;
}

function bindBarTooltips() {
  timelineBody.querySelectorAll("button.gantt-bar[data-bar-id]").forEach((bar) => {
    const row = visibleRows.find((item) => item.id === bar.dataset.barId);
    if (!row) return;
    bar.addEventListener("pointerenter", (event) => showTaskTooltip(event, row));
    bar.addEventListener("pointermove", positionTooltip);
    bar.addEventListener("pointerleave", hideTooltip);
    bar.addEventListener("focus", () => showTaskTooltipForElement(bar, row));
    bar.addEventListener("blur", hideTooltip);
    bar.addEventListener("click", () => showTaskTooltipForElement(bar, row));
  });
}

function showTaskTooltip(event, row) {
  renderTaskTooltip(row);
  taskTooltip.hidden = false;
  positionTooltip(event);
}

function showTaskTooltipForElement(element, row) {
  renderTaskTooltip(row);
  taskTooltip.hidden = false;
  const rect = element.getBoundingClientRect();
  positionTooltip({ clientX: rect.left + rect.width / 2, clientY: rect.bottom });
}

function renderTaskTooltip(row) {
  const dates = normalizedRowDates(row);
  const title = document.createElement("strong");
  title.textContent = row.name;
  const status = document.createElement("span");
  status.className = "tooltip-status";
  status.textContent = row.status || "Not Started";
  const details = document.createElement("dl");
  appendDetail(details, "Assignee", assigneeNames(row.assignee));
  appendDetail(details, "Timeline", dates ? `${formatDate(dates.start)} - ${formatDate(dates.end)}` : "Unscheduled");
  appendDetail(details, "Priority", row.task?.priority || "Not set");
  appendDetail(details, "Schedule", scheduleVariance(row));
  taskTooltip.replaceChildren(title, status, details);
  if (row.type === "main" && row.task?.dependency_tasks?.length) {
    const dependency = document.createElement("div");
    dependency.className = "tooltip-dependency";
    dependency.textContent = `Depends on: ${row.task.dependency_tasks.map((item) => item.dependency_task_name || item.dependency_task_id).join(", ")}`;
    taskTooltip.append(dependency);
  }
}

function showDependencyTooltip(event, text) {
  const title = document.createElement("strong");
  title.textContent = "Task dependency";
  const status = document.createElement("span");
  status.className = "tooltip-status";
  status.textContent = "Finish-to-start";
  const detail = document.createElement("div");
  detail.className = "tooltip-dependency";
  detail.textContent = text;
  taskTooltip.replaceChildren(title, status, detail);
  taskTooltip.hidden = false;
  positionTooltip(event);
}

function appendDetail(list, label, value) {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  list.append(term, detail);
}

function positionTooltip(event) {
  const margin = 12;
  const rect = taskTooltip.getBoundingClientRect();
  const left = Math.min(event.clientX + margin, window.innerWidth - rect.width - margin);
  const below = event.clientY + margin;
  const top = below + rect.height > window.innerHeight ? event.clientY - rect.height - margin : below;
  taskTooltip.style.left = `${Math.max(margin, left)}px`;
  taskTooltip.style.top = `${Math.max(margin, top)}px`;
}

function hideTooltip() { taskTooltip.hidden = true; }

function setZoom(nextWidth) {
  dayWidth = Math.max(25, Math.min(67, nextWidth));
  if (timelineStart && timelineEnd) {
    renderTimelineHeader();
    renderRows();
    requestAnimationFrame(renderDependencies);
  }
  showToast(`Timeline zoom: ${dayWidth}px per day`);
}

function scrollTodayIntoView() {
  const today = todayUtc();
  if (today < timelineStart || today > timelineEnd || timelineScroll.dataset.initialScroll === activeProjectId) return;
  timelineScroll.dataset.initialScroll = activeProjectId;
  const todayLeft = dateDifference(timelineStart, today) * dayWidth;
  timelineScroll.scrollLeft = Math.max(0, todayLeft - timelineScroll.clientWidth * 0.35);
}

function scheduleBounds(taskList) {
  const items = taskList.flatMap((task) => [task, ...(task.sub_tasks || [])]);
  const dates = items.flatMap((item) => [parseIsoDay(item.start_date), parseIsoDay(item.due_date)]).filter(Boolean);
  if (!dates.length) return null;
  return { start: new Date(Math.min(...dates.map(Number))), end: new Date(Math.max(...dates.map(Number))) };
}

function normalizedRowDates(row) {
  const start = parseIsoDay(row.start_date) || parseIsoDay(row.due_date);
  const due = parseIsoDay(row.due_date) || start;
  if (!start || !due) return null;
  return { start, end: due < start ? start : due };
}

function dateRange(start, end) {
  const dates = [];
  for (let time = start.getTime(); time <= end.getTime(); time += dayMilliseconds) dates.push(new Date(time));
  return dates;
}

function monthSegments(dates) {
  const segments = [];
  dates.forEach((date) => {
    const label = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
    if (segments.at(-1)?.label === label) segments.at(-1).days += 1;
    else segments.push({ label, days: 1 });
  });
  return segments;
}

function countWorkingDays(start, end) {
  return dateRange(start, end).filter((date) => ![0, 6].includes(date.getUTCDay())).length;
}

function parseIsoDay(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function dateDifference(start, end) { return Math.round((end - start) / dayMilliseconds); }
function sameDay(left, right) { return left.getTime() === right.getTime(); }
function toIsoDay(date) { return date.toISOString().slice(0, 10); }
function formatDate(value) {
  const date = value instanceof Date ? value : parseIsoDay(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) : "Unscheduled";
}
function isOverdue(item) { const due = parseIsoDay(item.due_date); return Boolean(due && item.status !== "Completed" && due < todayUtc()); }
function overdueDays(value) { const due = parseIsoDay(value); return due ? Math.max(0, dateDifference(due, todayUtc())) : 0; }
function scheduleVariance(row) {
  if (isOverdue(row)) return `${overdueDays(row.due_date)} days overdue`;
  if (row.status === "Completed" && row.task?.completed_at && row.due_date) {
    const due = parseIsoDay(row.due_date);
    const completed = new Date(row.task.completed_at);
    if (due && !Number.isNaN(completed.getTime())) {
      const completedDay = new Date(Date.UTC(completed.getUTCFullYear(), completed.getUTCMonth(), completed.getUTCDate()));
      const variance = dateDifference(due, completedDay);
      if (variance > 0) return `${variance} days late`;
      if (variance < 0) return `${Math.abs(variance)} days early`;
    }
  }
  return "On schedule";
}

function statusKey(status) {
  return { Completed: "completed", "In Progress": "progress", "Partially Completed": "partial", Blocked: "blocked", "Not Started": "not-started" }[status] || "not-started";
}
function statusBarLabel(status) { return status === "Completed" ? "Completed" : status === "Partially Completed" ? "Partial" : status === "In Progress" ? "In progress" : status || "Not started"; }
function percentage(value, total) { return total ? Math.round((value / total) * 100) : 0; }
function sortedTasks(list) { return [...list].sort((a, b) => sortDate(a.start_date) - sortDate(b.start_date) || sortDate(a.due_date) - sortDate(b.due_date) || a.main_task_name.localeCompare(b.main_task_name)); }
function sortedSubtasks(list) { return [...list].sort((a, b) => sortDate(a.start_date) - sortDate(b.start_date) || sortDate(a.due_date) - sortDate(b.due_date) || a.sub_task_name.localeCompare(b.sub_task_name)); }
function sortDate(value) { return parseIsoDay(value)?.getTime() ?? Number.POSITIVE_INFINITY; }

function normalizeTasks(list) {
  return (Array.isArray(list) ? list : []).map((task) => ({
    ...task,
    id: String(task.id || ""),
    main_task_name: String(task.main_task_name || "Untitled Task"),
    status: task.status || "Not Started",
    assignee: normalizeAssignees(task.assignee),
    sub_tasks: (Array.isArray(task.sub_tasks) ? task.sub_tasks : []).map((subtask) => ({ ...subtask, status: subtask.status || "Not Started", assignee: normalizeAssignees(subtask.assignee) })),
    dependency_tasks: Array.isArray(task.dependency_tasks) ? task.dependency_tasks : []
  }));
}

function normalizeMembers(list) {
  return (Array.isArray(list) ? list : []).map((member) => ({
    ...member,
    email: String(member.email || "").trim().toLowerCase(),
    name: member.name || member.displayName || member.email || "Member",
    photoURL: String(member.photoURL || member.photoUrl || member.profile_url || member.photo_url || member.avatarUrl || "").trim()
  })).filter((member) => member.email);
}

function normalizeAssignees(value) {
  if (Array.isArray(value)) return [...new Set(value.flatMap(normalizeAssignees))];
  return String(value || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}
function memberByEmail(email) { return members.find((member) => member.email === String(email || "").toLowerCase()); }
function assigneeNames(value) { const emails = normalizeAssignees(value); return emails.length ? emails.map((email) => memberByEmail(email)?.name || email).join(", ") : "Unassigned"; }
function initials(value) { return String(value || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

async function fetchJson(url) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store" });
  const text = await response.text();
  let result = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = { error: text }; }
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
