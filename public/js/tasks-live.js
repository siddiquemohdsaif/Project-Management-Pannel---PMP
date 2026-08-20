import { getStoredUser, watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";
import { dataCacheKeys, readDataCache, writeDataCache } from "./data-cache.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const searchInput = byId("searchInput");
const statusFilter = byId("statusFilter");
const assigneeFilter = byId("assigneeFilter");
const tasksBody = byId("tasksBody");
const emptyState = byId("emptyState");
const footerCount = byId("footerCount");
const statusMenu = byId("statusMenu");
const toggleAllSubtasks = byId("toggleAllSubtasks");
const projectSelector = byId("projectSelector");
const projectDropdown = byId("projectDropdown");
const selectedProject = byId("selectedProject");
const activeProjectMark = byId("activeProjectMark");
const activeProjectIcon = byId("activeProjectIcon");
const activeProjectIconFallback = byId("activeProjectIconFallback");
const completeSubtasksDialog = byId("completeSubtasksDialog");
const completeSubtasksMessage = byId("completeSubtasksMessage");
const incompleteSubtasksList = byId("incompleteSubtasksList");
const newTaskDialog = byId("newTaskDialog");
const newTaskForm = byId("newTaskForm");
const subtaskBuilderList = byId("subtaskBuilderList");
const mainAssigneeOptions = byId("mainAssigneeOptions");
const mainAssigneeSummary = byId("mainAssigneeSummary");
const mainPrioritySummary = byId("mainPrioritySummary");
const dependencyOptions = byId("dependencyOptions");
const dependencySummary = byId("dependencySummary");
const editTaskDialog = byId("editTaskDialog");
const editTaskForm = byId("editTaskForm");
const editAssigneeOptions = byId("editAssigneeOptions");
const editAssigneeSummary = byId("editAssigneeSummary");
const editPriorityOptions = byId("editPriorityOptions");
const editPrioritySummary = byId("editPrioritySummary");
const editDependencyOptions = byId("editDependencyOptions");
const editDependencySummary = byId("editDependencySummary");
const editDependencySection = byId("editDependencySection");
const editSubtaskSection = byId("editSubtaskSection");
const editDescriptionField = byId("editDescriptionField");
const editSubtaskEditorList = byId("editSubtaskEditorList");
const editTaskModeBadge = byId("editTaskModeBadge");
const editDetailsTitle = byId("editDetailsTitle");
const deleteMainTaskBtn = byId("deleteMainTaskBtn");
const confirmDeleteDialog = byId("confirmDeleteDialog");
const confirmDeleteTitle = byId("confirmDeleteTitle");
const confirmDeleteMessage = byId("confirmDeleteMessage");
const bulkTaskDialog = byId("bulkTaskDialog");
const bulkTaskForm = byId("bulkTaskForm");
const bulkTaskFile = byId("bulkTaskFile");
const bulkFileName = byId("bulkFileName");
const bulkUploadResult = byId("bulkUploadResult");
const bulkSummary = byId("bulkSummary");
const bulkErrors = byId("bulkErrors");
const bulkTaskSubmit = byId("bulkTaskSubmit");

const statuses = ["Not Started", "In Progress", "Partially Completed", "Completed", "Blocked"];
const priorities = ["Low", "Medium", "High"];
const priorityMeta = { Low: "./assets/photos/low.png", Medium: "./assets/photos/med.png", High: "./assets/photos/high.png" };
const params = new URLSearchParams(window.location.search);
let activeProjectId = params.get("projectId") || localStorage.getItem("activeProjectId") || "";
let activeProjectName = params.get("project") || localStorage.getItem("activeProject") || "";
let projects = [];
let members = [];
let tasks = [];
let activeStatusButton = null;
let pendingCompletion = null;
let pendingDeleteAction = null;
let editState = null;
let toastTimer = null;
let subtaskCounter = 0;
let editSubtaskCounter = 0;
let parsedBulkTasks = [];
const expandedParents = new Set();

watchFirebaseUserProfile();
selectedProject.textContent = activeProjectName || "Select Project";
loadPage();

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
projectSelector.addEventListener("click", (event) => {
  event.stopPropagation();
  projectDropdown.hidden = !projectDropdown.hidden;
  projectSelector.setAttribute("aria-expanded", String(!projectDropdown.hidden));
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeStatusMenu();
  closeDropdowns();
  setSidebar(false);
});

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    const routes = { Dashboard: "/dashboard", Projects: "/projects", "Gantt Chart": "/gantt", Members: "/members", Activity: "/activity", Settings: "/settings" };
    if (routes[button.dataset.screen]) window.location.href = routes[button.dataset.screen];
  });
});

[searchInput, statusFilter, assigneeFilter].forEach((control) => {
  control.addEventListener(control === searchInput ? "input" : "change", applyFilters);
});

byId("clearFilters").addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "all";
  assigneeFilter.value = "all";
  expandedParents.clear();
  renderTasks();
});

toggleAllSubtasks.addEventListener("click", () => {
  const shouldExpand = tasks.some((task) => task.sub_tasks?.length && !expandedParents.has(task.id));
  expandedParents.clear();
  if (shouldExpand) tasks.forEach((task) => task.sub_tasks?.length && expandedParents.add(task.id));
  renderTasks();
});

tasksBody.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-task]");
  if (editButton) return openEditTask(editButton.closest("tr"));
  const statusButton = event.target.closest("[data-status-button]");
  if (statusButton) return openStatusMenu(statusButton);
  const toggle = event.target.closest("[data-toggle-subtasks]");
  if (toggle) return toggleSubtasks(toggle.dataset.toggleSubtasks);
  const row = event.target.closest("tr");
  if (row?.dataset.taskId && !event.target.closest("button")) toggleSubtasks(row.dataset.taskId);
});

byId("newTaskBtn").addEventListener("click", () => {
  if (!activeProjectId) return showToast("Open a project before creating tasks.");
  prepareCreateForm();
  openDialog(newTaskDialog);
});
byId("bulkTaskBtn").addEventListener("click", openBulkTaskDialog);
byId("bulkTaskCancel").addEventListener("click", closeBulkTaskDialog);
byId("bulkTaskClose").addEventListener("click", closeBulkTaskDialog);
bulkTaskDialog.addEventListener("click", (event) => { if (event.target === bulkTaskDialog) closeBulkTaskDialog(); });
bulkTaskFile.addEventListener("change", readBulkTaskFile);
bulkTaskForm.addEventListener("submit", uploadBulkTasks);
byId("dialogCancel").addEventListener("click", closeCreateDialog);
byId("dialogClose").addEventListener("click", closeCreateDialog);
newTaskDialog.addEventListener("click", (event) => { if (event.target === newTaskDialog) closeCreateDialog(); });
newTaskForm.addEventListener("submit", createTask);
newTaskForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-multi-input]")) updateCreateSummaries();
  if (event.target.matches("[data-priority-input]")) {
    updatePrioritySummary(mainPrioritySummary, "priority", newTaskForm);
    event.target.closest(".priority-select")?.removeAttribute("open");
  }
});
byId("addSubtaskBtn").addEventListener("click", () => addSubtaskCard(subtaskBuilderList, `subtask-${++subtaskCounter}`));

byId("editDialogCancel").addEventListener("click", closeEditDialog);
byId("editDialogClose").addEventListener("click", closeEditDialog);
editTaskDialog.addEventListener("click", (event) => { if (event.target === editTaskDialog) closeEditDialog(); });
editTaskForm.addEventListener("submit", saveEditedTask);
editTaskForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-multi-input], [data-priority-input]")) updateEditSummaries();
  if (event.target.matches("[data-priority-input]")) event.target.closest(".priority-select")?.removeAttribute("open");
});
byId("editAddSubtaskBtn").addEventListener("click", () => addSubtaskCard(editSubtaskEditorList, `edit-subtask-${++editSubtaskCounter}`, {}));
deleteMainTaskBtn.addEventListener("click", () => {
  if (!editState) return;
  requestDelete(editState.mode === "main" ? "Delete Task?" : "Delete Subtask?", "This action cannot be undone.", deleteCurrentEditTarget);
});

subtaskBuilderList.addEventListener("click", removeDraftCard);
editSubtaskEditorList.addEventListener("click", removeDraftCard);
byId("completeSubtasksCancel").addEventListener("click", () => { pendingCompletion = null; completeSubtasksDialog.close(); });
byId("completeSubtasksConfirm").addEventListener("click", completeMainAndSubtasks);
byId("confirmDeleteCancel").addEventListener("click", () => { pendingDeleteAction = null; confirmDeleteDialog.close(); });
byId("confirmDeleteButton").addEventListener("click", () => {
  const action = pendingDeleteAction;
  pendingDeleteAction = null;
  confirmDeleteDialog.close();
  if (action) action();
});

document.addEventListener("click", (event) => {
  if (activeStatusButton && !event.target.closest("#statusMenu") && !event.target.closest("[data-status-button]")) closeStatusMenu();
  if (!event.target.closest(".project-menu-wrap")) closeProjectDropdown();
  document.querySelectorAll(".task-multi-select[open]").forEach((dropdown) => {
    if (!event.target.closest(".task-multi-select") || !dropdown.contains(event.target)) dropdown.removeAttribute("open");
  });
});
window.addEventListener("resize", closeStatusMenu);

async function loadPage() {
  const hasCachedPage = hydrateCachedPage();
  if (!hasCachedPage) {
    tasksBody.innerHTML = "";
    footerCount.textContent = "Loading tasks";
  }

  try {
    const projectsResponse = await freshFetch("/api/projects?progress=false");
    const projectsResult = await readJson(projectsResponse);
    if (!projectsResponse.ok) throw new Error(projectsResult.error || "Projects could not be loaded.");
    projects = projectsResult.projects || [];
    writeDataCache(dataCacheKeys.projects, projects);
    renderProjectDropdown();
    const project = projects.find((item) => item.id === activeProjectId) || projects.find((item) => item.project_name === activeProjectName) || projects[0];
    if (!project) return renderTasks();
    activeProjectId = project.id;
    activeProjectName = project.project_name;
    selectedProject.textContent = activeProjectName;
    renderActiveProjectIcon(project);
    localStorage.setItem("activeProjectId", activeProjectId);
    localStorage.setItem("activeProject", activeProjectName);
    const projectMemberEmails = projectMemberEmailList(project);
    const [projectMembersResult, tasksResponse] = await Promise.all([
      projectMemberEmails.length ? loadMembersForEmails(projectMemberEmails) : loadAllMembers(),
      freshFetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`)
    ]);
    const tasksResult = await readJson(tasksResponse);
    if (!tasksResponse.ok) throw new Error(tasksResult.error || "Tasks could not be loaded.");
    members = membersForProject(projectMembersResult, project);
    writeDataCache(dataCacheKeys.members, mergeMembers(readDataCache(dataCacheKeys.members, []), projectMembersResult));
    renderAssigneeFilter();
    tasks = sortTasks(tasksResult.tasks || []);
    writeDataCache(dataCacheKeys.tasks(activeProjectId), tasks);
  } catch (error) {
    if (!hasCachedPage) {
      members = fallbackMembers();
      tasks = [];
    }
    showToast(error.message || "Tasks could not be loaded.");
  }
  renderTasks();
}

function hydrateCachedPage() {
  const cachedProjects = readDataCache(dataCacheKeys.projects);
  if (!Array.isArray(cachedProjects)) return false;

  projects = cachedProjects;
  renderProjectDropdown();
  const project = projects.find((item) => item.id === activeProjectId)
    || projects.find((item) => item.project_name === activeProjectName)
    || projects[0];
  if (!project) {
    renderTasks();
    return true;
  }

  activeProjectId = project.id;
  activeProjectName = project.project_name;
  selectedProject.textContent = activeProjectName;
  renderActiveProjectIcon(project);
  const cachedMembers = readDataCache(dataCacheKeys.members, []);
  members = membersForProject(cachedMembers, project);
  renderAssigneeFilter();
  const cachedTasks = readDataCache(dataCacheKeys.tasks(activeProjectId));
  if (Array.isArray(cachedTasks)) {
    tasks = sortTasks(cachedTasks);
    renderTasks();
  } else {
    tasksBody.innerHTML = "";
    footerCount.textContent = "Loading tasks";
  }
  return true;
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

function cacheCurrentTasks() {
  if (!activeProjectId) return;
  writeDataCache(dataCacheKeys.tasks(activeProjectId), tasks);

  const cachedProjects = readDataCache(dataCacheKeys.projects, []);
  if (!Array.isArray(cachedProjects)) return;
  const completedCount = tasks.filter((task) => task.status === "Completed").length;
  const progressPercent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  writeDataCache(dataCacheKeys.projects, cachedProjects.map((project) => project.id === activeProjectId ? {
    ...project,
    task_count: tasks.length,
    progress_percent: progressPercent
  } : project));
}

function renderProjectDropdown() {
  projectDropdown.innerHTML = `<span class="dropdown-label">Switch project</span>${projects.map((project) => `<button type="button" data-project-id="${escapeAttr(project.id)}" data-project="${escapeAttr(project.project_name)}"><strong>${escapeHtml(project.project_name)}</strong><small>${escapeHtml(project.platform || "Project")}</small></button>`).join("")}`;
  projectDropdown.querySelectorAll("[data-project-id]").forEach((button) => button.addEventListener("click", () => {
    localStorage.setItem("activeProjectId", button.dataset.projectId);
    localStorage.setItem("activeProject", button.dataset.project);
    window.location.href = `/tasks?project=${encodeURIComponent(button.dataset.project)}&projectId=${encodeURIComponent(button.dataset.projectId)}`;
  }));
}

function renderAssigneeFilter() {
  assigneeFilter.innerHTML = `<option value="all">All Assignees</option>${members.map((member) => `<option value="${escapeAttr(member.email)}">${escapeHtml(member.name || member.email)}</option>`).join("")}`;
}

function membersForProject(allMembers, project) {
  const selected = projectMemberEmailList(project).map((value) => normalizeMemberKey(value)).filter(Boolean);
  if (!selected.length) return normalizeMembers(allMembers);
  const selectedSet = new Set(selected);
  const matchedMembers = normalizeMembers(allMembers).filter((member) => {
    const keys = [
      member.email,
      member.id,
      member.uid,
      member.name,
      member.displayName
    ].map((value) => normalizeMemberKey(value)).filter(Boolean);
    return keys.some((key) => selectedSet.has(key));
  });
  const matchedKeys = new Set(matchedMembers.flatMap((member) => [member.email, member.id, member.uid, member.name, member.displayName].map(normalizeMemberKey).filter(Boolean)));
  selected.forEach((key) => {
    if (!matchedKeys.has(key) && key.includes("@")) {
      matchedMembers.push({ email: key, name: key, photoURL: "" });
    }
  });
  return matchedMembers;
}

function projectMemberEmailList(project) {
  return [
    ...(Array.isArray(project.member_emails) ? project.member_emails : []),
    ...(Array.isArray(project.members) ? project.members : [])
  ].map((value) => normalizeMemberKey(value)).filter(Boolean);
}

async function loadMembersForEmails(emails, baseMembers = []) {
  try {
    const response = await freshFetch(`/api/members?emails=${encodeURIComponent(emails.join(","))}`);
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Members could not be loaded.");
    return mergeMembers(baseMembers, result.members || []);
  } catch {
    return baseMembers;
  }
}

async function loadAllMembers() {
  const response = await freshFetch("/api/members");
  const result = await readJson(response);
  if (!response.ok) throw new Error(result.error || "Members could not be loaded.");
  return result.members || [];
}

function renderTasks() {
  tasksBody.replaceChildren(...sortTasks(tasks).flatMap((task, index) => rowsForTask(task, index)));
  syncAllToggleState();
  applyFilters();
}

function rowsForTask(task, index) {
  const rows = [mainTaskRow(task, index)];
  if (expandedParents.has(task.id)) rows.push(...sortSubtasks(task.sub_tasks || []).map((subtask, subIndex) => subtaskRow(task, subtask, index, subIndex)));
  return rows;
}

function mainTaskRow(task, index) {
  const row = document.createElement("tr");
  row._task = task;
  row.className = task.sub_tasks?.length ? "phase-row" : "";
  row.dataset.taskId = task.id;
  row.dataset.name = task.main_task_name;
  row.dataset.status = task.status;
  row.dataset.assignee = normalizeAssignees(task.assignee).join(",");
  row.innerHTML = `${taskArrowCell(task)}<td class="task-index">${index + 1}</td>${taskCells(task.main_task_name, task.status, task.assignee, task.due_date, task.priority)}${editCell(task.main_task_name)}`;
  return row;
}

function subtaskRow(task, subtask, index, subIndex) {
  const row = document.createElement("tr");
  row._task = task;
  row._subtask = subtask;
  row.className = "subtask-row";
  row.dataset.parent = task.id;
  row.dataset.name = subtask.sub_task_name;
  row.dataset.status = subtask.status;
  row.dataset.assignee = normalizeAssignees(subtask.assignee).join(",");
  row.dataset.subtaskIndex = String(subIndex);
  row.innerHTML = `<td></td><td class="task-index">${index + 1}.${subIndex + 1}</td>${taskCells(subtask.sub_task_name, subtask.status, subtask.assignee, subtask.due_date, subtask.priority, true)}${editCell(subtask.sub_task_name)}`;
  return row;
}

function taskCells(name, status, assignee, dueDate, priority, isSubtask = false) {
  return `<td class="task-title ${isSubtask ? "subtask-name" : ""}">${escapeHtml(name)}</td><td><button class="status-pill ${statusClass(status)} status-button" type="button" data-status-button>${escapeHtml(status)}</button></td><td>${assigneeCell(assignee)}</td><td class="muted">${escapeHtml(formatDate(dueDate))}</td><td><span class="priority ${priority.toLowerCase()}">${escapeHtml(priority)}</span></td>`;
}

function taskArrowCell(task) {
  if (!task.sub_tasks?.length) return "<td></td>";
  return `<td><button class="subtask-toggle" type="button" data-toggle-subtasks="${escapeAttr(task.id)}" aria-expanded="${expandedParents.has(task.id)}" aria-label="Show ${escapeAttr(task.main_task_name)} subtasks"></button></td>`;
}

function editCell(name) {
  return `<td><button class="edit-task-button" type="button" data-edit-task aria-label="Edit ${escapeAttr(name)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button></td>`;
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const assignee = assigneeFilter.value;
  let visible = 0;
  tasksBody.querySelectorAll("tr").forEach((row) => {
    const show = (!query || row.dataset.name.toLowerCase().includes(query))
      && (status === "all" || row.dataset.status === status)
      && (assignee === "all" || splitAssignees(row.dataset.assignee).includes(assignee));
    row.hidden = !show;
    if (show) visible++;
  });
  emptyState.hidden = visible !== 0;
  footerCount.textContent = tasks.length ? `Showing ${visible} of ${tasks.length} main tasks` : "No tasks found";
}

function openStatusMenu(button) {
  activeStatusButton = button;
  statusMenu.replaceChildren(...statuses.map((status) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = statusClass(status);
    option.textContent = status;
    option.setAttribute("role", "menuitem");
    option.addEventListener("click", () => updateStatus(button, status));
    return option;
  }));
  const rect = button.getBoundingClientRect();
  statusMenu.hidden = false;
  const menuWidth = statusMenu.offsetWidth || 170;
  statusMenu.style.top = `${rect.bottom + 7}px`;
  statusMenu.style.left = `${Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left + rect.width / 2 - menuWidth / 2))}px`;
}

function closeStatusMenu() {
  statusMenu.hidden = true;
  activeStatusButton = null;
}

async function updateStatus(button, status) {
  const row = button.closest("tr");
  const task = tasks.find((item) => item.id === (row.dataset.parent || row.dataset.taskId));
  if (!task) return;
  if (!row.dataset.parent && status === "Completed") {
    const incomplete = (task.sub_tasks || []).filter((subtask) => subtask.status !== "Completed");
    if (incomplete.length) return askToCompleteSubtasks(task, incomplete);
  }
  if (row.dataset.parent) {
    const subtasks = task.sub_tasks || [];
    const subtask = row._subtask || subtasks[Number(row.dataset.subtaskIndex)] || subtasks.find((item) => item.sub_task_name === row.dataset.name);
    if (subtask) subtask.status = status;
    if (task.status === "Completed" && status !== "Completed") task.status = status;
  } else {
    task.status = status;
    if (status === "Completed") (task.sub_tasks || []).forEach((subtask) => { subtask.status = "Completed"; });
  }
  closeStatusMenu();
  cacheCurrentTasks();
  renderTasks();
  await saveTask(task, `${row.dataset.name}: ${row.dataset.status} -> ${status}`);
}

function askToCompleteSubtasks(task, subtasks) {
  pendingCompletion = task;
  closeStatusMenu();
  completeSubtasksMessage.textContent = `${subtasks.length} subtasks are still not complete. To complete "${task.main_task_name}", mark all remaining subtasks as Completed too.`;
  incompleteSubtasksList.replaceChildren(...subtasks.map((subtask) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${escapeHtml(subtask.sub_task_name)}</strong><span>${escapeHtml(subtask.status)}</span>`;
    return item;
  }));
  openDialog(completeSubtasksDialog);
}

async function completeMainAndSubtasks() {
  if (!pendingCompletion) return;
  pendingCompletion.status = "Completed";
  pendingCompletion.sub_tasks.forEach((subtask) => { subtask.status = "Completed"; });
  completeSubtasksDialog.close();
  await saveTask(pendingCompletion, "Main task and remaining subtasks marked Completed.");
  pendingCompletion = null;
}

async function createTask(event) {
  event.preventDefault();
  const payload = payloadFromCreateForm();
  if (!payload) return;
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, postOptions(payload));
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Task could not be created.");
    tasks.push(result.task);
    cacheCurrentTasks();
    closeCreateDialog();
    renderTasks();
    showToast(`Task "${result.task.main_task_name}" created.`);
  } catch (error) {
    showToast(error.message || "Task could not be created.");
  }
}

function openBulkTaskDialog() {
  if (!activeProjectId) return showToast("Open a project before uploading tasks.");
  resetBulkTaskForm();
  openDialog(bulkTaskDialog);
}

function closeBulkTaskDialog() {
  if (bulkTaskDialog.open) bulkTaskDialog.close();
  resetBulkTaskForm();
}

function resetBulkTaskForm() {
  bulkTaskForm.reset();
  parsedBulkTasks = [];
  bulkFileName.textContent = "Choose CSV file";
  bulkUploadResult.hidden = true;
  bulkSummary.textContent = "";
  bulkErrors.replaceChildren();
  bulkTaskSubmit.disabled = true;
  bulkTaskSubmit.textContent = "Upload Tasks";
}

async function readBulkTaskFile() {
  const file = bulkTaskFile.files?.[0];
  parsedBulkTasks = [];
  bulkTaskSubmit.disabled = true;
  bulkErrors.replaceChildren();
  if (!file) return resetBulkTaskForm();
  bulkFileName.textContent = file.name;
  bulkUploadResult.hidden = false;

  try {
    if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a .csv file.");
    if (file.size > 1024 * 1024) throw new Error("CSV file must be 1 MB or smaller.");
    const parsed = tasksFromCsv(await file.text());
    parsedBulkTasks = parsed.tasks;
    bulkSummary.textContent = `${parsed.tasks.length} main tasks and ${parsed.subtaskCount} subtasks ready${parsed.adjustedDateCount ? ` · ${parsed.adjustedDateCount} end dates adjusted` : ""}${parsed.ignoredDependencyCount ? ` · ${parsed.ignoredDependencyCount} unknown dependencies will be ignored` : ""}.`;
    bulkTaskSubmit.disabled = false;
  } catch (error) {
    const messages = Array.isArray(error.messages) ? error.messages : [error.message || "CSV could not be read."];
    bulkSummary.textContent = "This file needs attention before upload.";
    bulkErrors.replaceChildren(...messages.slice(0, 12).map((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      return item;
    }));
  }
}

async function uploadBulkTasks(event) {
  event.preventDefault();
  if (!parsedBulkTasks.length || bulkTaskSubmit.disabled) return;
  bulkTaskSubmit.disabled = true;
  bulkTaskSubmit.textContent = "Uploading...";
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/bulk`, postOptions({
      tasks: parsedBulkTasks,
      created_by: getStoredUser()?.email || ""
    }));
    const result = response.status === 405
      ? await uploadBulkTasksIndividually(parsedBulkTasks)
      : await readJson(response);
    if (response.status !== 405 && !response.ok) throw new Error(result.error || "Tasks could not be uploaded.");
    tasks = sortTasks([...tasks, ...(result.tasks || [])]);
    cacheCurrentTasks();
    renderTasks();
    closeBulkTaskDialog();
    const ignoredCount = Array.isArray(result.ignored_dependencies) ? result.ignored_dependencies.length : 0;
    showToast(`${result.tasks?.length || 0} tasks uploaded${ignoredCount ? `; ${ignoredCount} dependencies ignored` : ""}.`);
  } catch (error) {
    bulkTaskSubmit.disabled = false;
    bulkTaskSubmit.textContent = "Upload Tasks";
    showToast(error.message || "Tasks could not be uploaded.");
  }
}

async function uploadBulkTasksIndividually(taskPayloads) {
  const createdTasks = [];
  for (const taskPayload of taskPayloads) {
    const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks`, postOptions({
      ...taskPayload,
      dependency_tasks: [],
      created_by: getStoredUser()?.email || ""
    }));
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || `Could not upload "${taskPayload.main_task_name}".`);
    createdTasks.push(result.task);
  }

  const references = new Map();
  [...tasks, ...createdTasks].forEach((task) => {
    const key = taskNameKey(task.main_task_name);
    if (key && !references.has(key)) references.set(key, task);
  });
  const ignoredDependencies = [];

  for (let index = 0; index < createdTasks.length; index += 1) {
    const source = taskPayloads[index];
    const created = createdTasks[index];
    const dependencies = [];
    const seenIds = new Set();
    (source.dependency_task_names || []).forEach((name) => {
      const reference = references.get(taskNameKey(name));
      if (!reference || reference.id === created.id) {
        ignoredDependencies.push(name);
        return;
      }
      if (seenIds.has(reference.id)) return;
      seenIds.add(reference.id);
      dependencies.push({ dependency_task_id: reference.id, dependency_task_name: reference.main_task_name });
    });
    if (!dependencies.length) continue;

    const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(created.id)}`, patchOptions({
      ...created,
      dependency_tasks: dependencies
    }));
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || `Could not set dependencies for "${created.main_task_name}".`);
    createdTasks[index] = result.task;
  }

  return { tasks: createdTasks, ignored_dependencies: [...new Set(ignoredDependencies)] };
}

function tasksFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, "")).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one task row.");
  if (rows.length > 501) throw new Error("CSV supports up to 500 data rows.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const requiredHeaders = ["row_type", "task_name", "parent_task_name", "start_date", "end_date", "priority", "assignees", "description", "dependency_tasks"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Missing columns: ${missingHeaders.join(", ")}.`);

  const records = rows.slice(1).map((row, index) => Object.fromEntries(headers.map((header, column) => [header, String(row[column] || "").trim()])));
  const errors = [];
  const taskMap = new Map();
  let adjustedDateCount = 0;
  const allowedMembers = new Set(members.map((member) => member.email));
  const validPriorities = new Set(priorities);

  records.forEach((record, index) => {
    const line = index + 2;
    const type = record.row_type.toLowerCase();
    if (!record.task_name) errors.push(`Row ${line}: task_name is required.`);
    if (!new Set(["task", "subtask"]).has(type)) errors.push(`Row ${line}: row_type must be task or subtask.`);
    if (record.start_date && !isIsoDate(record.start_date)) errors.push(`Row ${line}: start_date must use YYYY-MM-DD.`);
    if (record.end_date && !isIsoDate(record.end_date)) errors.push(`Row ${line}: end_date must use YYYY-MM-DD.`);
    const priority = record.priority || "Medium";
    if (!validPriorities.has(priority)) errors.push(`Row ${line}: priority must be Low, Medium, or High.`);
    const assignees = splitBulkValues(record.assignees).map((email) => email.toLowerCase());
    if (!assignees.length) errors.push(`Row ${line}: at least one assignee email is required.`);
    assignees.filter((email) => !allowedMembers.has(email)).forEach((email) => errors.push(`Row ${line}: ${email} is not a project member.`));
    if (type === "task" && record.task_name) {
      const key = taskNameKey(record.task_name);
      if (taskMap.has(key)) errors.push(`Row ${line}: duplicate main task "${record.task_name}".`);
      else {
        const dueDate = normalizeBulkEndDate(record.start_date, record.end_date);
        if (dueDate !== record.end_date) adjustedDateCount += 1;
        taskMap.set(key, {
        main_task_name: record.task_name,
        description: record.description,
        status: "Not Started",
        assignee: assignees,
        start_date: record.start_date,
        due_date: dueDate,
        priority,
        sub_tasks: [],
        dependency_task_names: splitBulkValues(record.dependency_tasks)
        });
      }
    }
  });

  records.forEach((record, index) => {
    if (record.row_type.toLowerCase() !== "subtask") return;
    const line = index + 2;
    if (!record.parent_task_name) {
      errors.push(`Row ${line}: parent_task_name is required for a subtask.`);
      return;
    }
    const parent = taskMap.get(taskNameKey(record.parent_task_name));
    if (!parent) {
      errors.push(`Row ${line}: parent task "${record.parent_task_name}" is not in this CSV.`);
      return;
    }
    const dueDate = normalizeBulkEndDate(record.start_date, record.end_date);
    if (dueDate !== record.end_date) adjustedDateCount += 1;
    parent.sub_tasks.push({
      sub_task_name: record.task_name,
      status: "Not Started",
      assignee: splitBulkValues(record.assignees).map((email) => email.toLowerCase()),
      start_date: record.start_date,
      due_date: dueDate,
      priority: record.priority || "Medium"
    });
  });

  if (!taskMap.size) errors.push("Add at least one row with row_type set to task.");
  if (taskMap.size > 100) errors.push("Upload up to 100 main tasks at a time.");
  if (errors.length) {
    const error = new Error(errors[0]);
    error.messages = errors;
    throw error;
  }

  const knownTaskNames = new Set([...tasks.map((task) => taskNameKey(task.main_task_name)), ...taskMap.keys()]);
  const ignoredDependencyCount = [...taskMap.values()].flatMap((task) => task.dependency_task_names)
    .filter((name) => !knownTaskNames.has(taskNameKey(name))).length;
  return {
    tasks: [...taskMap.values()],
    subtaskCount: [...taskMap.values()].reduce((count, task) => count + task.sub_tasks.length, 0),
    ignoredDependencyCount,
    adjustedDateCount
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted value.");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function splitBulkValues(value) {
  return String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function taskNameKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeBulkEndDate(startDate, dueDate) {
  return hasInvalidDateRange(startDate, dueDate) ? startDate : dueDate;
}

function hasInvalidDateRange(startDate, dueDate) {
  return Boolean(startDate && dueDate && dateTime(dueDate) < dateTime(startDate));
}

function manualDateError(task) {
  if (hasInvalidDateRange(task.start_date, task.due_date)) return "End date cannot be earlier than start date.";
  const invalidSubtask = (task.sub_tasks || []).find((subtask) => hasInvalidDateRange(subtask.start_date, subtask.due_date));
  return invalidSubtask ? `End date for subtask "${invalidSubtask.sub_task_name}" cannot be earlier than its start date.` : "";
}

function payloadFromCreateForm() {
  const data = new FormData(newTaskForm);
  const assignee = getCheckedValues("assignees", newTaskForm);
  const name = String(data.get("name") || "").trim();
  if (!name) return showToast("Task name is required."), null;
  if (!assignee.length) return showToast("Choose at least one assignee."), null;
  const task = {
    main_task_name: name,
    description: String(data.get("description") || "").trim(),
    status: "Not Started",
    assignee,
    start_date: String(data.get("start") || ""),
    due_date: String(data.get("end") || ""),
    priority: String(data.get("priority") || "Medium"),
    sub_tasks: collectSubtasks(newTaskForm, subtaskBuilderList),
    dependency_tasks: getCheckedValues("dependencies", newTaskForm).map((id) => ({
      dependency_task_id: id,
      dependency_task_name: tasks.find((task) => task.id === id)?.main_task_name || id
    })),
    created_by: getStoredUser()?.email || ""
  };
  const dateError = manualDateError(task);
  if (dateError) return showToast(dateError), null;
  normalizeTaskDates(task);
  if (task.due_date !== String(data.get("end") || "")) showToast("Main task end date adjusted to match latest subtask end date.");
  return task;
}

async function saveTask(task, message) {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(task.id)}`, patchOptions(normalizeTaskDates(task)));
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Task could not be updated.");
    tasks = tasks.map((item) => item.id === result.task.id ? result.task : item);
    cacheCurrentTasks();
    closeStatusMenu();
    renderTasks();
    showToast(message || "Task updated.");
  } catch (error) {
    closeStatusMenu();
    renderTasks();
    showToast(error.message || "Task could not be updated.");
  }
}

function openEditTask(row) {
  try {
    const task = row?._task || tasks.find((item) => item.id === (row?.dataset.parent || row?.dataset.taskId));
    if (!task) return showToast("Task could not be opened.");
    const isSubtask = Boolean(row.dataset.parent);
    const subtask = isSubtask ? row._subtask || task.sub_tasks[Number(row.dataset.subtaskIndex)] || task.sub_tasks.find((item) => item.sub_task_name === row.dataset.name) : null;
    if (isSubtask && !subtask) return showToast("Subtask could not be opened.");
    const source = subtask || task;
    resetEditForm();
    editState = { mode: isSubtask ? "subtask" : "main", task, subtask };
    editTaskForm.elements["edit-name"].value = isSubtask ? source.sub_task_name : source.main_task_name;
    editTaskForm.elements["edit-start"].value = source.start_date || "";
    editTaskForm.elements["edit-end"].value = source.due_date || "";
    editTaskForm.elements["edit-description"].value = task.description || "";
    editPriorityOptions.innerHTML = priorities.map((priority) => priorityOption(priority, "edit-priority", priority === source.priority)).join("");
    editAssigneeOptions.innerHTML = members.map((member) => memberOption(member, "edit-assignees", normalizeAssignees(source.assignee))).join("");
    editTaskModeBadge.textContent = isSubtask ? "Subtask" : "Main task";
    editDetailsTitle.textContent = isSubtask ? "Subtask Details" : "Task Details";
    editDependencySection.hidden = isSubtask;
    editSubtaskSection.hidden = isSubtask;
    editDescriptionField.hidden = isSubtask;
    deleteMainTaskBtn.textContent = isSubtask ? "Delete Subtask" : "Delete Task";
    if (!isSubtask) {
      editDependencyOptions.innerHTML = dependencyOptionsHtml(task);
      (task.sub_tasks || []).forEach((item) => addSubtaskCard(editSubtaskEditorList, `edit-subtask-${++editSubtaskCounter}`, item));
    }
    updateEditSummaries();
    openDialog(editTaskDialog);
    requestAnimationFrame(() => editTaskForm.elements["edit-name"]?.focus());
  } catch (error) {
    console.error(error);
    showToast(error.message || "Task could not be opened.");
  }
}

async function saveEditedTask(event) {
  event.preventDefault();
  if (!editState) return;
  const data = new FormData(editTaskForm);
  const name = String(data.get("edit-name") || "").trim();
  const assignee = getCheckedValues("edit-assignees", editTaskForm);
  if (!name) return showToast("Task name is required.");
  if (!assignee.length) return showToast("Choose at least one assignee.");

  const editStartDate = String(data.get("edit-start") || "");
  const editDueDate = String(data.get("edit-end") || "");

  if (editState.mode === "subtask") {
    if (hasInvalidDateRange(editStartDate, editDueDate)) return showToast("End date cannot be earlier than start date.");
    Object.assign(editState.subtask, {
      sub_task_name: name,
      assignee,
      start_date: editStartDate,
      due_date: editDueDate,
      priority: String(data.get("edit-priority") || "Medium")
    });
  } else {
    const editedSubtasks = collectSubtasks(editTaskForm, editSubtaskEditorList);
    const dateError = manualDateError({ start_date: editStartDate, due_date: editDueDate, sub_tasks: editedSubtasks });
    if (dateError) return showToast(dateError);
    Object.assign(editState.task, {
      main_task_name: name,
      description: String(data.get("edit-description") || "").trim(),
      assignee,
      start_date: editStartDate,
      due_date: editDueDate,
      priority: String(data.get("edit-priority") || "Medium"),
      sub_tasks: editedSubtasks,
      dependency_tasks: getCheckedValues("edit-dependencies", editTaskForm).map((id) => ({
        dependency_task_id: id,
        dependency_task_name: tasks.find((task) => task.id === id)?.main_task_name || id
      }))
    });
  }

  const task = editState.task;
  closeEditDialog();
  await saveTask(task, `Updated "${name}".`);
}

async function deleteCurrentEditTarget() {
  if (!editState) return;
  if (editState.mode === "subtask") {
    editState.task.sub_tasks = editState.task.sub_tasks.filter((item) => item !== editState.subtask);
    const task = editState.task;
    closeEditDialog();
    await saveTask(task, "Subtask deleted.");
    return;
  }

  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/tasks/${encodeURIComponent(editState.task.id)}`, { method: "DELETE" });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Task could not be deleted.");
    tasks = tasks.filter((task) => task.id !== editState.task.id);
    cacheCurrentTasks();
    expandedParents.delete(editState.task.id);
    closeEditDialog();
    renderTasks();
    showToast("Main task deleted.");
  } catch (error) {
    showToast(error.message || "Task could not be deleted.");
  }
}

function prepareCreateForm() {
  mainAssigneeOptions.innerHTML = members.map((member) => memberOption(member, "assignees")).join("");
  dependencyOptions.innerHTML = dependencyOptionsHtml();
  updateCreateSummaries();
}

function dependencyOptionsHtml(currentTask = null) {
  const selected = new Set((currentTask?.dependency_tasks || []).map((item) => item.dependency_task_id));
  const options = tasks.filter((task) => task.id !== currentTask?.id);
  return options.length ? options.map((task) => `<label class="multi-option"><input data-multi-input type="checkbox" name="${currentTask ? "edit-dependencies" : "dependencies"}" value="${escapeAttr(task.id)}"${selected.has(task.id) ? " checked" : ""} />${escapeHtml(task.main_task_name)}</label>`).join("") : `<span class="multi-option empty-option">No main tasks yet</span>`;
}

function closeCreateDialog() {
  if (newTaskDialog.open) newTaskDialog.close();
  newTaskForm.reset();
  subtaskBuilderList.replaceChildren();
  subtaskCounter = 0;
  closeDropdowns();
  updateCreateSummaries();
}

function closeEditDialog() {
  if (editTaskDialog.open) editTaskDialog.close();
  resetEditForm();
  editState = null;
}

function resetEditForm() {
  editTaskForm.reset();
  editSubtaskEditorList.replaceChildren();
  editSubtaskCounter = 0;
  closeDropdowns();
}

function addSubtaskCard(root, id, values = {}) {
  const isEdit = root === editSubtaskEditorList;
  const card = document.createElement("article");
  card.className = "subtask-builder-card";
  card.dataset[isEdit ? "editSubtaskDraft" : "subtaskDraft"] = id;
  card.dataset.status = values.status || "Not Started";
  card.innerHTML = `
    <div class="subtask-builder-head">
      <strong>Subtask ${root.children.length + 1}</strong>
      <button class="remove-subtask-button" type="button" ${isEdit ? "data-remove-edit-subtask" : "data-remove-subtask"}>Remove</button>
    </div>
    <div class="subtask-grid">
      <label class="field-wide">Subtask Name<input name="${id}-name" required maxlength="80" value="${escapeAttr(values.sub_task_name || "")}" /></label>
      <label>Start Date<input name="${id}-start" type="date" value="${escapeAttr(values.start_date || "")}" /></label>
      <label>End Date<input name="${id}-end" type="date" value="${escapeAttr(values.due_date || "")}" /></label>
      <div class="task-field"><span>Priority</span><details class="task-multi-select priority-select"><summary><span class="priority-summary" ${isEdit ? "data-edit-subtask-priority-summary" : "data-subtask-priority-summary"}="${id}-priority"><img src="${priorityMeta[values.priority || "Medium"]}" alt="" />${values.priority || "Medium"}</span></summary><div class="multi-select-panel priority-select-panel">${priorities.map((priority) => priorityOption(priority, `${id}-priority`, priority === (values.priority || "Medium"))).join("")}</div></details></div>
      <div class="task-field"><span>Assignee</span><details class="task-multi-select assignee-select"><summary><span ${isEdit ? "data-edit-subtask-assignee-summary" : "data-subtask-assignee-summary"}="${id}-assignees">Choose members</span></summary><div class="multi-select-panel">${members.map((member) => memberOption(member, `${id}-assignees`, normalizeAssignees(values.assignee))).join("")}</div></details></div>
    </div>
  `;
  root.append(card);
  isEdit ? updateEditSummaries() : updateCreateSummaries();
}

function removeDraftCard(event) {
  const button = event.target.closest("[data-remove-subtask], [data-remove-edit-subtask]");
  if (!button) return;
  const root = button.closest("#editSubtaskEditorList") || button.closest("#subtaskBuilderList");
  button.closest(".subtask-builder-card")?.remove();
  [...root.querySelectorAll(".subtask-builder-head strong")].forEach((title, index) => { title.textContent = `Subtask ${index + 1}`; });
  root === editSubtaskEditorList ? updateEditSummaries() : updateCreateSummaries();
}

function collectSubtasks(form, root) {
  return [...root.querySelectorAll("[data-subtask-draft], [data-edit-subtask-draft]")].map((card) => {
    const id = card.dataset.subtaskDraft || card.dataset.editSubtaskDraft;
    return {
      sub_task_name: String(new FormData(form).get(`${id}-name`) || "").trim(),
      status: card.dataset.status || "Not Started",
      assignee: getCheckedValues(`${id}-assignees`, form),
      start_date: String(new FormData(form).get(`${id}-start`) || ""),
      due_date: String(new FormData(form).get(`${id}-end`) || ""),
      priority: String(new FormData(form).get(`${id}-priority`) || "Medium")
    };
  }).filter((subtask) => subtask.sub_task_name);
}

function updateCreateSummaries() {
  setSummary(mainAssigneeSummary, "assignees", newTaskForm, memberName, "Choose members");
  setSummary(dependencySummary, "dependencies", newTaskForm, taskName, "Select previous main tasks");
  updatePrioritySummary(mainPrioritySummary, "priority", newTaskForm);
  subtaskBuilderList.querySelectorAll("[data-subtask-assignee-summary]").forEach((summary) => setSummary(summary, summary.dataset.subtaskAssigneeSummary, newTaskForm, memberName, "Choose members"));
  subtaskBuilderList.querySelectorAll("[data-subtask-priority-summary]").forEach((summary) => updatePrioritySummary(summary, summary.dataset.subtaskPrioritySummary, newTaskForm));
}

function updateEditSummaries() {
  setSummary(editAssigneeSummary, "edit-assignees", editTaskForm, memberName, "Choose members");
  setSummary(editDependencySummary, "edit-dependencies", editTaskForm, taskName, "Select previous main tasks");
  updatePrioritySummary(editPrioritySummary, "edit-priority", editTaskForm);
  editSubtaskEditorList.querySelectorAll("[data-edit-subtask-assignee-summary]").forEach((summary) => setSummary(summary, summary.dataset.editSubtaskAssigneeSummary, editTaskForm, memberName, "Choose members"));
  editSubtaskEditorList.querySelectorAll("[data-edit-subtask-priority-summary]").forEach((summary) => updatePrioritySummary(summary, summary.dataset.editSubtaskPrioritySummary, editTaskForm));
}

function setSummary(node, name, form, formatter, fallback) {
  const selected = getCheckedValues(name, form);
  node.textContent = selected.length ? selected.map(formatter).join(", ") : fallback;
}

function updatePrioritySummary(node, name, form) {
  const priority = new FormData(form).get(name) || "Medium";
  node.innerHTML = `<img src="${priorityMeta[priority]}" alt="" />${priority}`;
}

function memberOption(member, name, checked = []) {
  const email = String(member.email || "").toLowerCase();
  const selected = new Set(normalizeAssignees(checked));
  return `<label class="multi-option"><input data-multi-input type="checkbox" name="${name}" value="${escapeAttr(email)}"${selected.has(email) ? " checked" : ""} />${memberOptionAvatar(member)}${escapeHtml(member.name || email)}</label>`;
}

function memberOptionAvatar(member) {
  const name = member.name || member.email || "Member";
  const photo = String(member.photoURL || member.photoUrl || member.profile_url || member.photo_url || member.avatarUrl || "").trim();
  return photo
    ? `<img class="member-option-avatar" src="${escapeAttr(photo)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`
    : `<span class="member-dot">${escapeHtml(initials(name))}</span>`;
}

function priorityOption(priority, name, checked = false) {
  return `<label class="multi-option priority-option"><input data-priority-input type="radio" name="${name}" value="${priority}"${checked ? " checked" : ""} /><img class="priority-option-icon" src="${priorityMeta[priority]}" alt="" /><span>${priority}</span><i class="priority-check" aria-hidden="true"></i></label>`;
}

function getCheckedValues(name, form) {
  return [...form.querySelectorAll("input[type='checkbox']")]
    .filter((input) => input.name === name && input.checked)
    .map((input) => input.value);
}

function normalizeAssignees(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(normalizeAssignees))];
  }
  return splitAssignees(value);
}

function splitAssignees(value) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function requestDelete(title, message, action) {
  pendingDeleteAction = action;
  confirmDeleteTitle.textContent = title;
  confirmDeleteMessage.textContent = message;
  openDialog(confirmDeleteDialog);
}

function closeProjectDropdown() {
  projectDropdown.hidden = true;
  projectSelector.setAttribute("aria-expanded", "false");
}

function closeDropdowns() {
  closeProjectDropdown();
  document.querySelectorAll(".task-multi-select[open]").forEach((dropdown) => dropdown.removeAttribute("open"));
}

function toggleSubtasks(taskId) {
  expandedParents.has(taskId) ? expandedParents.delete(taskId) : expandedParents.add(taskId);
  renderTasks();
}

function syncAllToggleState() {
  const expandable = tasks.filter((task) => task.sub_tasks?.length);
  const allExpanded = expandable.length > 0 && expandable.every((task) => expandedParents.has(task.id));
  toggleAllSubtasks.setAttribute("aria-expanded", String(allExpanded));
  toggleAllSubtasks.setAttribute("aria-label", allExpanded ? "Hide all subtasks" : "Show all subtasks");
}

function sortTasks(items) {
  return [...items].sort((a, b) => dateTime(a.due_date) - dateTime(b.due_date));
}

function sortSubtasks(items) {
  return [...items].sort((a, b) => dateTime(a.due_date) - dateTime(b.due_date));
}

function dateTime(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function normalizeTaskDates(task) {
  const latestSubtaskDueDate = (task.sub_tasks || [])
    .map((subtask) => subtask.due_date)
    .filter(Boolean)
    .sort((a, b) => dateTime(b) - dateTime(a))[0] || "";
  if (latestSubtaskDueDate && (!task.due_date || dateTime(latestSubtaskDueDate) > dateTime(task.due_date))) {
    task.due_date = latestSubtaskDueDate;
  }
  return task;
}

function assigneeCell(assignee) {
  const emails = normalizeAssignees(assignee);
  if (!emails.length) return `<span class="assignee-cell"><span class="task-avatar member-dot">?</span></span>`;
  const visible = emails.slice(0, 3);
  const extra = emails.length - visible.length;
  return `<span class="assignee-cell">${visible.map((email) => {
    const member = members.find((item) => item.email === email);
    const name = member?.name || email || "Unassigned";
    const photo = member?.photoURL || member?.photoUrl || member?.profile_url || member?.photo_url || member?.avatarUrl || "";
    return photo
      ? `<img class="task-avatar" src="${escapeAttr(photo)}" alt="${escapeAttr(name)}" title="${escapeAttr(name)}" />`
      : `<span class="task-avatar member-dot" title="${escapeAttr(name)}">${escapeHtml(initials(name))}</span>`;
  }).join("")}${extra > 0 ? `<span class="task-avatar member-dot task-avatar-extra">+${extra}</span>` : ""}</span>`;
}

function statusClass(status) {
  return {
    "Completed": "completed",
    "In Progress": "in-progress",
    "Partially Completed": "partial",
    "Not Started": "not-started",
    "Blocked": "blocked"
  }[status] || "not-started";
}

function formatDate(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unscheduled";
}

function memberName(email) {
  return members.find((item) => item.email === email)?.name || email;
}

function taskName(id) {
  return tasks.find((task) => task.id === id)?.main_task_name || id;
}

function fallbackMembers() {
  const user = getStoredUser();
  const email = String(user?.email || "").toLowerCase();
  return email ? [{ email, name: user.name || user.displayName || email, photoURL: user.photoURL || user.photoUrl || user.profile_url || user.avatarUrl || "" }] : [];
}

function normalizeMembers(list) {
  return (Array.isArray(list) ? list : [])
    .map((member) => ({
      ...member,
      email: String(member.email || "").trim().toLowerCase()
    }))
    .filter((member) => member.email);
}

function mergeMembers(...memberLists) {
  const byEmail = new Map();
  memberLists.flat().forEach((member) => {
    const email = String(member?.email || "").trim().toLowerCase();
    if (!email) return;
    byEmail.set(email, { ...(byEmail.get(email) || {}), ...member, email });
  });
  return [...byEmail.values()];
}

function freshFetch(url, options = {}) {
  const cacheBust = `_=${Date.now()}`;
  const separator = url.includes("?") ? "&" : "?";
  return fetch(`${url}${separator}${cacheBust}`, { cache: "no-store", ...options });
}

function normalizeMemberKey(value) {
  if (value && typeof value === "object") {
    return normalizeMemberKey(value.email || value.user_email || value.id || value.uid || value.name || value.displayName);
  }
  return String(value || "").trim().toLowerCase();
}

function openDialog(dialogNode) {
  if (dialogNode.open) return;
  if (typeof dialogNode.showModal === "function") {
    try {
      dialogNode.showModal();
      return;
    } catch {
      dialogNode.setAttribute("open", "");
      return;
    }
  }
  dialogNode.setAttribute("open", "");
}

function postOptions(body) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function patchOptions(body) {
  return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function initials(value) {
  return String(value || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
