import { writeFileSync } from "node:fs";

const settings = {
  tileSize: 1152,
  markCount: 100,
  minimumSpacing: 72,
  markSize: 18,
  strokeWidth: 1.5,
  opacity: 0.07,
  color: "#b4c2dc",
  seed: 0xc0471e,
};

let seed = settings.seed;
function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}

function distanceSquared(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.min(dx, settings.tileSize - dx) ** 2
    + Math.min(dy, settings.tileSize - dy) ** 2;
}

const marks = [];
const margin = settings.markSize * 0.75;
for (let attempt = 0; marks.length < settings.markCount && attempt < 100000; attempt += 1) {
  const point = {
    x: Number((margin + random() * (settings.tileSize - margin * 2)).toFixed(2)),
    y: Number((margin + random() * (settings.tileSize - margin * 2)).toFixed(2)),
    angle: Number((random() * 30 - 15).toFixed(2)),
  };
  if (marks.every(mark => distanceSquared(mark, point) >= settings.minimumSpacing ** 2)) {
    marks.push(point);
  }
}
if (marks.length !== settings.markCount) {
  throw new Error("Cannot fit the requested marks; reduce markCount or minimumSpacing.");
}

const radius = settings.markSize / 2;
const cross = radius - 1;
const shapes = marks.map((mark, index) => index % 2
  ? `    <circle cx="${mark.x}" cy="${mark.y}" r="${radius}"/>`
  : `    <path transform="translate(${mark.x} ${mark.y}) rotate(${mark.angle})" d="M-${cross} -${cross} ${cross} ${cross}M${cross} -${cross} -${cross} ${cross}"/>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.tileSize}" height="${settings.tileSize}" viewBox="0 0 ${settings.tileSize} ${settings.tileSize}">
  <g fill="none" stroke="${settings.color}" stroke-opacity="${settings.opacity}" stroke-width="${settings.strokeWidth}" stroke-linecap="round">
${shapes.join("\n")}
  </g>
</svg>
`;
writeFileSync(new URL("../public/patterns/coach-marks.svg", import.meta.url), svg);
process.stdout.write(`Generated ${marks.length} scattered marks on a ${settings.tileSize}px tile.\n`);
