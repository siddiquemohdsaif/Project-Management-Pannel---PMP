import { readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/gantt.html",
  "public/css/styles.css",
  "public/css/gantt.css",
  "public/js/dashboard.js",
  "public/js/gantt.js"
];

for (const file of requiredFiles) {
  const content = await readFile(file, "utf8");
  if (!content.trim()) throw new Error(`${file} is empty`);
}

const html = await readFile("public/index.html", "utf8");
for (const reference of ["./css/styles.css", "./js/dashboard.js", "progressChart"]) {
  if (!html.includes(reference)) throw new Error(`index.html is missing ${reference}`);
}

console.log("Dashboard mock validated successfully.");
