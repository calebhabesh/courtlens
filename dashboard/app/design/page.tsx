"use client";

import { useState } from "react";
import {
  Icon,
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
  TableHead,
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
} from "@/components/ui";
import { DesignFoundationShowcase } from "@/components/design-foundation-showcase";
import { DesignChartShowcase } from "@/components/charts/design-chart-showcase";
import { motion, DURATIONS, SPRING } from "@/lib/motion";
import RootLoading from "@/app/loading";
import StatsLoading from "@/app/stats/loading";
import PlayerProfileLoading from "@/app/players/[id]/loading";
import LiveLoading from "@/app/live/loading";

function DesignShowcase() {
  const { toast } = useToast();

  // State controls for interactive demos
  const [btnLoading, setBtnLoading] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [checkboxIndet, setCheckboxIndet] = useState(true);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [segmentedVal, setSegmentedVal] = useState("shots");
  const [activeTab, setActiveTab] = useState("overview");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>("desc");
  const [tableDensity, setTableDensity] = useState<"default" | "compact">("default");
  const [selectedRow, setSelectedRow] = useState<number | null>(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerSide, setDrawerSide] = useState<"right" | "left" | "bottom">("right");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [showPresenceBox, setShowPresenceBox] = useState(true);
  const [springBoxPos, setSpringBoxPos] = useState(0);
  const [previewSkeleton, setPreviewSkeleton] = useState<"none" | "stats" | "player" | "live" | "root">("none");

  const commandGroups = [
    {
      name: "Navigation",
      items: [
        { id: "stats", label: "Stats Explorer", subtitle: "Full league stats and metrics", icon: "sliders" as const, onSelect: () => {} },
        { id: "players", label: "Players Directory", subtitle: "Profiles and shotcharts", icon: "star" as const, onSelect: () => {} },
        { id: "teams", label: "Teams Directory", subtitle: "Team ratings and four-factors", icon: "sparkles" as const, onSelect: () => {} },
      ],
    },
    {
      name: "Actions",
      items: [
        { id: "theme", label: "Toggle Dark Theme", subtitle: "Current: Dark Only", icon: "settings" as const, onSelect: () => {} },
        { id: "clear", label: "Clear Saved Findings", subtitle: "Reset local storage cache", icon: "trash" as const, onSelect: () => {} },
      ],
    },
  ];

  return (
    <div className="ui-design-page" style={{ "--page-gutter": "var(--space-6)" } as React.CSSProperties}>
      <PageHeader
        icon="sparkles"
        title="Design Language v1.2"
        subtitle="Tokens, components and chart states."
        actions={
          <div className="ui-design-header-actions">
            <Button
              variant="secondary"
              icon="command"
              onClick={() => setIsPaletteOpen(true)}
            >
              Command Palette (⌘K)
            </Button>
            <Button
              variant="primary"
              icon="sparkles"
              onClick={() =>
                toast({
                  title: "Design System Ready",
                  description: "Design Language v1 primitives loaded and verified.",
                  variant: "positive",
                })
              }
            >
              Test Toast
            </Button>
          </div>
        }
      />

      <div className="ui-design-grid">
        <section className="chart-guide-section">
          <div className="chart-guide-heading"><h2>Chart Toolkit · v1.2</h2><p>Illustrative geometry inputs · no NBA estimates.</p></div>
          <DesignChartShowcase />
        </section>
        {/* SECTION 1: DESIGN TOKENS */}
        <Section title="0. Foundation (frontend overhaul FO01)" description="Page header, filter bar, fields, date picker, chips, gated notes, Data details, identity, stat tiles and template skeletons.">
          <DesignFoundationShowcase />
        </Section>

        <Section title="1. Design Tokens" description="Strict 4px rhythm, tonal surfaces, and zero harsh outlines.">
          <div className="ui-design-token-row">
            {/* Color Swatches */}
            <Panel title="Color Surfaces & Text" compact>
              <div className="ui-design-swatches">
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-bg)" } as React.CSSProperties} />
                  <code>--color-bg</code>
                  <span className="text-muted">#15325a</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-surface-1)" } as React.CSSProperties} />
                  <code>--color-surface-1</code>
                  <span className="text-muted">#15171b</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-surface-2)" } as React.CSSProperties} />
                  <code>--color-surface-2</code>
                  <span className="text-muted">#1c1f24</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-surface-3)" } as React.CSSProperties} />
                  <code>--color-surface-3</code>
                  <span className="text-muted">#24282e</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-accent)" } as React.CSSProperties} />
                  <code>--color-accent</code>
                  <span className="text-muted">#ffd166</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-positive)" } as React.CSSProperties} />
                  <code>--color-positive</code>
                  <span className="text-muted">#60d394</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-negative)" } as React.CSSProperties} />
                  <code>--color-negative</code>
                  <span className="text-muted">#ff6b6b</span>
                </div>
                <div className="ui-swatch-item">
                  <div className="ui-swatch-box" style={{ "--swatch-color": "var(--color-info)" } as React.CSSProperties} />
                  <code>--color-info</code>
                  <span className="text-muted">#67aaf9</span>
                </div>
              </div>
            </Panel>

            {/* Elevations & Shadows */}
            <Panel title="Elevation & Shadows" compact>
              <div className="ui-design-elevations">
                <div className="ui-elevation-card" style={{ "--card-shadow": "var(--shadow-1)" } as React.CSSProperties}>
                  <strong>--shadow-1</strong>
                  <span className="text-muted">Panels & Cards</span>
                </div>
                <div className="ui-elevation-card" style={{ "--card-shadow": "var(--shadow-2)" } as React.CSSProperties}>
                  <strong>--shadow-2</strong>
                  <span className="text-muted">Menus & Popovers</span>
                </div>
                <div className="ui-elevation-card" style={{ "--card-shadow": "var(--shadow-3)" } as React.CSSProperties}>
                  <strong>--shadow-3</strong>
                  <span className="text-muted">Modals & Drawers</span>
                </div>
              </div>
            </Panel>

            {/* Radii & Typography */}
            <Panel title="Radius & Sizing" compact>
              <div className="ui-design-radii">
                <div className="ui-radius-box" style={{ "--box-radius": "var(--radius-xs)" } as React.CSSProperties}>
                  xs (4px)
                </div>
                <div className="ui-radius-box" style={{ "--box-radius": "var(--radius-sm)" } as React.CSSProperties}>
                  sm (6px)
                </div>
                <div className="ui-radius-box" style={{ "--box-radius": "var(--radius-md)" } as React.CSSProperties}>
                  md (10px)
                </div>
                <div className="ui-radius-box" style={{ "--box-radius": "var(--radius-lg)" } as React.CSSProperties}>
                  lg (14px)
                </div>
                <div className="ui-radius-box" style={{ "--box-radius": "var(--radius-pill)" } as React.CSSProperties}>
                  pill (999px)
                </div>
              </div>
            </Panel>
          </div>
        </Section>

        {/* SECTION 2: MOTION & REDUCED MOTION */}
        <Section title="2. Motion System" description="Deterministic durations, standard easings, and reactive springs.">
          <Panel>
            <div className="ui-design-motion-grid">
              <div>
                <h4>Durations & Easings</h4>
                <div className="ui-motion-duration-list">
                  <div><code>--dur-instant (80ms)</code> — Press & active feedback</div>
                  <div><code>--dur-fast (140ms)</code> — Hover, color, exits, tooltips</div>
                  <div><code>--dur-base (200ms)</code> — Popovers, tabs, enters</div>
                  <div><code>--dur-slow (320ms)</code> — Drawers, modals, page transition</div>
                  <div><code>--dur-chart (450ms)</code> — First chart draw only</div>
                </div>
                <div className="ui-motion-status">
                  Reduced Motion: <strong><span className="ui-motion-status-normal">Normal</span><span className="ui-motion-status-reduced">Active (Overrides applied)</span></strong>
                </div>
              </div>

              <div>
                <h4>Interactive Spring Tester</h4>
                <p className="text-muted">Spring: stiffness 520, damping 38, mass 0.9</p>
                <div className="ui-spring-track">
                  <motion.div
                    className="ui-spring-box"
                    animate={{ x: springBoxPos }}
                    transition={SPRING}
                  />
                </div>
                <div className="ui-spring-controls">
                  <Button size="sm" onClick={() => setSpringBoxPos(0)}>0px</Button>
                  <Button size="sm" onClick={() => setSpringBoxPos(80)}>80px</Button>
                  <Button size="sm" onClick={() => setSpringBoxPos(160)}>160px</Button>
                  <Button size="sm" onClick={() => setSpringBoxPos(240)}>240px</Button>
                </div>
              </div>
            </div>
          </Panel>
        </Section>

        {/* SECTION 3: BUTTONS & CONTROLS */}
        <Section title="3. Buttons & Form Controls" description="Touch/desktop scales with hover, active, loading, and disabled states.">
          <div className="ui-design-row">
            <Panel title="Buttons (Variants × Sizes)" compact>
              <div className="ui-design-cluster">
                <Button variant="primary" size="sm">Primary SM</Button>
                <Button variant="primary" size="md">Primary MD</Button>
                <Button variant="primary" size="lg">Primary LG</Button>
              </div>
              <div className="ui-design-cluster">
                <Button variant="secondary" size="sm">Secondary SM</Button>
                <Button variant="secondary" size="md">Secondary MD</Button>
                <Button variant="secondary" size="lg">Secondary LG</Button>
              </div>
              <div className="ui-design-cluster">
                <Button variant="ghost" size="sm">Ghost SM</Button>
                <Button variant="ghost" size="md">Ghost MD</Button>
                <Button variant="ghost" size="lg">Ghost LG</Button>
              </div>
              <div className="ui-design-cluster">
                <Button variant="danger" size="sm">Danger SM</Button>
                <Button variant="danger" size="md">Danger MD</Button>
                <Button variant="danger" size="lg">Danger LG</Button>
              </div>
              <div className="ui-design-cluster">
                <Button
                  loading={btnLoading}
                  onClick={() => {
                    setBtnLoading(true);
                    setTimeout(() => setBtnLoading(false), 1500);
                  }}
                >
                  {btnLoading ? "Processing…" : "Click for Loading State"}
                </Button>
                <Button disabled>Disabled Button</Button>
                <IconButton icon="star" label="Favorite player" />
                <IconButton icon="download" label="Export CSV" variant="ghost" />
              </div>
            </Panel>

            <Panel title="Inputs & SearchField" compact>
              <div className="ui-design-column">
                <Input
                  inputSize="sm"
                  placeholder="Small input (28px)…"
                  prefixIcon="search"
                />
                <Input
                  inputSize="md"
                  placeholder="Medium input (32px)…"
                  prefixIcon="settings"
                />
                <Input
                  inputSize="lg"
                  placeholder="Large input (40px)…"
                  suffixIcon="star"
                />
                <Input
                  error
                  placeholder="Error state with negative glow…"
                  defaultValue="Invalid sample range"
                />
                <SearchField
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  onClear={() => setSearchValue("")}
                  placeholder="Search players, teams… ⌘K"
                  shortcut="⌘K"
                />
              </div>
            </Panel>

            <Panel title="Select, Checkbox & Switch" compact>
              <div className="ui-design-column">
                <Select aria-label="Example season select" defaultValue="regular_season">
                  <option value="regular_season">Regular Season (2025-26)</option>
                  <option value="playoffs">Playoffs Bracket</option>
                  <option value="play_in">Play-In Tournament</option>
                </Select>
                <Select aria-label="Disabled example select" disabled defaultValue="disabled">
                  <option value="disabled">Disabled Select Option</option>
                </Select>
                <div className="ui-design-cluster">
                  <Checkbox
                    id="cb-demo-1"
                    label="Checked checkbox"
                    checked={checkboxChecked}
                    onChange={setCheckboxChecked}
                  />
                  <Checkbox
                    id="cb-demo-2"
                    label="Indeterminate"
                    indeterminate={checkboxIndet}
                    checked={false}
                    onChange={() => setCheckboxIndet(!checkboxIndet)}
                  />
                  <Checkbox id="cb-demo-3" label="Disabled checkbox" disabled checked />
                </div>
                <div className="ui-design-cluster">
                  <Switch
                    id="sw-demo-1"
                    label="Active toggle"
                    checked={switchChecked}
                    onChange={setSwitchChecked}
                  />
                  <Switch id="sw-demo-2" label="Disabled toggle" disabled checked={false} onChange={() => {}} />
                </div>
              </div>
            </Panel>
          </div>
        </Section>

        {/* SECTION 4: NAVIGATION, TABS & SEGMENTED CONTROLS */}
        <Section title="4. Navigation & Layout Controls" description="Sliding spring indicators and crossfading contents.">
          <div className="ui-design-row">
            <Panel title="Segmented Control" compact>
              <SegmentedControl
                value={segmentedVal}
                onChange={setSegmentedVal}
                options={[
                  { value: "shots", label: "Shot Chart", icon: "sparkles" },
                  { value: "trends", label: "Trends", icon: "sliders" },
                  { value: "similarity", label: "Similarity", icon: "star" },
                ]}
              />
              <p className="text-muted" style={{ "--mt": "var(--space-2)" } as React.CSSProperties}>
                Selected view: <strong>{segmentedVal}</strong>
              </p>
            </Panel>

            <Panel title="Tabs Primitive" compact>
              <Tabs value={activeTab} onChange={setActiveTab}>
                <TabsList aria-label="Demo Tabs">
                  <TabTrigger value="overview">Overview</TabTrigger>
                  <TabTrigger value="advanced">Advanced Metrics</TabTrigger>
                  <TabTrigger value="lineage">Data Lineage</TabTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <p>Overview tab content: Per-game scoring, minutes baseline, and defensive match-ups.</p>
                </TabsContent>
                <TabsContent value="advanced">
                  <p>Advanced metrics tab content: EWMA-20, RAPM uncertainty intervals, and EPV splits.</p>
                </TabsContent>
                <TabsContent value="lineage">
                  <p>Lineage tab content: Ingestion SHA-256 content hashes and immutable snapshot identifiers.</p>
                </TabsContent>
              </Tabs>
            </Panel>

            <Panel title="Badges & Chips" compact>
              <div className="ui-design-cluster">
                <Badge variant="default">Default</Badge>
                <Badge variant="accent" icon="sparkles">Accent</Badge>
                <Badge variant="positive" icon="check">Positive</Badge>
                <Badge variant="negative" icon="alert">Negative</Badge>
                <Badge variant="info" icon="info">Info</Badge>
              </div>
              <div className="ui-design-cluster">
                <Chip onRemove={() => toast({ title: "Removed", description: "Luka Dončić chip removed" })}>
                  Luka Dončić
                </Chip>
                <Chip onRemove={() => toast({ title: "Removed", description: "Boston Celtics chip removed" })}>
                  Boston Celtics
                </Chip>
                <Chip pill={false}>Non-pill Chip</Chip>
              </div>
            </Panel>
          </div>
        </Section>

        {/* SECTION 5: TABLES */}
        <Section title="5. Data Tables" description="Hairline dividers, sticky header, row hover, tabular numbers, and sorting.">
          <Panel>
            <div className="ui-design-table-toolbar">
              <SegmentedControl
                size="sm"
                value={tableDensity}
                onChange={v => setTableDensity(v as "default" | "compact")}
                options={[
                  { value: "default", label: "Default Density" },
                  { value: "compact", label: "Compact Density" },
                ]}
              />
            </div>

            <Table density={tableDensity} stickyHeader>
              <TableHeader>
                <TableRow hoverable={false}>
                  <TableHead>Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead>Team</TableHead>
                  <SortHeader
                    align="right"
                    sortDirection={sortDir}
                    onToggleSort={() => setSortDir(prev => (prev === "asc" ? "desc" : prev === "desc" ? null : "asc"))}
                  >
                    PTS / G
                  </SortHeader>
                  <TableHead align="right">AST / G</TableHead>
                  <TableHead align="right">TRB / G</TableHead>
                  <TableHead align="right">RAPM ±</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { rank: 1, name: "Luka Dončić", team: "DAL", pts: 33.9, ast: 9.8, trb: 9.2, rapm: "+5.82" },
                  { rank: 2, name: "Giannis Antetokounmpo", team: "MIL", pts: 30.4, ast: 6.5, trb: 11.5, rapm: "+5.14" },
                  { rank: 3, name: "Shai Gilgeous-Alexander", team: "OKC", pts: 30.1, ast: 6.2, trb: 5.5, rapm: "+4.96" },
                  { rank: 4, name: "Jalen Brunson", team: "NYK", pts: 28.7, ast: 6.7, trb: 3.6, rapm: "+4.21" },
                ].map((row, idx) => (
                  <TableRow
                    key={row.rank}
                    selected={selectedRow === idx}
                    onClick={() => setSelectedRow(idx)}
                  >
                    <TableCell numeric>{row.rank}</TableCell>
                    <TableCell><strong>{row.name}</strong></TableCell>
                    <TableCell><Badge variant="default">{row.team}</Badge></TableCell>
                    <TableCell numeric>{row.pts.toFixed(1)}</TableCell>
                    <TableCell numeric>{row.ast.toFixed(1)}</TableCell>
                    <TableCell numeric>{row.trb.toFixed(1)}</TableCell>
                    <TableCell numeric><span style={{ "--c": "var(--color-positive)" } as React.CSSProperties}>{row.rapm}</span></TableCell>
                  </TableRow>
                ))}
                <TableSkeletonRow columns={7} />
              </TableBody>
            </Table>
          </Panel>
        </Section>

        {/* SECTION 6: OVERLAYS, MODALS, DRAWERS & MENUS */}
        <Section title="6. Overlays, Menus & Dialogs" description="Scale and fade enters, scrim blurs, focus trapping, and keyboard escapes.">
          <div className="ui-design-row">
            <Panel title="Menu & Popover" compact>
              <div className="ui-design-cluster">
                <Menu
                  trigger={
                    <span className="ui-button ui-button-secondary ui-button-md">
                      <Icon name="menu" size={14} /> Open Actions Menu
                    </span>
                  }
                >
                  <MenuItem label="View Profile" icon="star" onClick={() => toast({ title: "View Profile" })} />
                  <MenuItem label="Compare Matchup" icon="sliders" onClick={() => toast({ title: "Compare" })} />
                  <MenuItem label="Export Shotchart" icon="download" shortcut="⌘E" onClick={() => toast({ title: "Export" })} />
                  <MenuItem label="Remove from Roster" icon="trash" disabled onClick={() => {}} />
                </Menu>

                <Popover
                  trigger={
                    <span className="ui-button ui-button-secondary ui-button-md">
                      <Icon name="info" size={14} /> Popover Info
                    </span>
                  }
                >
                  <div style={{ "--p": "var(--space-3)" } as React.CSSProperties}>
                    <h4>Calibration Interval</h4>
                    <p className="text-muted" style={{ "--mt": "var(--space-1)" } as React.CSSProperties}>
                      Intervals represent empirical 80% coverage, not point estimate certainty.
                    </p>
                  </div>
                </Popover>

                <Tooltip content="Tooltip delayed 300ms">
                  <Button variant="ghost" icon="sparkles">Hover for Tooltip</Button>
                </Tooltip>
              </div>
            </Panel>

            <Panel title="Modal & Drawer Controls" compact>
              <div className="ui-design-cluster">
                <Button onClick={() => setIsModalOpen(true)}>Open Modal Dialog</Button>
                <Button
                  onClick={() => {
                    setDrawerSide("right");
                    setIsDrawerOpen(true);
                  }}
                >
                  Open Drawer (Right)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDrawerSide("bottom");
                    setIsDrawerOpen(true);
                  }}
                >
                  Open Bottom Sheet
                </Button>
              </div>
            </Panel>

            <Panel title="Accordion & EmptyState" compact>
              <Accordion>
                <AccordionItem title="What is the CourtLens temporal discipline rule?">
                  Feature computations strictly exclude the target date and all subsequent outcomes (game_date &lt; replay_date).
                </AccordionItem>
                <AccordionItem title="Why are absent rows not treated as zero?">
                  Zero Inferred Claims: An absent box-score row is unknown, not a confirmed zero outcome or injury confirmation.
                </AccordionItem>
              </Accordion>
            </Panel>
          </div>
        </Section>

        {/* SECTION 7: SKELETONS & PRESENCE */}
        <Section title="7. Loading Skeletons & Presence Wrapper" description="Layout-shaped shimmering placeholders with zero layout shift.">
          <div className="ui-design-row">
            <Panel title="Skeletons" compact>
              <div className="ui-design-column">
                <Skeleton height={20} width="60%" />
                <Skeleton height={14} width="90%" />
                <Skeleton height={14} width="75%" />
                <div className="ui-design-cluster">
                  <Skeleton variant="circle" height={40} width={40} />
                  <div className="ui-design-column" style={{ "--flex": "1" } as React.CSSProperties}>
                    <Skeleton height={14} width="50%" />
                    <Skeleton height={12} width="30%" />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Route Loading Skeletons" compact>
              <div className="ui-design-column">
                <SegmentedControl
                  value={previewSkeleton}
                  onChange={(val) => setPreviewSkeleton(val as typeof previewSkeleton)}
                  options={[
                    { value: "none", label: "None" },
                    { value: "stats", label: "Stats" },
                    { value: "player", label: "Player" },
                    { value: "live", label: "Live" },
                    { value: "root", label: "Root" },
                  ]}
                />
                <p className="text-muted">
                  Interactive preview of tokenized route skeletons matching live layout geometry.
                </p>
              </div>
            </Panel>

            <Panel title="Presence Enter/Exit Wrapper" compact>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowPresenceBox(!showPresenceBox)}
              >
                Toggle Animated Presence
              </Button>
              <div className="ui-presence-demo-area">
                <Presence>
                  {showPresenceBox && (
                    <motion.div
                      key="box"
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DURATIONS.base } }}
                      exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: DURATIONS.fast } }}
                      className="ui-presence-card"
                    >
                      Animated via Presence wrapper with AnimatePresence
                    </motion.div>
                  )}
                </Presence>
              </div>
            </Panel>

            <Panel title="Empty State" compact>
              <EmptyState
                icon="search"
                title="No matching players found"
                description="Try broadening your filter criteria or selecting an earlier replay season."
                action={<Button size="sm" variant="secondary">Reset Filters</Button>}
              />
            </Panel>
          </div>

          {previewSkeleton !== "none" && (
            <div className="ui-design-skeleton-preview">
              <Panel title={`Live Preview: ${previewSkeleton.toUpperCase()} Route Skeleton`}>
                {previewSkeleton === "stats" && <StatsLoading />}
                {previewSkeleton === "player" && <PlayerProfileLoading />}
                {previewSkeleton === "live" && <LiveLoading />}
                {previewSkeleton === "root" && <RootLoading />}
              </Panel>
            </div>
          )}
        </Section>
      </div>

      {/* OVERLAY INSTANCES */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Sample Model Evaluation Dialog"
        description="Chronological validation across 10 chronological splits."
      >
        <div style={{ "--mt": "var(--space-2)" } as React.CSSProperties}>
          <p>
            Validation splits: T, V1, V2, C, F. The carryover baseline achieved an out-of-time MAE of 4.72 PTS
            and empirical 80% interval coverage of 79.6%.
          </p>
          <div className="ui-modal-footer-demo">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>Acknowledge</Button>
          </div>
        </div>
      </Modal>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        side={drawerSide}
        title="Side Drawer Inspection"
      >
        <p>This drawer demonstrates edge sliding over 320ms with ease-out, background blur scrim, and trapped keyboard focus.</p>
        <div style={{ "--mt": "var(--space-4)" } as React.CSSProperties}>
          <Button variant="secondary" onClick={() => setIsDrawerOpen(false)}>Close Drawer</Button>
        </div>
      </Drawer>

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        groups={commandGroups}
      />
    </div>
  );
}

export default function DesignPage() {
  return (
    <ToastProvider>
      <DesignShowcase />
    </ToastProvider>
  );
}
