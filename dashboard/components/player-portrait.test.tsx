// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlayerPortrait } from "./player-portrait";

// The server HTML is what the browser's preload scanner and lazy loading act on. (happy-dom
// never loads an image, so a mounted portrait switches to its initials fallback.)
function img(markup: string): HTMLImageElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.querySelector("img")!;
}

it("is lazy with its box's width and height at every size unless it is the page's hero (SP06)", () => {
  for (const [size, box] of [["sm", 30], ["md", 48], ["lg", 80], ["xl", 144]] as const) {
    const image = img(renderToStaticMarkup(<PlayerPortrait playerId="2544" name="LeBron James" size={size} />));
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("fetchpriority")).toBeNull();
    expect([image.getAttribute("width"), image.getAttribute("height")]).toEqual([String(box), String(box)]);
  }
  const hero = img(renderToStaticMarkup(<PlayerPortrait playerId="2544" name="LeBron James" size="xl" priority />));
  expect(hero.getAttribute("loading")).toBe("eager");
  expect(hero.getAttribute("fetchpriority")).toBe("high");
  // srcset candidates and sizes are unchanged; only the path gained `.webp`.
  expect(hero.getAttribute("sizes")).toBe("144px");
  expect(hero.getAttribute("srcset")?.split(", ").map(entry => entry.split(" ")[1])).toEqual(["64w", "96w", "128w", "192w", "288w"]);
});
