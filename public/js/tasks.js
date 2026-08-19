import { watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const searchInput = byId("searchInput");
const statusFilter = byId("statusFilter");
const assigneeFilter = byId("assigneeFilter");
const labelFilter = byId("labelFilter");
const tasksBody = byId("tasksBody");
const emptyState = byId("emptyState");
const footerCount = byId("footerCount");
const statusMenu = byId("statusMenu");
const completeSubtasksDialog = byId("completeSubtasksDialog");
const incompleteSubtasksList = byId("incompleteSubtasksList");
const completeSubtasksMessage = byId("completeSubtasksMessage");
const toggleAllSubtasks = byId("toggleAllSubtasks");
const projectSelector = byId("projectSelector");
const projectDropdown = byId("projectDropdown");
const selectedProject = byId("selectedProject");
const activeProjectName = new URLSearchParams(window.location.search).get("project") || localStorage.getItem("activeProject");
let toastTimer;
let activeStatusButton = null;
let pendingCompletion = null;
let editState = null;
let editSubtaskDraftCounter = 0;
let pendingDeleteAction = null;
const expandedParents = new Set();
const statusOptions = [
  "Not Started",
  "In Progress",
  "Partially Completed",
  "Completed",
  "Blocked"
];
const projectMembers = [
  { id: "john", name: "John Doe", initials: "JD", photo: "https://i.pravatar.cc/100?img=12" },
  { id: "sarah", name: "Sarah Johnson", initials: "SJ", photo: "https://i.pravatar.cc/100?img=32" },
  { id: "priya", name: "Priya Rao", initials: "PR", photo: "https://i.pravatar.cc/100?img=47" },
  { id: "arun", name: "Arun Roy", initials: "AR", photo: "https://i.pravatar.cc/100?img=56" },
  { id: "vikram", name: "Vikram Kumar", initials: "VK", photo: "https://i.pravatar.cc/100?img=15" }
];
const priorityMeta = {
  High: "./assets/photos/high.png",
  Medium: "./assets/photos/med.png",
  Low: "./assets/photos/low.png"
};
const priorityOptions = ["Low", "Medium", "High"];
let subtaskDraftCounter = 0;

watchFirebaseUserProfile();

if (selectedProject && activeProjectName) {
  selectedProject.textContent = activeProjectName;
  localStorage.setItem("activeProject", activeProjectName);
}

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
  const shouldOpen = projectDropdown.hidden;
  projectDropdown.hidden = !shouldOpen;
  projectSelector.setAttribute("aria-expanded", String(shouldOpen));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeStatusMenu();
    closeProjectDropdown();
    closeTaskDropdowns();
    setSidebar(false);
  }
});

document.querySelectorAll("[data-project]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedProject.textContent = button.dataset.project;
    localStorage.setItem("activeProject", button.dataset.project);
    closeProjectDropdown();
    showToast(`${button.dataset.project} selected. Task data is mocked for this preview.`);
  });
});

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    const screen = button.dataset.screen;
    if (screen === "Dashboard") { window.location.href = "/dashboard"; return; }
    if (screen === "Projects") { window.location.href = "/projects"; return; }
    if (screen === "Gantt Chart") { window.location.href = "/gantt"; return; }
    if (screen === "Members") { window.location.href = "/members"; return; }
    if (screen === "Activity") { window.location.href = "/activity"; return; }
    if (screen === "Settings") { window.location.href = "/settings"; return; }
    setSidebar(false);
    showToast(`${screen} is planned next. Tasks is now live.`);
  });
});

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const assignee = assigneeFilter.value;
  const label = labelFilter.value;
  let visible = 0;
  const rows = [...tasksBody.querySelectorAll("tr")];

  rows.forEach((row) => {
    const matchesSearch = !q || row.dataset.name.toLowerCase().includes(q);
    const matchesStatus = status === "all" || row.dataset.status === status;
    const assignees = (row.dataset.assignee || "").split(",").map((item) => item.trim());
    const matchesAssignee = assignee === "all" || assignees.includes(assignee);
    const matchesLabel = label === "all" || row.dataset.label === label;
    const parentIsOpen = !row.dataset.parent || expandedParents.has(row.dataset.parent);
    const show = parentIsOpen && matchesSearch && matchesStatus && matchesAssignee && matchesLabel;
    row.hidden = !show;
    if (show) visible++;
  });

  emptyState.hidden = visible !== 0;
  footerCount.textContent = visible
    ? `Showing 1 to ${visible} of 128 tasks`
    : "Showing 0 of 128 tasks";
}

[searchInput, statusFilter, assigneeFilter, labelFilter].forEach((control) => {
  control.addEventListener(control === searchInput ? "input" : "change", applyFilters);
});

byId("clearFilters").addEventListener("click", () => {
  searchInput.value = "";
  statusFilter.value = "all";
  assigneeFilter.value = "all";
  labelFilter.value = "all";
  expandedParents.clear();
  document.querySelectorAll("[data-toggle-subtasks]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
  syncAllToggleState();
  applyFilters();
  showToast("Task filters cleared.");
});

toggleAllSubtasks.addEventListener("click", () => {
  const toggles = [...document.querySelectorAll("[data-toggle-subtasks]")];
  const shouldExpand = toggles.some((button) => button.getAttribute("aria-expanded") !== "true");

  expandedParents.clear();
  toggles.forEach((button) => {
    button.setAttribute("aria-expanded", String(shouldExpand));
    if (shouldExpand) expandedParents.add(button.dataset.toggleSubtasks);
  });
  toggleAllSubtasks.setAttribute("aria-expanded", String(shouldExpand));
  toggleAllSubtasks.setAttribute("aria-label", shouldExpand ? "Hide all subtasks" : "Show all subtasks");
  applyFilters();
  showToast(shouldExpand ? "All subtasks expanded." : "All subtasks collapsed.");
});

tasksBody.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-task]");
  if (editButton) {
    openEditTask(editButton.closest("tr"));
    return;
  }

  const toggle = event.target.closest("[data-toggle-subtasks]");
  if (toggle) {
    toggleSubtasks(toggle.closest("tr"));
    return;
  }

  const statusButton = event.target.closest("[data-status-button]");
  if (statusButton) {
    openStatusMenu(statusButton);
    return;
  }

  const row = event.target.closest("tr");
  if (!row || row.hidden || event.target.matches("input, button")) return;
  if (row.dataset.taskId) toggleSubtasks(row);
});

function toggleSubtasks(row) {
  const toggle = row.querySelector("[data-toggle-subtasks]");
  if (!toggle) return;
  const key = toggle.dataset.toggleSubtasks;
  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  if (expanded) expandedParents.delete(key);
  else expandedParents.add(key);
  syncAllToggleState();
  applyFilters();
  showToast(`${expanded ? "Collapsed" : "Expanded"} ${row.dataset.name}.`);
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

function setStatus(button, status) {
  const row = button.closest("tr");
  if (status === "Completed" && row.dataset.taskId) {
    const incompleteSubtasks = getSubtaskRows(row.dataset.taskId).filter((subtask) => subtask.dataset.status !== "Completed");
    if (incompleteSubtasks.length) {
      promptCompleteSubtasks(row, button, incompleteSubtasks);
      return;
    }
  }

  setRowStatus(row, button, status);
}

function setRowStatus(row, button, status, options = {}) {
  const { silent = false, syncParent = true } = options;
  const previous = row.dataset.status;
  row.dataset.status = status;
  button.textContent = status;
  button.classList.remove("completed", "in-progress", "partial", "not-started", "blocked");
  button.classList.add(statusClass(status));
  closeStatusMenu();
  if (syncParent && row.dataset.parent) syncParentStatusFromSubtask(row, status);
  applyFilters();
  if (!silent) showToast(`${row.dataset.name}: ${previous} -> ${status}`);
}

function getSubtaskRows(parentId) {
  return [...tasksBody.querySelectorAll("[data-parent]")].filter((row) => row.dataset.parent === parentId);
}

function getParentRow(parentId) {
  return tasksBody.querySelector(`[data-task-id="${parentId}"]`);
}

function syncParentStatusFromSubtask(subtaskRow, selectedStatus) {
  const parentRow = getParentRow(subtaskRow.dataset.parent);
  const parentButton = parentRow?.querySelector("[data-status-button]");
  if (!parentRow || !parentButton) return;

  const subtasks = getSubtaskRows(subtaskRow.dataset.parent);
  const nextParentStatus = subtasks.every((row) => row.dataset.status === "Completed")
    ? "Completed"
    : selectedStatus;

  if (parentRow.dataset.status !== nextParentStatus) {
    setRowStatus(parentRow, parentButton, nextParentStatus, { silent: true, syncParent: false });
    showToast(`${parentRow.dataset.name} updated to ${nextParentStatus} based on its subtasks.`);
  }
}

function promptCompleteSubtasks(row, button, incompleteSubtasks) {
  pendingCompletion = { row, button, incompleteSubtasks };
  closeStatusMenu();

  const count = incompleteSubtasks.length;
  completeSubtasksMessage.textContent = `${count} subtask${count === 1 ? " is" : "s are"} still not complete. To complete "${row.dataset.name}", mark all remaining subtasks as Completed too.`;
  incompleteSubtasksList.replaceChildren(...incompleteSubtasks.map((subtask) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    const status = document.createElement("span");
    name.textContent = subtask.dataset.name;
    status.textContent = subtask.dataset.status;
    item.append(name, status);
    return item;
  }));

  if (typeof completeSubtasksDialog.showModal === "function") completeSubtasksDialog.showModal();
  else completeSubtasksDialog.setAttribute("open", "");
}

function confirmCompleteSubtasks() {
  if (!pendingCompletion) return;
  pendingCompletion.incompleteSubtasks.forEach((subtask) => {
    const button = subtask.querySelector("[data-status-button]");
    setRowStatus(subtask, button, "Completed", { silent: true, syncParent: false });
  });
  setRowStatus(pendingCompletion.row, pendingCompletion.button, "Completed", { silent: true, syncParent: false });
  const parentId = pendingCompletion.row.dataset.taskId;
  if (parentId) {
    expandedParents.add(parentId);
    pendingCompletion.row.querySelector("[data-toggle-subtasks]")?.setAttribute("aria-expanded", "true");
  }
  syncAllToggleState();
  pendingCompletion = null;
  completeSubtasksDialog.close();
  applyFilters();
  showToast("Main task and remaining subtasks marked Completed.");
}

function cancelCompleteSubtasks() {
  pendingCompletion = null;
  completeSubtasksDialog.close();
}

function openStatusMenu(button) {
  activeStatusButton = button;
  statusMenu.replaceChildren();
  statusOptions.forEach((status) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = statusClass(status);
    option.textContent = status;
    option.setAttribute("role", "menuitem");
    option.addEventListener("click", () => setStatus(button, status));
    statusMenu.append(option);
  });

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

document.addEventListener("click", (event) => {
  if (!activeStatusButton) return;
  if (event.target.closest("#statusMenu") || event.target.closest("[data-status-button]")) return;
  closeStatusMenu();
});

document.addEventListener("click", (event) => {
  const clickedDropdown = event.target.closest(".task-multi-select");
  closeTaskDropdowns(clickedDropdown);
  if (!event.target.closest(".project-menu-wrap")) closeProjectDropdown();
});

window.addEventListener("resize", closeStatusMenu);

function dueTime(row) {
  if (!row.dataset.due) return Number.POSITIVE_INFINITY;
  const time = new Date(`${row.dataset.due}T00:00:00`).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function getTopLevelRows() {
  return [...tasksBody.querySelectorAll("tr")].filter((row) => !row.dataset.parent);
}

function closeTaskDropdowns(exceptDropdown = null) {
  document.querySelectorAll(".task-multi-select[open]").forEach((dropdown) => {
    if (dropdown !== exceptDropdown) dropdown.removeAttribute("open");
  });
}

function closeProjectDropdown() {
  projectDropdown.hidden = true;
  projectSelector.setAttribute("aria-expanded", "false");
}

function taskGroup(row) {
  const group = [row];
  if (row.dataset.taskId) group.push(...getSubtaskRows(row.dataset.taskId));
  return group;
}

function syncAllToggleState() {
  const toggles = [...document.querySelectorAll("[data-toggle-subtasks]")];
  const allExpanded = toggles.length > 0 && toggles.every((button) => button.getAttribute("aria-expanded") === "true");
  toggleAllSubtasks.setAttribute("aria-expanded", String(allExpanded));
  toggleAllSubtasks.setAttribute("aria-label", allExpanded ? "Hide all subtasks" : "Show all subtasks");
}

function sortTasksByDueDate() {
  const groups = getTopLevelRows()
    .map((row, index) => ({ row, index, rows: taskGroup(row) }))
    .sort((a, b) => dueTime(a.row) - dueTime(b.row) || a.index - b.index);

  groups.forEach((group) => {
    group.rows.forEach((row) => tasksBody.append(row));
  });
  renumberTasks();
  syncAllToggleState();
}

function renumberTasks() {
  getTopLevelRows().forEach((row, index) => {
    const mainNumber = String(index + 1);
    const indexCell = row.querySelector(".task-index");
    if (indexCell) indexCell.textContent = mainNumber;

    if (row.dataset.taskId) {
      getSubtaskRows(row.dataset.taskId).forEach((subtask, subtaskIndex) => {
        const subtaskIndexCell = subtask.querySelector(".task-index");
        if (subtaskIndexCell) subtaskIndexCell.textContent = `${mainNumber}.${subtaskIndex + 1}`;
      });
    }
  });
}

const dialog = byId("newTaskDialog");
const newTaskForm = byId("newTaskForm");
const addSubtaskBtn = byId("addSubtaskBtn");
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
const editSubtaskSection = byId("editSubtaskSection");
const editDependencySection = byId("editDependencySection");
const editDescriptionField = byId("editDescriptionField");
const editSubtaskEditorList = byId("editSubtaskEditorList");
const editAddSubtaskBtn = byId("editAddSubtaskBtn");
const editTaskModeBadge = byId("editTaskModeBadge");
const editDetailsTitle = byId("editDetailsTitle");
const deleteMainTaskBtn = byId("deleteMainTaskBtn");
const confirmDeleteDialog = byId("confirmDeleteDialog");
const confirmDeleteTitle = byId("confirmDeleteTitle");
const confirmDeleteMessage = byId("confirmDeleteMessage");
byId("newTaskBtn").addEventListener("click", () => {
  prepareTaskForm();
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    requestAnimationFrame(() => newTaskForm.elements.name.focus());
  } else {
    dialog.setAttribute("open", "");
  }
});
byId("dialogCancel").addEventListener("click", () => {
  dialog.close();
  resetTaskForm();
});
byId("dialogClose").addEventListener("click", () => {
  dialog.close();
  resetTaskForm();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    dialog.close();
    resetTaskForm();
  }
});
byId("editDialogCancel").addEventListener("click", closeEditDialog);
byId("editDialogClose").addEventListener("click", closeEditDialog);
editTaskDialog.addEventListener("click", (event) => {
  if (event.target === editTaskDialog) closeEditDialog();
});
byId("completeSubtasksCancel").addEventListener("click", cancelCompleteSubtasks);
byId("completeSubtasksConfirm").addEventListener("click", confirmCompleteSubtasks);
completeSubtasksDialog.addEventListener("click", (event) => {
  if (event.target === completeSubtasksDialog) cancelCompleteSubtasks();
});
byId("confirmDeleteCancel").addEventListener("click", cancelDeleteConfirmation);
byId("confirmDeleteButton").addEventListener("click", confirmDeleteAction);
confirmDeleteDialog.addEventListener("click", (event) => {
  if (event.target === confirmDeleteDialog) cancelDeleteConfirmation();
});
addSubtaskBtn.addEventListener("click", () => addSubtaskDraft());
editAddSubtaskBtn.addEventListener("click", () => addEditSubtaskCard());

newTaskForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-multi-input]")) updateMultiSelectSummaries();
  if (event.target.matches("[data-priority-input]")) {
    updatePrioritySummaries();
    event.target.closest(".priority-select")?.removeAttribute("open");
  }
});

editTaskForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-multi-input], [data-priority-input]")) updateEditSummaries();
  if (event.target.matches("[data-priority-input]")) event.target.closest(".priority-select")?.removeAttribute("open");
});

subtaskBuilderList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-subtask]");
  if (!removeButton) return;
  removeButton.closest(".subtask-builder-card")?.remove();
  renumberSubtaskDrafts();
});

editSubtaskEditorList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-edit-subtask]");
  if (!removeButton) return;
  const card = removeButton.closest(".subtask-builder-card");
  requestDelete(
    "Delete Subtask?",
    `Delete "${card.dataset.subtaskName || "this subtask"}"? This action cannot be undone.`,
    () => deleteEditSubtaskCard(card)
  );
});

deleteMainTaskBtn.addEventListener("click", () => {
  if (!editState?.row) return;
  const isSubtask = editState.mode === "subtask";
  requestDelete(
    isSubtask ? "Delete Subtask?" : "Delete Main Task?",
    isSubtask
      ? `Delete "${editState.row.dataset.name}"? This action cannot be undone.`
      : `Delete "${editState.row.dataset.name}" and all of its subtasks? This action cannot be undone.`,
    () => deleteCurrentEditTarget()
  );
});

editTaskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditedTask();
});

newTaskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(newTaskForm);
  const name = String(data.get("name") || "").trim();
  const startValue = String(data.get("start") || "");
  const dueValue = String(data.get("end") || "");
  const due = dueValue ? new Date(`${dueValue}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unscheduled";
  const priority = String(data.get("priority") || "Medium");
  const assignees = getCheckedValues("assignees");
  const dependencies = getCheckedValues("dependencies");
  const subtasks = collectSubtaskDrafts();
  if (!name) { showToast("Task name is required."); return; }
  if (!assignees.length) { showToast("Choose at least one assignee."); return; }

  const row = document.createElement("tr");
  const taskId = subtasks.length ? `task-${Date.now()}` : "";
  row.className = subtasks.length ? "phase-row" : "";
  row.dataset.name = name;
  row.dataset.status = "Not Started";
  row.dataset.assignee = assignees.join(", ");
  row.dataset.label = "Planning";
  row.dataset.priority = priority;
  row.dataset.dependencies = dependencies.join(",");
  row.dataset.description = String(data.get("description") || "").trim();
  if (taskId) row.dataset.taskId = taskId;
  if (startValue) row.dataset.start = startValue;
  if (dueValue) row.dataset.due = dueValue;
  row.innerHTML = `${taskArrowCell(taskId, name)}<td class="task-index">New</td><td class="task-title">${escapeHtml(name)}</td><td><button class="status-pill not-started status-button" type="button" data-status-button>Not Started</button></td><td>${assigneeCell(assignees)}</td><td class="muted">${due}</td><td><span class="priority ${priority.toLowerCase()}">${priority}</span></td>${taskEditCell(name)}`;
  tasksBody.append(row);

  subtasks.forEach((subtask) => {
    const subtaskRow = document.createElement("tr");
    subtaskRow.className = "subtask-row";
    subtaskRow.hidden = true;
    subtaskRow.dataset.parent = taskId;
    subtaskRow.dataset.name = subtask.name;
    subtaskRow.dataset.status = "Not Started";
    subtaskRow.dataset.assignee = subtask.assignees.join(", ");
    subtaskRow.dataset.label = "Planning";
    subtaskRow.dataset.priority = subtask.priority;
    if (subtask.start) subtaskRow.dataset.start = subtask.start;
    if (subtask.end) subtaskRow.dataset.due = subtask.end;
    subtaskRow.innerHTML = `<td></td><td class="task-index">New</td><td class="task-title subtask-name">${escapeHtml(subtask.name)}</td><td><button class="status-pill not-started status-button" type="button" data-status-button>Not Started</button></td><td>${assigneeCell(subtask.assignees)}</td><td class="muted">${formatDate(subtask.end)}</td><td><span class="priority ${subtask.priority.toLowerCase()}">${subtask.priority}</span></td>${taskEditCell(subtask.name)}`;
    tasksBody.append(subtaskRow);
  });

  sortTasksByDueDate();
  newTaskForm.reset();
  dialog.close();
  resetTaskForm();
  applyFilters();
  showToast(`Task "${name}" created and sorted by due date.`);
});

function prepareTaskForm() {
  mainAssigneeOptions.innerHTML = projectMembers.map((member) => memberOptionHtml(member, "assignees")).join("");
  renderDependencyOptions();
  updateMultiSelectSummaries();
}

function resetTaskForm() {
  newTaskForm.reset();
  subtaskBuilderList.replaceChildren();
  document.querySelectorAll(".task-multi-select[open]").forEach((details) => details.removeAttribute("open"));
  subtaskDraftCounter = 0;
  updateMultiSelectSummaries();
}

function renderDependencyOptions() {
  const mainTasks = getTopLevelRows();
  dependencyOptions.innerHTML = mainTasks.length
    ? mainTasks.map((row) => `<label class="multi-option"><input data-multi-input type="checkbox" name="dependencies" value="${escapeHtml(row.dataset.name)}" />${escapeHtml(row.dataset.name)}</label>`).join("")
    : `<span class="multi-option empty-option">No main tasks yet</span>`;
}

function memberOptionHtml(member, name, checkedNames = []) {
  const checked = checkedNames.includes(member.name) ? " checked" : "";
  return `<label class="multi-option"><input data-multi-input type="checkbox" name="${name}" value="${escapeHtml(member.name)}"${checked} /><span class="member-dot">${member.initials}</span>${escapeHtml(member.name)}</label>`;
}

function updateMultiSelectSummaries() {
  setSummary(mainAssigneeSummary, "assignees", "Choose members");
  setSummary(dependencySummary, "dependencies", "Select previous main tasks");
  subtaskBuilderList.querySelectorAll("[data-subtask-assignee-summary]").forEach((summary) => {
    setSummary(summary, summary.dataset.subtaskAssigneeSummary, "Choose members");
  });
  updatePrioritySummaries();
}

function setSummary(summary, inputName, emptyText, form = newTaskForm) {
  const selected = getCheckedValues(inputName, form);
  summary.textContent = selected.length ? selected.join(", ") : emptyText;
}

function getCheckedValues(inputName, form = newTaskForm) {
  return [...form.querySelectorAll("input[type='checkbox']")]
    .filter((input) => input.name === inputName && input.checked)
    .map((input) => input.value);
}

function priorityOptionHtml(name, inputName, checked = false) {
  return `<label class="multi-option priority-option"><input data-priority-input type="radio" name="${inputName}" value="${name}"${checked ? " checked" : ""} /><img class="priority-option-icon" src="${priorityMeta[name]}" alt="" /><span>${name}</span><i class="priority-check" aria-hidden="true"></i></label>`;
}

function updatePrioritySummaries() {
  setPrioritySummary(mainPrioritySummary, "priority");
  subtaskBuilderList.querySelectorAll("[data-subtask-priority-summary]").forEach((summary) => {
    setPrioritySummary(summary, summary.dataset.subtaskPrioritySummary);
  });
}

function setPrioritySummary(summary, inputName, form = newTaskForm) {
  if (!summary) return;
  const selected = new FormData(form).get(inputName) || "Medium";
  summary.innerHTML = `<img src="${priorityMeta[selected]}" alt="" />${selected}`;
}

function addSubtaskDraft() {
  subtaskDraftCounter += 1;
  const id = `subtask-${subtaskDraftCounter}`;
  const card = document.createElement("article");
  card.className = "subtask-builder-card";
  card.dataset.subtaskDraft = id;
  card.innerHTML = `
    <div class="subtask-builder-head">
      <strong>Subtask ${subtaskDraftCounter}</strong>
      <button class="remove-subtask-button" type="button" data-remove-subtask>Remove</button>
    </div>
    <div class="subtask-grid">
      <label class="field-wide">Subtask Name<input name="${id}-name" required placeholder="e.g., Prepare API schema" maxlength="80" /></label>
      <label>Start Date<input name="${id}-start" type="date" /></label>
      <label>End Date<input name="${id}-end" type="date" /></label>
      <div class="task-field">
        <span>Priority</span>
        <details class="task-multi-select priority-select">
          <summary><span class="priority-summary" data-subtask-priority-summary="${id}-priority"><img src="${priorityMeta.Medium}" alt="" />Medium</span></summary>
          <div class="multi-select-panel priority-select-panel">
            ${priorityOptionHtml("Low", `${id}-priority`)}
            ${priorityOptionHtml("Medium", `${id}-priority`, true)}
            ${priorityOptionHtml("High", `${id}-priority`)}
          </div>
        </details>
      </div>
      <div class="task-field">
        <span>Assignee</span>
        <details class="task-multi-select assignee-select">
          <summary><span data-subtask-assignee-summary="${id}-assignees">Choose members</span></summary>
          <div class="multi-select-panel">${projectMembers.map((member) => memberOptionHtml(member, `${id}-assignees`)).join("")}</div>
        </details>
      </div>
    </div>
  `;
  subtaskBuilderList.append(card);
}

function renumberSubtaskDrafts() {
  [...subtaskBuilderList.querySelectorAll(".subtask-builder-head strong")].forEach((title, index) => {
    title.textContent = `Subtask ${index + 1}`;
  });
}

function collectSubtaskDrafts() {
  return [...subtaskBuilderList.querySelectorAll("[data-subtask-draft]")].map((card) => {
    const id = card.dataset.subtaskDraft;
    return {
      name: String(new FormData(newTaskForm).get(`${id}-name`) || "").trim(),
      start: String(new FormData(newTaskForm).get(`${id}-start`) || ""),
      end: String(new FormData(newTaskForm).get(`${id}-end`) || ""),
      priority: String(new FormData(newTaskForm).get(`${id}-priority`) || "Medium"),
      assignees: getCheckedValues(`${id}-assignees`)
    };
  }).filter((subtask) => subtask.name);
}

function openEditTask(row) {
  const isSubtask = Boolean(row.dataset.parent);
  editState = { mode: isSubtask ? "subtask" : "main", row };
  resetEditForm();

  const values = readRowValues(row);
  editTaskForm.elements["edit-name"].value = values.name;
  editTaskForm.elements["edit-start"].value = values.start;
  editTaskForm.elements["edit-end"].value = values.end;
  editTaskForm.elements["edit-description"].value = values.description;

  editPriorityOptions.innerHTML = priorityOptions.map((priority) => priorityOptionHtml(priority, "edit-priority", priority === values.priority)).join("");
  editAssigneeOptions.innerHTML = projectMembers.map((member) => memberOptionHtml(member, "edit-assignees", values.assignees)).join("");

  editTaskModeBadge.textContent = isSubtask ? "Subtask" : "Main task";
  editDetailsTitle.textContent = isSubtask ? "Subtask Details" : "Task Details";
  editDependencySection.hidden = isSubtask;
  editSubtaskSection.hidden = isSubtask;
  editDescriptionField.hidden = isSubtask;
  deleteMainTaskBtn.textContent = isSubtask ? "Delete Subtask" : "Delete Task";

  if (!isSubtask) {
    renderEditDependencyOptions(row);
    const taskId = row.dataset.taskId;
    if (taskId) getSubtaskRows(taskId).forEach((subtask) => addEditSubtaskCard(subtask));
  }

  updateEditSummaries();
  if (typeof editTaskDialog.showModal === "function") {
    editTaskDialog.showModal();
    requestAnimationFrame(() => editTaskForm.elements["edit-name"].focus());
  } else {
    editTaskDialog.setAttribute("open", "");
  }
}

function closeEditDialog() {
  if (editTaskDialog.open) editTaskDialog.close();
  resetEditForm();
  editState = null;
}

function resetEditForm() {
  editTaskForm.reset();
  editSubtaskEditorList.replaceChildren();
  editSubtaskDraftCounter = 0;
  closeTaskDropdowns();
}

function readRowValues(row) {
  return {
    name: row.dataset.name || "",
    start: row.dataset.start || "",
    end: row.dataset.due || "",
    priority: row.dataset.priority || row.querySelector(".priority")?.textContent?.trim() || "Medium",
    assignees: splitValues(row.dataset.assignee),
    dependencies: splitValues(row.dataset.dependencies),
    description: row.dataset.description || ""
  };
}

function splitValues(value) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function renderEditDependencyOptions(row) {
  const selected = splitValues(row.dataset.dependencies);
  const mainTasks = getTopLevelRows().filter((taskRow) => taskRow !== row);
  editDependencyOptions.innerHTML = mainTasks.length
    ? mainTasks.map((taskRow) => {
      const name = taskRow.dataset.name;
      const checked = selected.includes(name) ? " checked" : "";
      return `<label class="multi-option"><input data-multi-input type="checkbox" name="edit-dependencies" value="${escapeHtml(name)}"${checked} />${escapeHtml(name)}</label>`;
    }).join("")
    : `<span class="multi-option empty-option">No other main tasks yet</span>`;
}

function updateEditSummaries() {
  setSummary(editAssigneeSummary, "edit-assignees", "Choose members", editTaskForm);
  setSummary(editDependencySummary, "edit-dependencies", "Select previous main tasks", editTaskForm);
  setPrioritySummary(editPrioritySummary, "edit-priority", editTaskForm);
  editSubtaskEditorList.querySelectorAll("[data-edit-subtask-assignee-summary]").forEach((summary) => {
    setSummary(summary, summary.dataset.editSubtaskAssigneeSummary, "Choose members", editTaskForm);
  });
  editSubtaskEditorList.querySelectorAll("[data-edit-subtask-priority-summary]").forEach((summary) => {
    setPrioritySummary(summary, summary.dataset.editSubtaskPrioritySummary, editTaskForm);
  });
}

function addEditSubtaskCard(row = null) {
  editSubtaskDraftCounter += 1;
  const id = `edit-subtask-${editSubtaskDraftCounter}`;
  const values = row ? readRowValues(row) : { name: "", start: "", end: "", priority: "Medium", assignees: [] };
  const card = document.createElement("article");
  card.className = "subtask-builder-card";
  card.dataset.editSubtaskDraft = id;
  card.dataset.subtaskName = values.name || `Subtask ${editSubtaskDraftCounter}`;
  card._taskRow = row;
  card.innerHTML = `
    <div class="subtask-builder-head">
      <strong>Subtask ${editSubtaskDraftCounter}</strong>
      <button class="remove-subtask-button" type="button" data-remove-edit-subtask>Delete</button>
    </div>
    <div class="subtask-grid">
      <label class="field-wide">Subtask Name<input name="${id}-name" required placeholder="e.g., Prepare API schema" maxlength="80" value="${escapeHtml(values.name)}" /></label>
      <label>Start Date<input name="${id}-start" type="date" value="${escapeHtml(values.start)}" /></label>
      <label>End Date<input name="${id}-end" type="date" value="${escapeHtml(values.end)}" /></label>
      <div class="task-field">
        <span>Priority</span>
        <details class="task-multi-select priority-select">
          <summary><span class="priority-summary" data-edit-subtask-priority-summary="${id}-priority"><img src="${priorityMeta[values.priority]}" alt="" />${values.priority}</span></summary>
          <div class="multi-select-panel priority-select-panel">
            ${priorityOptions.map((priority) => priorityOptionHtml(priority, `${id}-priority`, priority === values.priority)).join("")}
          </div>
        </details>
      </div>
      <div class="task-field">
        <span>Assignee</span>
        <details class="task-multi-select assignee-select">
          <summary><span data-edit-subtask-assignee-summary="${id}-assignees">Choose members</span></summary>
          <div class="multi-select-panel">${projectMembers.map((member) => memberOptionHtml(member, `${id}-assignees`, values.assignees)).join("")}</div>
        </details>
      </div>
    </div>
  `;
  editSubtaskEditorList.append(card);
  renumberEditSubtaskCards();
  updateEditSummaries();
}

function renumberEditSubtaskCards() {
  [...editSubtaskEditorList.querySelectorAll(".subtask-builder-head strong")].forEach((title, index) => {
    title.textContent = `Subtask ${index + 1}`;
  });
}

function collectEditSubtaskDrafts() {
  return [...editSubtaskEditorList.querySelectorAll("[data-edit-subtask-draft]")].map((card) => {
    const id = card.dataset.editSubtaskDraft;
    return {
      card,
      row: card._taskRow || null,
      name: String(new FormData(editTaskForm).get(`${id}-name`) || "").trim(),
      start: String(new FormData(editTaskForm).get(`${id}-start`) || ""),
      end: String(new FormData(editTaskForm).get(`${id}-end`) || ""),
      priority: String(new FormData(editTaskForm).get(`${id}-priority`) || "Medium"),
      assignees: getCheckedValues(`${id}-assignees`, editTaskForm)
    };
  }).filter((subtask) => subtask.name);
}

function saveEditedTask() {
  if (!editState?.row) return;
  const data = new FormData(editTaskForm);
  const values = {
    name: String(data.get("edit-name") || "").trim(),
    start: String(data.get("edit-start") || ""),
    end: String(data.get("edit-end") || ""),
    priority: String(data.get("edit-priority") || "Medium"),
    assignees: getCheckedValues("edit-assignees", editTaskForm),
    dependencies: getCheckedValues("edit-dependencies", editTaskForm),
    description: String(data.get("edit-description") || "").trim()
  };

  if (!values.name) { showToast("Task name is required."); return; }
  if (!values.assignees.length) { showToast("Choose at least one assignee."); return; }

  if (editState.mode === "subtask") {
    applyRowValues(editState.row, values);
    sortTasksByDueDate();
    applyFilters();
    closeEditDialog();
    showToast(`Updated "${values.name}".`);
    return;
  }

  const subtasks = collectEditSubtaskDrafts();
  let parentId = editState.row.dataset.taskId || "";
  if (subtasks.length && !parentId) {
    parentId = `task-${Date.now()}`;
    editState.row.dataset.taskId = parentId;
  }

  applyRowValues(editState.row, values);
  syncParentRowSubtaskControls(editState.row, parentId, subtasks.length);

  subtasks.forEach((subtask) => {
    const subtaskRow = subtask.row || createSubtaskRow(parentId);
    subtaskRow.dataset.parent = parentId;
    applyRowValues(subtaskRow, subtask);
    if (!subtask.row) tasksBody.append(subtaskRow);
  });

  sortTasksByDueDate();
  applyFilters();
  closeEditDialog();
  showToast(`Updated "${values.name}".`);
}

function applyRowValues(row, values) {
  row.dataset.name = values.name;
  row.dataset.status ||= "Not Started";
  row.dataset.assignee = values.assignees.join(", ");
  row.dataset.label ||= "Planning";
  row.dataset.priority = values.priority;
  if (values.dependencies) row.dataset.dependencies = values.dependencies.join(",");
  if (values.description !== undefined) row.dataset.description = values.description;
  if (values.start) row.dataset.start = values.start;
  else delete row.dataset.start;
  if (values.end) row.dataset.due = values.end;
  else delete row.dataset.due;

  row.querySelector(".task-title").textContent = values.name;
  row.children[4].innerHTML = assigneeCell(values.assignees);
  row.children[5].textContent = formatDate(values.end);
  row.children[6].innerHTML = `<span class="priority ${values.priority.toLowerCase()}">${values.priority}</span>`;
}

function createSubtaskRow(parentId) {
  const row = document.createElement("tr");
  row.className = "subtask-row";
  row.hidden = !expandedParents.has(parentId);
  row.innerHTML = `<td></td><td class="task-index">New</td><td class="task-title subtask-name"></td><td><button class="status-pill not-started status-button" type="button" data-status-button>Not Started</button></td><td></td><td class="muted"></td><td></td>${taskEditCell("subtask")}`;
  return row;
}

function syncParentRowSubtaskControls(row, parentId, subtaskCount) {
  if (subtaskCount) {
    row.classList.add("phase-row");
    row.dataset.taskId = parentId;
    row.children[0].outerHTML = taskArrowCell(parentId, row.dataset.name);
    row.querySelector("[data-toggle-subtasks]")?.setAttribute("aria-expanded", String(expandedParents.has(parentId)));
    return;
  }

  row.classList.remove("phase-row");
  if (parentId) expandedParents.delete(parentId);
  delete row.dataset.taskId;
  row.children[0].innerHTML = "";
}

function deleteEditSubtaskCard(card) {
  const row = card._taskRow;
  if (row) row.remove();
  card.remove();
  if (editState?.mode === "main" && !editSubtaskEditorList.children.length) {
    const parentId = editState.row.dataset.taskId;
    if (parentId) syncParentRowSubtaskControls(editState.row, parentId, 0);
  }
  renumberEditSubtaskCards();
  syncAllToggleState();
  applyFilters();
  showToast("Subtask deleted.");
}

function deleteCurrentEditTarget() {
  if (!editState?.row) return;
  if (editState.mode === "main") {
    const parentId = editState.row.dataset.taskId;
    if (parentId) {
      getSubtaskRows(parentId).forEach((row) => row.remove());
      expandedParents.delete(parentId);
    }
    editState.row.remove();
    closeEditDialog();
    sortTasksByDueDate();
    applyFilters();
    showToast("Main task deleted.");
    return;
  }

  const parentId = editState.row.dataset.parent;
  editState.row.remove();
  closeEditDialog();
  if (parentId && !getSubtaskRows(parentId).length) {
    const parentRow = getParentRow(parentId);
    if (parentRow) syncParentRowSubtaskControls(parentRow, parentId, 0);
  }
  sortTasksByDueDate();
  applyFilters();
  showToast("Subtask deleted.");
}

function requestDelete(title, message, action) {
  pendingDeleteAction = action;
  confirmDeleteTitle.textContent = title;
  confirmDeleteMessage.textContent = message;
  if (typeof confirmDeleteDialog.showModal === "function") confirmDeleteDialog.showModal();
  else confirmDeleteDialog.setAttribute("open", "");
}

function cancelDeleteConfirmation() {
  pendingDeleteAction = null;
  confirmDeleteDialog.close();
}

function confirmDeleteAction() {
  const action = pendingDeleteAction;
  pendingDeleteAction = null;
  confirmDeleteDialog.close();
  if (action) action();
}

function taskArrowCell(taskId, taskName) {
  return taskId
    ? `<td><button class="subtask-toggle" type="button" data-toggle-subtasks="${taskId}" aria-expanded="false" aria-label="Show ${escapeHtml(taskName)} subtasks"></button></td>`
    : "<td></td>";
}

function taskEditCell(taskName) {
  return `<td><button class="edit-task-button" type="button" data-edit-task aria-label="Edit ${escapeHtml(taskName)}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button></td>`;
}

function ensureEditCells() {
  tasksBody.querySelectorAll("tr").forEach((row) => {
    if (row.querySelector("[data-edit-task]")) return;
    row.insertAdjacentHTML("beforeend", taskEditCell(row.dataset.name || "task"));
  });
}

function assigneeCell(names) {
  const selectedMembers = names.map((name) => projectMembers.find((member) => member.name === name)).filter(Boolean);
  return `<span class="assignee-cell">${selectedMembers.map((member) => `<img class="task-avatar" src="${member.photo}" alt="${escapeHtml(member.name)}" />`).join("")}</span>`;
}

function formatDate(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unscheduled";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

ensureEditCells();
sortTasksByDueDate();
applyFilters();
