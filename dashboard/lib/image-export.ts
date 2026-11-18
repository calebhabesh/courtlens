import { REST_SEAM_PATH } from "./ball-seams";
import { WORDMARK_HEIGHT, WORDMARK_PATH, WORDMARK_WIDTH } from "./courtlens-wordmark";

/**
 * Context-labelled image and canonical query URL export utility for CourtLens.
 *
 * Implements F46 Image sharing:
 * "Download a bounded image of a selected analytical view with title, units,
 * context and evidence identifier; optionally copy an equivalent local query URL.
 * Rendered snapshot is separate from analytical evidence. Use local SVG/canvas
 * or an allowlisted rendered-view capture, without fetching arbitrary URLs or
 * requiring AI-generated images."
 */

export interface AnalyticalContextMetadata {
  season?: string;
  phase?: string;
  before_date?: string;
  window?: string;
  release_id?: string;
  snapshot_id?: string;
}

export interface ImageExportOptions {
  title: string;
  subtitle?: string;
  context: AnalyticalContextMetadata;
  evidenceId?: string;
  filename: string;
  units?: string;
  /** Embed `<image>` elements (headshots) as data URLs first; a blob SVG cannot load them itself. */
  inlineImages?: boolean;
}

/** Resolve token-valued SVG attributes before detaching from the dashboard's CSS cascade. */
export function resolveSvgTokens(svgElement: SVGSVGElement): SVGSVGElement {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  const tokens = getComputedStyle(document.documentElement);
  const originals = [svgElement, ...svgElement.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  originals.forEach((original, index) => {
    const computed = getComputedStyle(original);
    for (const name of ["fill", "stroke", "stop-color", "color"]) {
      const value = original.getAttribute(name);
      if (!value?.includes("var(")) continue;
      const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, token: string) => computed.getPropertyValue(token).trim() || tokens.getPropertyValue(token).trim());
      if (resolved && !resolved.includes("var(")) copies[index].setAttribute(name, resolved);
    }
  });
  return clone;
}

/**
 * Cleanly format context metadata into a human-readable banner string.
 */
export function formatContextBanner(context: AnalyticalContextMetadata): string {
  const parts: string[] = [];
  if (context.season) parts.push(`Season: ${context.season}`);
  if (context.phase) parts.push(`Phase: ${context.phase.replaceAll("_", " ")}`);
  if (context.before_date) parts.push(`Cutoff: ${context.before_date}`);
  if (context.window) parts.push(`Window: ${context.window}`);
  if (context.release_id) {
    const shortRel = context.release_id.length > 12 ? `${context.release_id.slice(0, 12)}…` : context.release_id;
    parts.push(`Release: ${shortRel}`);
  } else if (context.snapshot_id) {
    parts.push(`Snapshot: ${context.snapshot_id}`);
  }
  return parts.join(" · ");
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    // no-store: the on-screen <image> already cached this URL from a no-CORS load; reusing that
    // entry fails the CORS check, so the export would silently lose the headshot.
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Clone an SVG with every <image> inlined as a data URL. An SVG rendered through <img> (PNG
 * export) or opened as a file cannot load external images, so a headshot or logo would vanish.
 * Only the card's own images (portrait endpoint, local logo assets) are fetched; an image that
 * fails to load is removed rather than exported as a broken link.
 */
export async function inlineSvgImages(svgElement: SVGSVGElement): Promise<SVGSVGElement> {
  const clone = resolveSvgTokens(svgElement);
  const images = Array.from(clone.querySelectorAll("image"));
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
    if (!href || href.startsWith("data:")) return;
    const absolute = new URL(href, window.location.href).toString();
    const data = await toDataUrl(absolute);
    if (data) image.setAttribute("href", data);
    else image.remove();
  }));
  return clone;
}

/**
 * Export an SVG DOM element as a context-stamped PNG image using HTML5 Canvas.
 * No external network requests or AI generation.
 */
export async function exportSvgAsPng(
  svgElement: SVGSVGElement,
  options: ImageExportOptions
): Promise<void> {
  const { title, subtitle, context, evidenceId, filename, units, inlineImages = false } = options;

  // Determine SVG dimensions
  const svgRect = svgElement.getBoundingClientRect();
  const rawWidth = Math.max(svgRect.width, svgElement.viewBox.baseVal.width || 800);
  const rawHeight = Math.max(svgRect.height, svgElement.viewBox.baseVal.height || 500);

  // Set up canvas dimensions with padding for CourtLens branded header and footer
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 2) : 2;
  const headerHeight = 90;
  // A narrow export (the 560px compare card) puts the notice on its own line above the evidence.
  const narrow = rawWidth + 48 < 720;
  const footerHeight = narrow ? 58 : 44;
  const paddingX = 24;

  const totalWidth = Math.round(rawWidth + paddingX * 2);
  const totalHeight = Math.round(rawHeight + headerHeight + footerHeight);

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth * dpr;
  canvas.height = totalHeight * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create 2D canvas context for image export");
  }

  // Scale for high DPI
  ctx.scale(dpr, dpr);

  // 1. Draw theme background (#20252e)
  ctx.fillStyle = "#20252e";
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 2. Draw branded header: the logo beside the wordmark, as on the page cards.
  const markSize = 28; // 2:1 to the 14px wordmark, as in the site header
  drawBrandMark(ctx, paddingX, 9, markSize);
  const wordmarkX = paddingX + markSize + 8;
  ctx.fillStyle = "#ffd166"; // CourtLens Accent
  ctx.save();
  ctx.translate(wordmarkX, 16);
  ctx.scale(14 / WORDMARK_HEIGHT, 14 / WORDMARK_HEIGHT);
  ctx.fill(new Path2D(WORDMARK_PATH));
  ctx.restore();

  ctx.fillStyle = "#b4bdca"; // Muted text
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("NBA Analytics · Reconstructed Prior Facts", wordmarkX + 14 * WORDMARK_WIDTH / WORDMARK_HEIGHT + 14, 30);

  // Main title
  ctx.fillStyle = "#f1f3f6"; // Primary text
  ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const displayTitle = units ? `${title} (${units})` : title;
  ctx.fillText(displayTitle, paddingX, 56);

  // Subtitle / Context line
  ctx.fillStyle = "#b4bdca";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const contextText = subtitle ? `${subtitle} · ${formatContextBanner(context)}` : formatContextBanner(context);
  ctx.fillText(contextText, paddingX, 76);

  // Header separator line
  ctx.strokeStyle = "#323b49";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(paddingX, headerHeight - 6);
  ctx.lineTo(totalWidth - paddingX, headerHeight - 6);
  ctx.stroke();

  // 3. Render SVG onto canvas
  const svgXml = new XMLSerializer().serializeToString(inlineImages ? await inlineSvgImages(svgElement) : resolveSvgTokens(svgElement));
  const svgBlob = new Blob([svgXml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, paddingX, headerHeight, rawWidth, rawHeight);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to render SVG onto export canvas"));
    };
    img.src = url;
  });

  // 4. Draw branded footer with evidence identifier and temporal discipline rule
  const footerY = totalHeight - 16;
  ctx.strokeStyle = "#323b49";
  ctx.beginPath();
  ctx.moveTo(paddingX, totalHeight - footerHeight + 6);
  ctx.lineTo(totalWidth - paddingX, totalHeight - footerHeight + 6);
  ctx.stroke();

  ctx.fillStyle = "#7b8798";
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace";
  const evidenceLabel = evidenceId
    ? `Evidence ID: ${evidenceId.slice(0, 16)}…`
    : `Temporal Constraint: game_date < ${context.before_date || "cutoff"}`;
  ctx.fillText(evidenceLabel, paddingX, footerY);

  const notice = "Strictly Historical · Zero Inferred Claims · No Forced Winner";
  const noticeWidth = ctx.measureText(notice).width;
  ctx.fillText(notice, narrow ? paddingX : totalWidth - paddingX - noticeWidth, narrow ? footerY - 16 : footerY);

  // 5. Trigger download
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas toBlob failed"));
        return;
      }
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const cleanName = filename.endsWith(".png") ? filename : `${filename}.png`;
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      resolve();
    }, "image/png");
  });
}

/** BrandMark (components/brand-mark.tsx, unframed) drawn on a canvas: same 32x32 geometry and silver ring. */
function drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  const silver = ctx.createLinearGradient(5, 5, 29, 29);
  for (const [offset, color] of [[0, "#eef3f8"], [0.22, "#a1adbd"], [0.42, "#f8fbff"], [0.58, "#8795a8"], [0.78, "#d5dfe9"], [1, "#a3b0c2"]] as const) {
    silver.addColorStop(offset, color);
  }
  ctx.strokeStyle = silver;
  ctx.fillStyle = silver;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "butt";
  ctx.beginPath(); ctx.moveTo(20.5, 20.5); ctx.lineTo(27.4, 27.4); ctx.stroke();
  ctx.beginPath(); ctx.arc(27.4, 27.4, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b44d28";
  ctx.beginPath(); ctx.arc(14, 14, 8.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0c0d10";
  ctx.lineWidth = 1.2;
  ctx.stroke(new Path2D(REST_SEAM_PATH));
  ctx.strokeStyle = silver;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(14, 14, 9.2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * Export standalone SVG file with embedded CourtLens metadata comments.
 */
export function exportSvgFile(
  svgElement: SVGSVGElement,
  filename: string,
  options?: ImageExportOptions
): void {
  let svgXml = new XMLSerializer().serializeToString(resolveSvgTokens(svgElement));

  if (options) {
    const metaComment = `<!--
  CourtLens NBA Analytics Export
  Title: ${options.title}
  Context: ${formatContextBanner(options.context)}
  Evidence: ${options.evidenceId || "N/A"}
  Rule: Temporal Discipline (game_date < cutoff)
-->\n`;
    svgXml = metaComment + svgXml;
  }

  const blob = new Blob([svgXml], { type: "image/svg+xml;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  const cleanName = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Copy equivalent canonical query URL to clipboard with fallback.
 */
export async function copyCanonicalQueryUrl(
  path: string,
  params: Record<string, string | null | undefined>
): Promise<boolean> {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") {
      sp.set(key, value);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const queryString = sp.toString();
  const fullUrl = `${origin}${path}${queryString ? `?${queryString}` : ""}`;

  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(fullUrl);
      return true;
    } catch {
      // Fallback
    }
  }

  // Fallback using textarea
  if (typeof document !== "undefined") {
    const textArea = document.createElement("textarea");
    textArea.value = fullUrl;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }

  return false;
}
