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
  const clone = svgElement.cloneNode(true) as SVGSVGElement;
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
  const { title, subtitle, context, evidenceId, filename, units } = options;

  // Determine SVG dimensions
  const svgRect = svgElement.getBoundingClientRect();
  const rawWidth = Math.max(svgRect.width, svgElement.viewBox.baseVal.width || 800);
  const rawHeight = Math.max(svgRect.height, svgElement.viewBox.baseVal.height || 500);

  // Set up canvas dimensions with padding for CourtLens branded header and footer
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 2) : 2;
  const headerHeight = 90;
  const footerHeight = 44;
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

  // 2. Draw branded header
  ctx.fillStyle = "#ffd166"; // CourtLens Accent
  ctx.save();
  ctx.translate(paddingX, 16);
  ctx.scale(14 / WORDMARK_HEIGHT, 14 / WORDMARK_HEIGHT);
  ctx.fill(new Path2D(WORDMARK_PATH));
  ctx.restore();

  ctx.fillStyle = "#b4bdca"; // Muted text
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("NBA Analytics · Reconstructed Prior Facts", paddingX + 14 * WORDMARK_WIDTH / WORDMARK_HEIGHT + 14, 30);

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
  const svgXml = new XMLSerializer().serializeToString(svgElement);
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
  ctx.fillText(notice, totalWidth - paddingX - noticeWidth, footerY);

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

/**
 * Export standalone SVG file with embedded CourtLens metadata comments.
 */
export function exportSvgFile(
  svgElement: SVGSVGElement,
  filename: string,
  options?: ImageExportOptions
): void {
  let svgXml = new XMLSerializer().serializeToString(svgElement);

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
