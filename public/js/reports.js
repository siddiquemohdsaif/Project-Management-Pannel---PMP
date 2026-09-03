import { getStoredUser, watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const memberSelect = byId("memberSelect");
const reportRows = byId("reportRows");
const scopePill = byId("scopePill");
const signedInEmail = getStoredUser()?.email || "saif@pmp.test";
let toastTimer;

const members = [
  { name: "Saif Shaik", email: "saif@pmp.test" },
  { name: "Aarav Khan", email: "aarav@pmp.test" },
  { name: "Neha Sharma", email: "neha@pmp.test" }
];

const records = {
  "saif@pmp.test": [
    { date: "28 Aug 2026", login: "04:00 PM", logout: "12:00 AM", presence: "8h", break: "0h", work: "8h", note: "Split session", split: true },
    { date: "29 Aug 2026", login: "12:00 AM", logout: "02:00 AM", presence: "2h", break: "0h", work: "2h", note: "Continued from Aug 28", split: true },
    { date: "27 Aug 2026", login: "11:00 AM", logout: "09:00 PM", presence: "10h", break: "1h 05m", work: "8h 55m", note: "Completed", split: false }
  ],
  "aarav@pmp.test": [
    { date: "28 Aug 2026", login: "10:15 AM", logout: "07:30 PM", presence: "9h 15m", break: "45m", work: "8h 30m", note: "Completed", split: false },
    { date: "27 Aug 2026", login: "10:35 AM", logout: "06:50 PM", presence: "8h 15m", break: "30m", work: "7h 45m", note: "Completed", split: false }
  ],
  "neha@pmp.test": [
    { date: "28 Aug 2026", login: "09:45 AM", logout: "06:20 PM", presence: "8h 35m", break: "35m", work: "8h", note: "Completed", split: false },
    { date: "26 Aug 2026", login: "01:00 PM", logout: "08:00 PM", presence: "7h", break: "20m", work: "6h 40m", note: "Completed", split: false }
  ]
};

watchFirebaseUserProfile();
setupNavigation();
renderMembers();
renderReport();

byId("mobileMenu").addEventListener("click", () => setSidebar(true));
byId("sidebarClose").addEventListener("click", () => setSidebar(false));
sidebarScrim.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSidebar(false); });
memberSelect.addEventListener("change", renderReport);

document.querySelectorAll(".date-chips button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".date-chips button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    showToast(`${button.textContent} filter selected for design preview.`);
  });
});

byId("attendanceActions").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  showToast(`${button.textContent} action will connect during integration.`);
});

function renderMembers() {
  memberSelect.replaceChildren(...members.map((member) => {
    const option = document.createElement("option");
    option.value = member.email;
    option.textContent = member.name;
    return option;
  }));
  memberSelect.value = members.some((member) => member.email === signedInEmail) ? signedInEmail : members[0].email;
}

function renderReport() {
  const member = members.find((item) => item.email === memberSelect.value) || members[0];
  const isSelf = member.email === signedInEmail;
  byId("memberName").textContent = member.name;
  byId("memberInitials").textContent = initials(member.name);
  byId("memberAccess").textContent = isSelf ? "You can update your own attendance" : "View-only report";
  scopePill.textContent = isSelf ? "Self edit mode" : "View-only mode";
  byId("currentState").textContent = isSelf ? "Working" : "Report only";
  byId("currentTimer").textContent = isSelf ? "04h 20m" : "--";
  byId("stateHint").textContent = isSelf ? "Logged in today at 04:00 PM" : "Only this member can modify their own attendance";
  document.querySelectorAll("#attendanceActions button").forEach((button) => { button.disabled = !isSelf; });

  const rows = records[member.email] || [];
  reportRows.replaceChildren(...rows.map(recordRow));
  byId("footerCount").textContent = `Showing ${rows.length} attendance ${rows.length === 1 ? "record" : "records"} for ${member.name}`;
  byId("summaryDays").textContent = String(rows.length);
  const selfTotals = member.email === "saif@pmp.test";
  byId("summaryWork").textContent = selfTotals ? "18h 55m" : member.email === "aarav@pmp.test" ? "16h 15m" : "14h 40m";
  byId("summaryPresence").textContent = selfTotals ? "20h" : member.email === "aarav@pmp.test" ? "17h 30m" : "15h 35m";
  byId("summaryBreak").textContent = selfTotals ? "1h 05m" : member.email === "aarav@pmp.test" ? "1h 15m" : "55m";
}

function recordRow(record) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><strong>${record.date}</strong></td>
    <td>${record.login}</td>
    <td>${record.logout}</td>
    <td>${record.presence}</td>
    <td>${record.break}</td>
    <td><span class="work-value">${record.work}</span></td>
    <td><span class="note-pill ${record.split ? "split" : ""}">${record.note}</span></td>
  `;
  return row;
}

function setupNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      const routes = {
        Dashboard: "/dashboard",
        Projects: "/projects",
        Tasks: "/tasks",
        "Gantt Chart": "/gantt",
        Members: "/members",
        Reports: "/reports",
        Activity: "/activity",
        Settings: "/settings"
      };
      if (routes[button.dataset.screen]) window.location.href = routes[button.dataset.screen];
      else showToast(`${button.dataset.screen} is planned next.`);
    });
  });
}

function setSidebar(open) {
  sidebar.classList.toggle("open", open);
  sidebarScrim.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

function initials(name) {
  return String(name || "PMP").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
