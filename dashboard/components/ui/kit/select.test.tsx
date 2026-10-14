// @vitest-environment happy-dom
import { createRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Select } from "./select";

afterEach(cleanup);

it("retains native selection and form submission while hiding the decorative chevron", () => {
  const change = vi.fn();
  const ref = createRef<HTMLSelectElement>();
  function Form() {
    const [value, setValue] = useState("regular");
    return <form aria-label="Scope"><Select ref={ref} name="phase" aria-label="Phase" value={value} onChange={event => { setValue(event.target.value); change(event.target.value); }}><option value="regular">Regular</option><option value="playoffs">Playoffs</option></Select></form>;
  }
  render(<Form />);
  fireEvent.change(screen.getByRole("combobox", { name: "Phase" }), { target: { value: "playoffs" } });
  expect(change).toHaveBeenCalledWith("playoffs");
  expect(ref.current?.value).toBe("playoffs");
  const form = screen.getByRole("form", { name: "Scope" });
  if (!(form instanceof HTMLFormElement)) throw new Error("Expected a form");
  expect(new FormData(form).get("phase")).toBe("playoffs");
  expect(form.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
});

it("exposes invalid and disabled states", () => {
  render(<form aria-label="Scope"><Select name="phase" aria-label="Phase" invalid disabled><option>Regular</option></Select></form>);
  const select = screen.getByRole("combobox", { name: "Phase" });
  expect(select.getAttribute("aria-invalid")).toBe("true");
  expect(select.hasAttribute("disabled")).toBe(true);
});
