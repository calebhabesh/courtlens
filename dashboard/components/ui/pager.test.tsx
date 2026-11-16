// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { pagerItems } from "@/lib/pager";
import { Pager } from "./pager";

afterEach(cleanup);

describe("pagerItems", () => {
  it("lists every page up to seven", () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the ends and the current page's neighbours, with gaps", () => {
    expect(pagerItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
  });

  it("widens the run near either end so the row keeps one width", () => {
    expect(pagerItems(1, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    expect(pagerItems(4, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
    expect(pagerItems(9, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
    expect(pagerItems(12, 12)).toEqual([1, "gap", 8, 9, 10, 11, 12]);
  });
});

describe("Pager", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pager label="Pages" page={1} pageCount={1} onPage={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("marks the current page and jumps to first, previous, a number, next and last", () => {
    const onPage = vi.fn();
    render(<Pager label="Pages" page={6} pageCount={12} onPage={onPage} />);
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Page 6 of 12" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous page ([)" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 7 of 12" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page (])" }));
    fireEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(onPage.mock.calls.map(call => call[0])).toEqual([1, 5, 7, 7, 12]);
  });

  it("disables the backward buttons on the first page and the forward ones on the last", () => {
    const { rerender } = render(<Pager label="Pages" page={1} pageCount={3} onPage={() => {}} />);
    expect(screen.getByRole("button", { name: "First page" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Next page (])" }).hasAttribute("disabled")).toBe(false);
    rerender(<Pager label="Pages" page={3} pageCount={3} onPage={() => {}} />);
    expect(screen.getByRole("button", { name: "Last page" }).hasAttribute("disabled")).toBe(true);
  });
});
