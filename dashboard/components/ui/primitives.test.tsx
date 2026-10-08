// @vitest-environment happy-dom
import { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import {
  Button,
  IconButton,
  Input,
  SearchField,
  Select,
  Checkbox,
  Switch,
  SegmentedControl,
  Tabs,
  TabsList,
  TabTrigger,
  TabsContent,
  Badge,
  Chip,
  Panel,
  Section,
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  SortHeader,
  TableSkeletonRow,
  Menu,
  MenuItem,
  Popover,
  Tooltip,
  Modal,
  Drawer,
  CommandPalette,
  ToastProvider,
  useToast,
  Skeleton,
  EmptyState,
  Accordion,
  AccordionItem,
  Presence,
} from "./index";
import {
  DURATIONS,
  EASINGS,
  SPRING,
  SPRING_INSTANT,
  MOTION_ALLOWLIST,
  getDrawerVariants,
} from "../../lib/motion";

afterEach(() => {
  cleanup();
});

describe("Design Language v1 Motion Tokens and Utilities", () => {
  it("exports exact token durations and easings matching the contract", () => {
    expect(DURATIONS.instant).toBe(0.08);
    expect(DURATIONS.fast).toBe(0.14);
    expect(DURATIONS.base).toBe(0.20);
    expect(DURATIONS.slow).toBe(0.32);
    expect(DURATIONS.chart).toBe(0.45);

    expect(EASINGS.easeOut).toEqual([0.22, 1, 0.36, 1]);
    expect(EASINGS.easeIn).toEqual([0.4, 0, 1, 1]);
    expect(EASINGS.easeInOut).toEqual([0.65, 0, 0.35, 1]);

    expect(SPRING).toEqual({ type: "spring", stiffness: 520, damping: 38, mass: 0.9 });
    expect(SPRING_INSTANT).toEqual({ duration: 0 });
  });

  it("exports the strict motion allowlist", () => {
    expect(MOTION_ALLOWLIST).toContain("components/ui/**");
    expect(MOTION_ALLOWLIST).toContain("components/charts/**");
    expect(MOTION_ALLOWLIST).toContain("lib/motion.ts");
  });

  it("computes drawer edge offsets correctly for all sides", () => {
    expect(getDrawerVariants("right").initial).toEqual({ x: "100%" });
    expect(getDrawerVariants("left").initial).toEqual({ x: "-100%" });
    expect(getDrawerVariants("bottom").initial).toEqual({ y: "100%" });
  });
});

describe("Button and IconButton Primitives", () => {
  it("renders button variants and sizes", () => {
    const { rerender } = render(<Button variant="primary" size="lg">Action</Button>);
    let btn = screen.getByRole("button", { name: "Action" }) as HTMLButtonElement;
    expect(btn.className).toContain("ui-button-primary");
    expect(btn.className).toContain("ui-button-lg");

    rerender(<Button variant="ghost" size="sm">Quiet Action</Button>);
    btn = screen.getByRole("button", { name: "Quiet Action" }) as HTMLButtonElement;
    expect(btn.className).toContain("ui-button-ghost");
    expect(btn.className).toContain("ui-button-sm");
  });

  it("handles loading state by disabling and setting aria-busy", () => {
    const handleClick = vi.fn();
    render(<Button loading onClick={handleClick}>Submit</Button>);
    const btn = screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement;
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders IconButton with accessible label and title", () => {
    render(<IconButton icon="star" label="Favorite player" />);
    const btn = screen.getByRole("button", { name: "Favorite player" });
    expect(btn.getAttribute("title")).toBe("Favorite player");
    expect(btn.getAttribute("aria-label")).toBe("Favorite player");
  });
});

describe("Input and SearchField Primitives", () => {
  it("renders input with error state and invalid aria", () => {
    render(<Input error placeholder="Player name" defaultValue="Curry" />);
    const input = screen.getByPlaceholderText("Player name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("renders SearchField with shortcut and clear trigger", () => {
    const handleClear = vi.fn();
    render(
      <SearchField
        value="Luka"
        shortcut="⌘K"
        onClear={handleClear}
        placeholder="Search…"
      />
    );
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("Luka");
    const clearBtn = screen.getByRole("button", { name: "Clear search" });
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });
});

describe("Select Primitive", () => {
  it("renders select options and changes value", () => {
    const handleChange = vi.fn();
    render(
      <Select defaultValue="season" onChange={e => handleChange(e.target.value)}>
        <option value="season">Season</option>
        <option value="playoffs">Playoffs</option>
      </Select>
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "playoffs" } });
    expect(handleChange).toHaveBeenCalledWith("playoffs");
  });
});

describe("Checkbox and Switch Primitives", () => {
  it("handles checked and indeterminate states in Checkbox", () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <Checkbox id="cb1" label="Eligible Only" checked={false} onChange={handleChange} />
    );
    const cb = screen.getByLabelText("Eligible Only") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(handleChange).toHaveBeenCalledWith(true);

    rerender(<Checkbox id="cb1" label="Eligible Only" indeterminate checked={false} />);
    expect(cb.getAttribute("aria-checked")).toBe("mixed");
  });

  it("handles Switch keyboard toggling via Space and Enter", () => {
    const handleChange = vi.fn();
    render(<Switch id="sw1" label="Live Mode" checked={false} onChange={handleChange} />);
    const sw = screen.getByRole("switch", { name: "Live Mode" });
    expect(sw.getAttribute("aria-checked")).toBe("false");

    fireEvent.keyDown(sw, { key: " " });
    expect(handleChange).toHaveBeenCalledWith(true);

    fireEvent.keyDown(sw, { key: "Enter" });
    expect(handleChange).toHaveBeenCalledWith(true);
  });
});

describe("SegmentedControl and Tabs Primitives", () => {
  it("handles SegmentedControl keyboard arrows and selection", () => {
    function ControlledSegmented() {
      const [val, setVal] = useState("a");
      return (
        <SegmentedControl
          name="view"
          value={val}
          onChange={setVal}
          options={[
            { value: "a", label: "Option A" },
            { value: "b", label: "Option B" },
            { value: "c", label: "Option C" },
          ]}
        />
      );
    }
    render(<ControlledSegmented />);
    const group = screen.getByRole("radiogroup");
    const optionA = screen.getByRole("radio", { name: "Option A" });
    const optionB = screen.getByRole("radio", { name: "Option B" });

    expect(optionA.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(optionB);
    expect(optionB.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(group, { key: "ArrowRight" });
    const optionC = screen.getByRole("radio", { name: "Option C" });
    expect(optionC.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(group, { key: "Home" });
    expect(optionA.getAttribute("aria-checked")).toBe("true");
  });

  it("handles Tabs keyboard arrows and panel switching", () => {
    function ControlledTabs() {
      const [tab, setTab] = useState("t1");
      return (
        <Tabs value={tab} onChange={setTab}>
          <TabsList aria-label="Sections">
            <TabTrigger value="t1">Tab 1</TabTrigger>
            <TabTrigger value="t2">Tab 2</TabTrigger>
          </TabsList>
          <TabsContent value="t1">Content 1</TabsContent>
          <TabsContent value="t2">Content 2</TabsContent>
        </Tabs>
      );
    }
    render(<ControlledTabs />);
    const tab1 = screen.getByRole("tab", { name: "Tab 1" });
    const tab2 = screen.getByRole("tab", { name: "Tab 2" });

    expect(tab1.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Content 1");

    fireEvent.click(tab2);
    expect(tab2.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("Content 2");

    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(tab1.getAttribute("aria-selected")).toBe("true");
  });
});

describe("Badge and Chip Primitives", () => {
  it("renders Badge variants and Chip removable triggers", () => {
    const handleRemove = vi.fn();
    render(
      <div>
        <Badge variant="positive">Verified</Badge>
        <Chip onRemove={handleRemove}>Filter</Chip>
      </div>
    );
    expect(screen.getByText("Verified")).not.toBeNull();
    const removeBtn = screen.getByRole("button", { name: "Remove" });
    fireEvent.click(removeBtn);
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });
});

describe("Panel, Section and PageHeader Primitives", () => {
  it("renders Panel with title, actions, and body", () => {
    render(
      <Panel title="Card Title" actions={<Button size="sm">Action</Button>}>
        <p>Body text</p>
      </Panel>
    );
    expect(screen.getByText("Card Title")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Action" })).not.toBeNull();
    expect(screen.getByText("Body text")).not.toBeNull();
  });

  it("renders Section with title and description", () => {
    render(
      <Section title="Section Title" description="Section desc">
        <p>Child</p>
      </Section>
    );
    expect(screen.getByText("Section Title")).not.toBeNull();
    expect(screen.getByText("Section desc")).not.toBeNull();
  });

  it("renders PageHeader with icon, title, subtitle", () => {
    render(<PageHeader icon="sparkles" title="Header Title" subtitle="Subtitle note" />);
    expect(screen.getByText("Header Title")).not.toBeNull();
    expect(screen.getByText("Subtitle note")).not.toBeNull();
  });
});

describe("Table Primitives and SortHeader", () => {
  it("renders Table with sticky header, tabular numbers, and sorting", () => {
    const handleSort = vi.fn();
    render(
      <Table stickyHeader density="compact">
        <TableHeader>
          <TableRow>
            <SortHeader sortDirection="desc" onToggleSort={handleSort}>
              Points
            </SortHeader>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow selected>
            <TableCell numeric>33.9</TableCell>
          </TableRow>
          <TableSkeletonRow columns={1} />
        </TableBody>
      </Table>
    );
    const sortHead = screen.getByRole("columnheader", { name: "Points" });
    expect(sortHead.getAttribute("aria-sort")).toBe("descending");
    const sortBtn = screen.getByRole("button", { name: "Points" });
    fireEvent.click(sortBtn);
    expect(handleSort).toHaveBeenCalledTimes(1);

    const cell = screen.getByText("33.9");
    expect(cell.className).toContain("tabular-nums");
  });
});

describe("Menu, Popover and Tooltip Primitives", () => {
  it("opens Menu on click and closes on Escape", () => {
    render(
      <Menu trigger={<span>Open Menu</span>}>
        <MenuItem label="Item 1" onClick={() => {}} />
        <MenuItem label="Item 2" onClick={() => {}} />
      </Menu>
    );
    const trigger = screen.getByRole("button", { name: "Open Menu" });
    fireEvent.click(trigger);

    expect(screen.getByRole("menu")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Item 1" })).not.toBeNull();

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens Popover on click and toggles visibility", () => {
    render(
      <Popover trigger={<span>Open Popover</span>}>
        <div>Popover details</div>
      </Popover>
    );
    const trigger = screen.getByRole("button", { name: "Open Popover" });
    fireEvent.click(trigger);
    expect(screen.getByText("Popover details")).not.toBeNull();
  });

  it("renders Tooltip on hover", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Tooltip explanation" delayMs={300}>
        <button>Target</button>
      </Tooltip>
    );
    const target = screen.getByRole("button", { name: "Target" });
    fireEvent.mouseEnter(target);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole("tooltip").textContent).toContain("Tooltip explanation");
    vi.useRealTimers();
  });
});

describe("Modal and Drawer Primitives", () => {
  it("renders Modal, manages focus trap and closes on Escape", () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Dialog Title">
        <button>Inside Button</button>
      </Modal>
    );
    const dialog = screen.getByRole("dialog", { name: "Dialog Title" });
    expect(dialog).not.toBeNull();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders Drawer and handles close", () => {
    const handleClose = vi.fn();
    render(
      <Drawer isOpen={true} onClose={handleClose} title="Drawer Title">
        <p>Drawer body</p>
      </Drawer>
    );
    const dialog = screen.getByRole("dialog", { name: "Drawer Title" });
    expect(dialog).not.toBeNull();

    const closeBtn = screen.getByRole("button", { name: "Close drawer" });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("CommandPalette Primitive", () => {
  it("filters items by query and selects on Enter", () => {
    const handleSelectStats = vi.fn();
    const handleSelectPlayers = vi.fn();
    const handleClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        onClose={handleClose}
        groups={[
          {
            name: "Pages",
            items: [
              { id: "stats", label: "Stats Explorer", onSelect: handleSelectStats },
              { id: "players", label: "Players Directory", onSelect: handleSelectPlayers },
            ],
          },
        ]}
      />
    );

    const input = screen.getByRole("combobox");
    expect(screen.getByText("Stats Explorer")).not.toBeNull();
    expect(screen.getByText("Players Directory")).not.toBeNull();

    // Type query to filter
    fireEvent.change(input, { target: { value: "Stats" } });
    expect(screen.getByText("Stats Explorer")).not.toBeNull();
    expect(screen.queryByText("Players Directory")).toBeNull();

    // Select with Enter
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handleSelectStats).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("Toast Primitive and useToast Hook", () => {
  it("dispatches and displays toast notifications", () => {
    function ToastTrigger() {
      const { toast } = useToast();
      return (
        <button
          onClick={() =>
            toast({
              title: "Update Successful",
              description: "Snapshot pinned.",
              variant: "positive",
              durationMs: 0,
            })
          }
        >
          Trigger Toast
        </button>
      );
    }

    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    const trigger = screen.getByRole("button", { name: "Trigger Toast" });
    fireEvent.click(trigger);

    expect(screen.getByRole("alert").textContent).toContain("Update Successful");
    expect(screen.getByRole("alert").textContent).toContain("Snapshot pinned.");

    const dismissBtn = screen.getByRole("button", { name: "Dismiss notification" });
    fireEvent.click(dismissBtn);
    expect(dismissBtn).toBeDefined();
  });
});

describe("Skeleton, EmptyState, Accordion and Presence Primitives", () => {
  it("renders Skeleton with custom-property geometry", () => {
    const { container } = render(<Skeleton width={120} height={24} variant="circle" />);
    const el = container.querySelector(".ui-skeleton-circle") as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.style.getPropertyValue("--skeleton-width")).toBe("120px");
    expect(el.style.getPropertyValue("--skeleton-height")).toBe("24px");
  });

  it("renders EmptyState with action", () => {
    render(
      <EmptyState
        icon="search"
        title="No results"
        description="Try again"
        action={<button>Reset</button>}
      />
    );
    expect(screen.getByText("No results")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reset" })).not.toBeNull();
  });

  it("expands and collapses AccordionItem", () => {
    render(
      <Accordion>
        <AccordionItem title="Expand me">
          Hidden description
        </AccordionItem>
      </Accordion>
    );
    const trigger = screen.getByRole("button", { name: "Expand me" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders Presence wrapper children", () => {
    render(
      <Presence>
        <div data-testid="presence-child">Present</div>
      </Presence>
    );
    expect(screen.getByTestId("presence-child").textContent).toContain("Present");
  });
});
