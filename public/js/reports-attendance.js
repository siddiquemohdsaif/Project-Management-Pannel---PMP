import { getStoredUser, watchFirebaseUserProfile } from "./auth-ui.js?v=pmp-20260819-4";

const byId = (id) => document.getElementById(id);
const sidebar = byId("sidebar");
const sidebarScrim = byId("sidebarScrim");
const toast = byId("toast");
const memberSelect = byId("memberSelect");
const rangeSelect = byId("rangeSelect");
const customDates = byId("customDates");
const fromDate = byId("fromDate");
const toDate = byId("toDate");
const reportRows = byId("reportRows");
const scopePill = byId("scopePill");
const holidayCalendar = byId("holidayCalendar");
const holidayDays = byId("holidayDays");
const holidayMonthLabel = byId("holidayMonthLabel");
const signedInUser = getStoredUser();
const signedInEmail = String(signedInUser?.email || "saif@pmp.test").trim().toLowerCase();
const storageKey = "pmp-attendance-preview-v1";
let toastTimer;
let holidayMonth = new Date(`${todayKey().slice(0, 7)}-01T00:00:00+05:30`);
let isAttendanceLoading = true;

const fallbackMembers = [
  { name: "Saif Shaik", email: "saif@pmp.test", photoURL: "" },
  { name: "Aarav Khan", email: "aarav@pmp.test", photoURL: "" },
  { name: "Neha Sharma", email: "neha@pmp.test", photoURL: "" },
  { name: "Riya Mehta", email: "riya@pmp.test", photoURL: "" }
];

const defaultState = {
  companyHolidays: [],
  workingOverrides: [],
  remarks: {},
  sessions: {}
};

let state = structuredClone(defaultState);
let members = initialMembers();
state.companyHolidays = Array.isArray(state.companyHolidays) ? state.companyHolidays : [];
state.workingOverrides = Array.isArray(state.workingOverrides) ? state.workingOverrides : [];
state.remarks = state.remarks && typeof state.remarks === "object" ? state.remarks : {};
state.sessions = state.sessions && typeof state.sessions === "object" ? state.sessions : {};

watchFirebaseUserProfile();
setupNavigation();
renderMembers();
renderReport();
renderHolidayCalendar();
loadAttendanceData();

byId("mobileMenu").addEventListener("click", () => setSidebar(true));
byId("sidebarClose").addEventListener("click", () => setSidebar(false));
sidebarScrim.addEventListener("click", () => setSidebar(false));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setSidebar(false); });
document.addEventListener("click", (event) => {
  if (holidayCalendar.hidden) return;
  if (holidayCalendar.contains(event.target) || byId("holidayCalendarButton").contains(event.target)) return;
  holidayCalendar.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") holidayCalendar.hidden = true;
});
memberSelect.addEventListener("change", () => loadMemberAttendance(memberSelect.value));
rangeSelect.addEventListener("change", () => {
  customDates.hidden = rangeSelect.value !== "custom";
  renderReport();
});
[fromDate, toDate].forEach((input) => input.addEventListener("change", renderReport));

byId("holidayCalendarButton").addEventListener("click", () => {
  holidayCalendar.hidden = !holidayCalendar.hidden;
  positionHolidayCalendar();
  renderHolidayCalendar();
});

byId("previousHolidayMonth").addEventListener("click", () => {
  holidayMonth.setMonth(holidayMonth.getMonth() - 1);
  renderHolidayCalendar();
});

byId("nextHolidayMonth").addEventListener("click", () => {
  holidayMonth.setMonth(holidayMonth.getMonth() + 1);
  renderHolidayCalendar();
});

holidayDays.addEventListener("click", (event) => {
  const button = event.target.closest("[data-date]");
  if (!button) return;
  toggleHolidayDate(button.dataset.date);
});

byId("attendanceActions").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  runAttendanceAction(button.dataset.action);
});

byId("yesterdayRemark").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remark]");
  if (!button) return;
  const email = memberSelect.value;
  const yesterday = previousDate(todayKey());
  saveRemark(email, yesterday, button.dataset.remark);
});

async function loadAttendanceData() {
  try {
    const [membersResponse, holidaysResponse] = await Promise.all([
      freshFetch("/api/members"),
      freshFetch("/api/company-holidays")
    ]);
    const [membersResult, holidaysResult] = await Promise.all([
      readJson(membersResponse),
      readJson(holidaysResponse)
    ]);
    if (!membersResponse.ok) throw new Error(membersResult.error || "Members could not be loaded.");
    if (!holidaysResponse.ok) throw new Error(holidaysResult.error || "Company holidays could not be loaded.");

    members = normalizeMembers(membersResult.members);
    state = {
      companyHolidays: [],
      workingOverrides: [],
      remarks: {},
      sessions: {}
    };
    (holidaysResult.holidays || []).forEach((holiday) => {
      if (holiday.is_working_override) state.workingOverrides.push(holiday.date);
      else if (holiday.is_holiday) state.companyHolidays.push(holiday.date);
    });
    renderMembers(signedInEmail);
    renderReport();
    renderHolidayCalendar();
    await loadMemberAttendance(memberSelect.value);
  } catch (error) {
    isAttendanceLoading = false;
    renderReport();
    showToast(error.message || "Attendance setup could not be loaded.");
  }
}

async function loadMemberAttendance(email) {
  const memberEmail = String(email || signedInEmail).trim().toLowerCase();
  isAttendanceLoading = true;
  renderReport();
  try {
    const response = await freshFetch(`/api/attendance?member_email=${encodeURIComponent(memberEmail)}`);
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Attendance could not be loaded.");
    state.sessions[memberEmail] = sessionsByMember(result.sessions)[memberEmail] || [];
    state.remarks[memberEmail] = remarksByMember(result.remarks)[memberEmail] || {};
    isAttendanceLoading = false;
    renderReport();
  } catch (error) {
    isAttendanceLoading = false;
    renderReport();
    showToast(error.message || "Attendance could not be loaded.");
  }
}

async function runAttendanceAction(action) {
  const memberEmail = memberSelect.value;
  try {
    const response = await fetch("/api/attendance/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName(action), actor_email: signedInEmail, member_email: memberEmail })
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Attendance action failed.");
    await loadMemberAttendance(memberEmail);
    showToast(result.alreadyOpen ? "You are already logged in." : "Attendance updated.");
  } catch (error) {
    showToast(error.message || "Attendance action failed.");
  }
}

async function saveRemark(email, date, remark) {
  try {
    const response = await fetch("/api/attendance/remarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_email: signedInEmail, member_email: email, date, remark })
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Remark could not be saved.");
    state.remarks[email] = state.remarks[email] || {};
    state.remarks[email][date] = remark;
    saveState();
    renderReport();
    showToast(`Yesterday marked as ${remark}.`);
  } catch (error) {
    showToast(error.message || "Remark could not be saved.");
  }
}

function renderMembers(selectedEmail = signedInEmail) {
  memberSelect.replaceChildren(...members.map((member) => {
    const option = document.createElement("option");
    option.value = member.email;
    option.textContent = member.name;
    return option;
  }));
  memberSelect.value = members.some((member) => member.email === selectedEmail) ? selectedEmail : members[0].email;
}

function initialMembers() {
  const name = signedInUser?.name || signedInUser?.displayName || signedInEmail || "Signed in user";
  const photoURL = signedInUser?.photoURL || signedInUser?.photoUrl || "";
  return [{ name, email: signedInEmail, photoURL }];
}

function normalizeMembers(list) {
  const liveMembers = (Array.isArray(list) ? list : [])
    .map((member) => ({
      name: member.name || member.displayName || member.email || "Unnamed user",
      email: String(member.email || "").trim().toLowerCase(),
      photoURL: member.photoURL || member.photoUrl || member.profile_url || member.photo_url || member.avatarUrl || ""
    }))
    .filter((member) => member.email);
  if (!liveMembers.some((member) => member.email === signedInEmail)) {
    liveMembers.push({
      name: signedInUser?.name || signedInUser?.displayName || signedInEmail,
      email: signedInEmail,
      photoURL: signedInUser?.photoURL || signedInUser?.photoUrl || ""
    });
  }
  return liveMembers.length ? liveMembers.sort((left, right) => left.name.localeCompare(right.name)) : [...fallbackMembers];
}

function sessionsByMember(list) {
  return (Array.isArray(list) ? list : []).reduce((result, session) => {
    const email = String(session.member_email || "").trim().toLowerCase();
    if (!email) return result;
    result[email] = result[email] || [];
    result[email].push({
      id: session.id,
      login_at: session.login_at,
      logout_at: session.logout_at,
      breaks: Array.isArray(session.breaks) ? session.breaks : []
    });
    return result;
  }, {});
}

function remarksByMember(list) {
  return (Array.isArray(list) ? list : []).reduce((result, remark) => {
    const email = String(remark.member_email || "").trim().toLowerCase();
    if (!email || !remark.date) return result;
    result[email] = result[email] || {};
    result[email][remark.date] = remark.remark;
    return result;
  }, {});
}

function renderReport() {
  const member = members.find((item) => item.email === memberSelect.value) || members[0];
  const isSelf = member.email === signedInEmail;
  const rows = buildRows(member.email, selectedRange()).sort((left, right) => right.date.localeCompare(left.date));
  const totals = rows.reduce((result, row) => {
    result.work += row.workMinutes;
    result.overtime += row.overtimeMinutes;
    if (row.countable) result.countableDays += 1;
    return result;
  }, { work: 0, overtime: 0, countableDays: 0 });

  byId("memberName").textContent = member.name;
  renderMemberIcon(byId("memberInitials"), member);
  byId("memberAccess").textContent = isSelf ? "You can update your own attendance" : "View-only report";
  scopePill.textContent = isSelf ? "Self edit mode" : "View-only mode";
  const openSession = currentOpenSession(member.email);
  const runningBreak = openSession?.breaks?.some((item) => item.start_at && !item.end_at);
  byId("currentState").textContent = isAttendanceLoading ? "Loading" : !isSelf ? "Report only" : runningBreak ? "On Break" : openSession ? "Working" : "Not logged in";
  byId("currentTimer").textContent = isAttendanceLoading ? "--" : openSession ? formatMinutes(Math.max(0, Math.round((new Date() - new Date(openSession.login_at || openSession.in)) / 60000))) : "--";
  byId("stateHint").textContent = !isSelf
    ? "Only this member can modify their own attendance"
    : isAttendanceLoading ? "Fetching your latest attendance"
      : openSession ? `Logged in at ${formatTime(new Date(openSession.login_at || openSession.in))}` : "Multiple login and logout sessions allowed";
  document.querySelectorAll("#attendanceActions button").forEach((button) => {
    const action = button.dataset.action;
    button.disabled = isAttendanceLoading
      || !isSelf
      || (action === "login" && Boolean(openSession))
      || (action === "start-break" && (!openSession || runningBreak))
      || (action === "end-break" && (!openSession || !runningBreak))
      || (action === "logout" && !openSession);
  });

  const yesterday = previousDate(todayKey());
  const needsRemark = isSelf && !hasWorked(member.email, yesterday) && !state.remarks[member.email]?.[yesterday] && !isExcludedHoliday(yesterday);
  byId("yesterdayRemark").hidden = !needsRemark;

  if (isAttendanceLoading) {
    reportRows.innerHTML = `<tr><td colspan="8" class="attendance-loading-row">Loading attendance...</td></tr>`;
    byId("footerCount").textContent = `Loading attendance for ${member.name}`;
    byId("summaryWork").textContent = "--";
    byId("summaryOvertime").textContent = "--";
    byId("summaryDays").textContent = "--";
    byId("summaryAverage").textContent = "--";
    return;
  }

  reportRows.replaceChildren(...rows.map(recordRow));
  byId("footerCount").textContent = `Showing ${rows.length} attendance ${rows.length === 1 ? "record" : "records"} for ${member.name}`;
  byId("summaryWork").textContent = formatMinutes(totals.work);
  byId("summaryOvertime").textContent = formatMinutes(totals.overtime);
  byId("summaryDays").textContent = String(totals.countableDays);
  byId("summaryAverage").textContent = totals.countableDays ? formatMinutes(Math.round(totals.work / totals.countableDays)) : "0h";
}

function buildRows(email, range) {
  return enumerateDays(range.from, range.to)
    .map((date) => dayReport(email, date))
    .filter((row) => row.workMinutes || row.remark || row.isHoliday || row.isSunday || row.dayType === "Absent");
}

function renderHolidayCalendar() {
  positionHolidayCalendar();
  const year = holidayMonth.getFullYear();
  const month = holidayMonth.getMonth();
  holidayMonthLabel.textContent = holidayMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const first = new Date(year, month, 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const buttons = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = dateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "holiday-day";
    button.dataset.date = key;
    button.textContent = String(date.getDate());
    button.title = holidayTitle(key);
    if (date.getMonth() !== month) button.classList.add("muted");
    if (isHolidayDate(key)) button.classList.add("holiday");
    if (state.workingOverrides.includes(key)) button.classList.add("working");
    if (key === todayKey()) button.classList.add("today");
    return button;
  });
  holidayDays.replaceChildren(...buttons);
}

function positionHolidayCalendar() {
  if (holidayCalendar.hidden) return;
  const button = byId("holidayCalendarButton");
  const page = document.querySelector(".reports-page");
  const buttonRect = button.getBoundingClientRect();
  const pageRect = page.getBoundingClientRect();
  const left = Math.max(0, Math.min(buttonRect.left - pageRect.left, pageRect.width - 286));
  holidayCalendar.style.top = `${buttonRect.bottom - pageRect.top + 8}px`;
  holidayCalendar.style.left = `${left}px`;
}

async function toggleHolidayDate(date) {
  let payload;
  if (isSunday(date)) {
    toggleListValue(state.workingOverrides, date);
    removeListValue(state.companyHolidays, date);
    payload = {
      actor_email: signedInEmail,
      date,
      is_holiday: false,
      is_working_override: state.workingOverrides.includes(date)
    };
    showToast(state.workingOverrides.includes(date)
      ? `${formatDateLabel(date)} changed to working day.`
      : `${formatDateLabel(date)} changed back to Sunday holiday.`);
  } else {
    toggleListValue(state.companyHolidays, date);
    removeListValue(state.workingOverrides, date);
    payload = {
      actor_email: signedInEmail,
      date,
      is_holiday: state.companyHolidays.includes(date),
      is_working_override: false
    };
    showToast(state.companyHolidays.includes(date)
      ? `${formatDateLabel(date)} marked as company holiday.`
      : `${formatDateLabel(date)} changed to working day.`);
  }
  saveState();
  renderHolidayCalendar();
  renderReport();
  try {
    const response = await fetch("/api/company-holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Company holiday could not be saved.");
  } catch (error) {
    showToast(error.message || "Company holiday could not be saved.");
    await loadAttendanceData();
  }
}

function dayReport(email, date) {
  const segments = sessionSegments(email, date);
  const workedOnExcludedDay = segments.workMinutes > 0 && isExcludedHoliday(date);
  const remark = state.remarks[email]?.[date] || "";
  const dayType = segments.workMinutes
    ? workedOnExcludedDay ? "Overtime" : "Worked"
    : remark || (state.companyHolidays.includes(date) ? "Company Holiday" : isSunday(date) ? "Weekly Off" : "Absent");
  const countable = dayType === "Worked" || dayType === "Absent";
  return {
    date,
    login: segments.login,
    logout: segments.logout,
    sessions: segments.sessionCount,
    dayType,
    breakMinutes: segments.breakMinutes,
    workMinutes: segments.workMinutes,
    overtimeMinutes: workedOnExcludedDay ? segments.workMinutes : 0,
    countable,
    remark,
    isHoliday: state.companyHolidays.includes(date),
    isSunday: isSunday(date)
  };
}

function sessionSegments(email, date) {
  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const parts = [];
  let workMinutes = 0;
  let breakMinutes = 0;

  (state.sessions[email] || []).forEach((session) => {
    const start = new Date(session.in || session.login_at);
    const end = new Date(session.out || session.logout_at || new Date());
    const segmentStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
    const segmentEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));
    const minutes = Math.max(0, Math.round((segmentEnd - segmentStart) / 60000));
    if (!minutes) return;
    const segmentBreak = Array.isArray(session.breaks)
      ? session.breaks.reduce((total, item) => total + overlapMinutes(item.start_at, item.end_at || new Date(), segmentStart, segmentEnd), 0)
      : Math.round((Number(session.breakMinutes || 0) * minutes) / Math.max(1, Math.round((end - start) / 60000)));
    parts.push({ start: segmentStart, end: segmentEnd });
    breakMinutes += segmentBreak;
    workMinutes += Math.max(0, minutes - segmentBreak);
  });

  parts.sort((left, right) => left.start - right.start);
  return {
    login: parts[0] ? formatTime(parts[0].start) : "--",
    logout: parts.at(-1) ? formatTime(parts.at(-1).end) : "--",
    sessionCount: parts.length,
    breakMinutes,
    workMinutes
  };
}

function recordRow(record) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><strong>${formatDateLabel(record.date)}</strong></td>
    <td>${record.login}</td>
    <td>${record.logout}</td>
    <td>${record.sessions || "--"}</td>
    <td><span class="note-pill ${record.overtimeMinutes ? "holiday" : ""}">${record.dayType}</span></td>
    <td>${formatMinutes(record.breakMinutes)}</td>
    <td><span class="work-value">${formatMinutes(record.workMinutes)}</span></td>
    <td><span class="overtime-value">${formatMinutes(record.overtimeMinutes)}</span></td>
  `;
  return row;
}

function selectedRange() {
  const today = todayKey();
  if (rangeSelect.value === "today") return { from: today, to: today };
  if (rangeSelect.value === "yesterday") {
    const yesterday = previousDate(today);
    return { from: yesterday, to: yesterday };
  }
  if (rangeSelect.value === "week") return { from: weekStart(today), to: today };
  if (rangeSelect.value === "7") return { from: addDays(today, -6), to: today };
  if (rangeSelect.value === "custom") return { from: fromDate.value, to: toDate.value };
  return { from: today.slice(0, 8) + "01", to: today };
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
        Attendance: "/attendance",
        Reports: "/attendance",
        Activity: "/activity",
        Settings: "/settings"
      };
      if (routes[button.dataset.screen]) window.location.href = routes[button.dataset.screen];
      else showToast(`${button.dataset.screen} is planned next.`);
    });
  });
}

function hasWorked(email, date) {
  return sessionSegments(email, date).workMinutes > 0;
}

function currentOpenSession(email) {
  return (state.sessions[email] || [])
    .filter((session) => (session.login_at || session.in) && !(session.logout_at || session.out))
    .sort((left, right) => Date.parse(right.login_at || right.in) - Date.parse(left.login_at || left.in))[0];
}

function isExcludedHoliday(date) {
  return isHolidayDate(date);
}

function isHolidayDate(date) {
  if (state.workingOverrides.includes(date)) return false;
  return state.companyHolidays.includes(date) || isSunday(date);
}

function isSunday(date) {
  return new Date(`${date}T00:00:00+05:30`).getDay() === 0;
}

function enumerateDays(from, to) {
  const days = [];
  let cursor = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T00:00:00+05:30`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return days;
  while (cursor <= end) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDate(date) {
  return addDays(date, -1);
}

function weekStart(date) {
  const start = new Date(`${date}T00:00:00+05:30`);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  return dateKey(start);
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00+05:30`);
  next.setDate(next.getDate() + days);
  return dateKey(next);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).replace(",", "");
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(minutes) {
  if (!minutes) return "0h";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function overlapMinutes(startValue, endValue, windowStart, windowEnd) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const clippedStart = Math.max(start.getTime(), windowStart.getTime());
  const clippedEnd = Math.min(end.getTime(), windowEnd.getTime());
  return Math.max(0, Math.round((clippedEnd - clippedStart) / 60000));
}

function actionName(action) {
  return {
    login: "login",
    "start-break": "start_break",
    "end-break": "end_break",
    logout: "logout"
  }[action] || action;
}

function freshFetch(url) {
  const separator = url.includes("?") ? "&" : "?";
  return fetch(`${url}${separator}_=${Date.now()}`, { cache: "no-store" });
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

function renderMemberIcon(node, member) {
  const photoURL = String(member?.photoURL || "").trim();
  const label = member?.name || member?.email || "Member";
  node.classList.remove("has-profile-image");
  node.replaceChildren();
  node.textContent = initials(label);
  node.setAttribute("aria-label", label);
  if (!photoURL) return;
  const image = document.createElement("img");
  image.src = photoURL;
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  node.replaceChildren(image);
  node.classList.add("has-profile-image");
}

function initials(name) {
  return String(name || "PMP").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function toggleListValue(list, value) {
  if (list.includes(value)) removeListValue(list, value);
  else list.push(value);
}

function removeListValue(list, value) {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
}

function holidayTitle(date) {
  if (state.workingOverrides.includes(date)) return `${formatDateLabel(date)}: working day`;
  if (state.companyHolidays.includes(date)) return `${formatDateLabel(date)}: company holiday`;
  if (isSunday(date)) return `${formatDateLabel(date)}: Sunday holiday`;
  return `${formatDateLabel(date)}: working day`;
}
