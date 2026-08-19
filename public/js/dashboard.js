import { watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const projectSelector = byId("projectSelector");
const projectDropdown = byId("projectDropdown");
const notificationButton = byId("notificationButton");
const notificationDropdown = byId("notificationDropdown");
const toast = byId("toast");
let toastTimer;

watchFirebaseUserProfile();

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
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

document.querySelectorAll("[data-project]").forEach((button) => {
  button.addEventListener("click", () => {
    byId("selectedProject").textContent = button.dataset.project;
    closeDropdowns();
    showToast(`${button.dataset.project} selected. Dashboard data is mocked for this preview.`);
  });
});

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    const screen = button.dataset.screen;
    if (screen === "Gantt Chart") {
      window.location.href = "/gantt";
      return;
    }
    if (screen === "Projects") {
      window.location.href = "/projects";
      return;
    }
    if (screen === "Tasks") {
      window.location.href = "/tasks";
      return;
    }
    if (screen === "Activity") {
      window.location.href = "/activity";
      return;
    }
    if (screen === "Members") {
      window.location.href = "/members";
      return;
    }
    if (screen === "Settings") {
      window.location.href = "/settings";
      return;
    }
    if (screen === "Dashboard") {
      window.location.href = "/dashboard";
      return;
    }
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    setSidebar(false);
    showToast(`${screen} is planned next. Dashboard is the active first-page mock.`);
  });
});

document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.tab === "Gantt") {
      window.location.href = "/gantt.html";
      return;
    }
    if (tab.dataset.tab === "Tasks") {
      window.location.href = "/tasks";
      return;
    }
    if (tab.dataset.tab === "Activity") {
      window.location.href = "/activity";
      return;
    }
    if (tab.dataset.tab === "Members") {
      window.location.href = "/members";
      return;
    }
    document.querySelectorAll("[data-tab]").forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    if (tab.dataset.tab !== "Overview") showToast(`${tab.dataset.tab} view will be connected in a later screen.`);
  });
});

document.querySelectorAll("[data-filter]").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active-filter"));
    card.classList.add("active-filter");
    showToast(`Task filter selected: ${card.dataset.filter}`);
  });
});

byId("dateRange").addEventListener("change", (event) => {
  showToast(`Dashboard range changed to the last ${event.target.value} days.`);
});

byId("markRead").addEventListener("click", (event) => {
  event.stopPropagation();
  const count = document.querySelector(".notification-count");
  count.textContent = "0";
  count.hidden = true;
  notificationButton.setAttribute("aria-label", "No unread notifications");
  showToast("All notifications marked as read.");
});

document.querySelectorAll(".card-menu").forEach((button) => {
  button.addEventListener("click", () => showToast("Chart actions will be available with live project data."));
});

const progressData = {
  labels: ["May 12", "May 19", "May 26", "Jun 02", "Jun 09", "Jun 12"],
  actual: [18, 28, 45, 62, 74, 92],
  planned: [15, 25, 35, 50, 65, 75]
};

function drawProgressChart() {
  const canvas = byId("progressChart");
  if (!canvas) return;
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const width = box.width;
  const height = box.height;
  const padding = { top: 23, right: 27, bottom: 39, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (chartWidth * index) / (progressData.labels.length - 1);
  const y = (value) => padding.top + chartHeight * (1 - value / 100);

  ctx.font = "11px Inter, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  [0, 25, 50, 75, 100].forEach((value) => {
    const pointY = y(value);
    ctx.beginPath();
    ctx.moveTo(padding.left, pointY);
    ctx.lineTo(width - padding.right, pointY);
    ctx.strokeStyle = "#e6ebf1";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#5d6b82";
    ctx.textAlign = "right";
    ctx.fillText(`${value}%`, padding.left - 9, pointY);
  });

  progressData.labels.forEach((label, index) => {
    ctx.fillStyle = "#47566d";
    ctx.textAlign = index === 0 ? "left" : index === progressData.labels.length - 1 ? "right" : "center";
    ctx.fillText(label, x(index), height - 14);
  });

  const drawLine = (values, color, dashed) => {
    ctx.save();
    ctx.beginPath();
    values.forEach((value, index) => index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value)));
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 2 : 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(dashed ? [6, 6] : []);
    ctx.stroke();
    ctx.restore();
  };

  drawLine(progressData.planned, "#4f8cf7", true);
  drawLine(progressData.actual, "#1469f3", false);

  progressData.actual.forEach((value, index) => {
    ctx.beginPath();
    ctx.arc(x(index), y(value), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#1469f3";
    ctx.fill();
    ctx.fillStyle = "#101d34";
    ctx.font = "700 11px Inter, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${value}%`, x(index), y(value) - 15);
  });
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawProgressChart, 100);
});

if (document.fonts?.ready) document.fonts.ready.then(drawProgressChart);
else drawProgressChart();
