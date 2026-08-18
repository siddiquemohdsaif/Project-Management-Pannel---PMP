import { readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/dashboard.html",
  "public/gantt.html",
  "public/projects.html",
  "public/tasks.html",
  "public/activity.html",
  "public/members.html",
  "public/settings.html",
  "public/css/index.css",
  "public/css/styles.css",
  "public/css/gantt.css",
  "public/css/projects.css",
  "public/css/tasks.css",
  "public/css/activity.css",
  "public/css/members.css",
  "public/css/settings.css",
  "public/js/dashboard.js",
  "public/js/auth-ui.js",
  "public/js/firebase-config.js",
  "public/js/index.js",
  "public/js/gantt.js",
  "public/js/projects.js",
  "public/js/tasks.js",
  "public/js/activity.js",
  "public/js/members.js",
  "public/js/settings.js"
];

for (const file of requiredFiles) {
  const content = await readFile(file, "utf8");
  if (!content.trim()) throw new Error(`${file} is empty`);
}

const html = await readFile("public/dashboard.html", "utf8");
for (const reference of ["./css/styles.css", "./js/dashboard.js", "progressChart"]) {
  if (!html.includes(reference)) throw new Error(`dashboard.html is missing ${reference}`);
}

console.log("Dashboard mock validated successfully.");

const loginHtml = await readFile("public/index.html", "utf8");
for (const reference of ["./css/index.css", "./js/index.js", "Sign in with Google", "loginStatus"]) {
  if (!loginHtml.includes(reference)) throw new Error(`index.html is missing ${reference}`);
}
