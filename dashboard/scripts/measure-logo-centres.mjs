// Measures how far each team logo's visual weight sits from its horizontal centre and writes
// the shifts that centre it to lib/team-logo-centring.json.
//
// Basketball-Reference's era logos are crops whose bounding box is centred but whose artwork is
// not: the 2001-09 Raptors badge sits left of centre because the ball touches the left edge and
// the tail the right. Some current NBA.com marks lean too (the Magic's trailing stars). Behind a
// centred headshot that reads as off-centre, so the watermark behind player photos moves each
// such logo by the measured offset. Vertical offsets are left: the watermark sits above the
// middle on purpose, and top- or bottom-heavy marks (the Knicks ball) are part of the design.
//
// Usage: node scripts/measure-logo-centres.mjs  (rerun after adding logos to public/team-logos)
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "public/team-logos");
const out = path.join(root, "lib/team-logo-centring.json");
// Shifts under 3% of the logo's width are not visible behind a headshot.
const THRESHOLD = 0.03;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id=c></canvas>");
const shifts = {};
for (const file of fs.readdirSync(dir).sort()) {
  const type = file.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const src = `data:${type};base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}`;
  // The alpha-weighted centre of the logo drawn as the watermark draws it (contain in a square).
  const dx = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const size = 400, canvas = document.getElementById("c"); canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    const pixels = context.getImageData(0, 0, size, size).data;
    let mass = 0, moment = 0;
    for (let i = 3; i < pixels.length; i += 4) { const alpha = pixels[i] / 255; mass += alpha; moment += alpha * (((i - 3) / 4) % size); }
    return moment / mass / size - 0.5;
  }, src);
  if (Math.abs(dx) > THRESHOLD) shifts[file] = Number((-dx).toFixed(3));
}
await browser.close();
fs.writeFileSync(out, `${JSON.stringify(shifts, null, 2)}\n`);
console.log(`${Object.keys(shifts).length} logos shifted → ${path.relative(root, out)}`);
