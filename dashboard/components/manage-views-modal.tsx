"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { ALL_CATALOG_METRICS } from "@/lib/stats-presets";
import { computeClientBundleChecksum, getWorkspacePresets } from "@/lib/workspace-client";
import type {
  CustomViewDefinition,
  ImportConflictMode,
  WorkspaceBundle
} from "@/lib/types";

interface ManageViewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeViewId?: string;
  onSelectView?: (viewId: string) => void;
}

type ModalTab = "list" | "editor" | "import_export";

const MAX_CUSTOM_VIEWS = 10;
const MAX_COLUMNS_PER_VIEW = 25;

export function ManageViewsModal({
  isOpen,
  onClose,
  activeViewId,
  onSelectView
}: ManageViewsModalProps) {
  const {
    views,
    defaultViewId,
    addCustomView,
    updateCustomView,
    deleteCustomView,
    reorderCustomViews,
    setDefaultView,
    exportBundle,
    importBundle,
    resetToDefaults,
    conflictNotice,
    clearConflictNotice
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<ModalTab>("list");
  const [editingViewId, setEditingViewId] = useState<string | null>(null);

  // Form states for Add / Edit
  const [formName, setFormName] = useState("");
  const [formColumns, setFormColumns] = useState<string[]>([]);
  const [formUnavailable, setFormUnavailable] = useState<string[]>([]);
  const [formSortField, setFormSortField] = useState<string>("pts_per_game");
  const [formSortDirection, setFormSortDirection] = useState<"asc" | "desc">("desc");
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Import / Export states
  const [importJsonText, setImportJsonText] = useState("");
  const [importMode, setImportMode] = useState<ImportConflictMode>("merge");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset editor when switching to editor tab
  const handleOpenAddView = () => {
    setEditingViewId(null);
    setFormName(`Custom View ${views.length + 1}`);
    setFormColumns(["gp", "min_per_game", "pts_per_game", "reb_per_game", "ast_per_game", "fg_pct"]);
    setFormUnavailable([]);
    setFormSortField("pts_per_game");
    setFormSortDirection("desc");
    setFormIsDefault(false);
    setErrorMessage(null);
    setActiveTab("editor");
  };

  const handleOpenEditView = (view: CustomViewDefinition) => {
    setEditingViewId(view.id);
    setFormName(view.name);
    setFormColumns([...view.columns]);
    setFormUnavailable([...(view.unavailable_columns ?? [])]);
    setFormSortField(view.sort_field || view.columns[0] || "pts_per_game");
    setFormSortDirection(view.sort_direction || "desc");
    setFormIsDefault(view.is_default || view.id === defaultViewId);
    setErrorMessage(null);
    setActiveTab("editor");
  };

  const handleToggleColumn = (key: string, isUnavailable = false) => {
    if (formColumns.includes(key)) {
      setFormColumns(formColumns.filter((c) => c !== key));
      if (formUnavailable.includes(key)) {
        setFormUnavailable(formUnavailable.filter((c) => c !== key));
      }
      if (formSortField === key) {
        const remaining = formColumns.filter((c) => c !== key);
        setFormSortField(remaining[0] || "pts_per_game");
      }
    } else {
      if (formColumns.length >= MAX_COLUMNS_PER_VIEW) {
        setErrorMessage(`Maximum ${MAX_COLUMNS_PER_VIEW} columns allowed per custom view.`);
        return;
      }
      setFormColumns([...formColumns, key]);
      if (isUnavailable) {
        setFormUnavailable([...formUnavailable, key]);
      }
      setErrorMessage(null);
    }
  };

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMessage("View name is required.");
      return;
    }
    if (formColumns.length === 0) {
      setErrorMessage("At least 1 column must be selected.");
      return;
    }
    if (formColumns.length > MAX_COLUMNS_PER_VIEW) {
      setErrorMessage(`Maximum ${MAX_COLUMNS_PER_VIEW} columns allowed.`);
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      if (editingViewId) {
        await updateCustomView(editingViewId, {
          name: formName.trim(),
          columns: formColumns,
          unavailable_columns: formUnavailable,
          sort_field: formSortField,
          sort_direction: formSortDirection,
          is_default: formIsDefault
        });
        if (formIsDefault) {
          await setDefaultView(editingViewId);
        }
      } else {
        if (views.length >= MAX_CUSTOM_VIEWS) {
          throw new Error(`Maximum ${MAX_CUSTOM_VIEWS} custom views allowed.`);
        }
        const updated = await addCustomView({
          name: formName.trim(),
          columns: formColumns,
          unavailable_columns: formUnavailable,
          sort_field: formSortField,
          sort_direction: formSortDirection,
          is_default: formIsDefault
        });
        if (formIsDefault && updated.views.length > 0) {
          const newId = updated.views[updated.views.length - 1].id;
          await setDefaultView(newId);
        }
      }
      setActiveTab("list");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save custom view");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (viewId: string) => {
    if (!window.confirm("Are you sure you want to delete this custom view?")) return;
    try {
      await deleteCustomView(viewId);
      if (activeViewId === viewId && onSelectView) {
        onSelectView("overview");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete view");
    }
  };

  const handleMoveUp = async (idx: number) => {
    if (idx <= 0) return;
    const ids = views.map((v) => v.id);
    const temp = ids[idx];
    ids[idx] = ids[idx - 1];
    ids[idx - 1] = temp;
    try {
      await reorderCustomViews(ids);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder views");
    }
  };

  const handleMoveDown = async (idx: number) => {
    if (idx >= views.length - 1) return;
    const ids = views.map((v) => v.id);
    const temp = ids[idx];
    ids[idx] = ids[idx + 1];
    ids[idx + 1] = temp;
    try {
      await reorderCustomViews(ids);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder views");
    }
  };

  const handleSetDefault = async (viewId: string) => {
    try {
      await setDefaultView(viewId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set default view");
    }
  };

  const handleExport = async () => {
    try {
      const bundle = await exportBundle();
      const jsonStr = JSON.stringify(bundle, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `courtload-workspace-bundle-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export workspace bundle");
    }
  };

  const handleImportSubmit = async () => {
    if (!importJsonText.trim()) {
      setImportStatus("Error: Please paste a valid workspace JSON bundle.");
      return;
    }

    try {
      const parsed = JSON.parse(importJsonText.trim()) as WorkspaceBundle;
      if (parsed.bundle_version !== "1.0") {
        throw new Error(`Unsupported bundle version '${parsed.bundle_version}'. Expected '1.0'.`);
      }

      // Checksum verification
      const computed = await computeClientBundleChecksum(parsed as unknown as Record<string, unknown>);
      if (parsed.checksum_sha256 && parsed.checksum_sha256 !== computed) {
        throw new Error(
          `Checksum mismatch! Declared: ${parsed.checksum_sha256.slice(0, 8)}..., computed: ${computed.slice(0, 8)}... File may be corrupted.`
        );
      }

      await importBundle(parsed, importMode);
      setImportStatus(`Success: Workspace bundle imported successfully in '${importMode}' mode.`);
      setImportJsonText("");
      setTimeout(() => {
        setActiveTab("list");
        setImportStatus(null);
      }, 1200);
    } catch (err) {
      setImportStatus(`Import Error: ${err instanceof Error ? err.message : "Invalid bundle format"}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonText(content);
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Are you sure you want to reset your workspace to default presets? Custom views and preferences will revert."
      )
    ) {
      return;
    }
    try {
      await resetToDefaults();
      alert("Workspace reset to default settings.");
      setActiveTab("list");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reset workspace");
    }
  };

  // Group catalog metrics for column picker
  const groupedMetrics = useMemo(() => {
    const groups: Record<string, Array<{ key: string; label: string; tooltip?: string; unavailable?: boolean }>> = {};
    const q = columnSearch.toLowerCase().trim();

    for (const [key, col] of Object.entries(ALL_CATALOG_METRICS)) {
      if (
        q &&
        !key.toLowerCase().includes(q) &&
        !col.label.toLowerCase().includes(q) &&
        !col.group.toLowerCase().includes(q)
      ) {
        continue;
      }
      const grp = col.group || "Other";
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push({
        key,
        label: col.label,
        tooltip: col.tooltip,
        unavailable: col.group === "Impact" && (key === "rapm" || key === "onoff_net_rating" || key === "six_factor_impact")
      });
    }

    return groups;
  }, [columnSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-views-title"
    >
      <div
        className="modal-card"
        ref={modalRef}
        style={{ maxWidth: "780px", width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <h2 id="manage-views-title" className="modal-title">
              Manage Custom Views &amp; Preferences
            </h2>
            <p className="modal-subtitle">
              F04 Custom Views · Personal state persistence with atomic version checks.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close manage views modal"
          >
            ✕
          </button>
        </div>

        {/* Conflict Notice if any */}
        {conflictNotice && (
          <div
            className="notice-box"
            style={{
              borderLeftColor: "var(--negative)",
              margin: "0.5rem 1.25rem 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span style={{ fontSize: "0.8rem" }}>{conflictNotice}</span>
            <button
              type="button"
              className="button button-small"
              onClick={clearConflictNotice}
              style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 1.25rem 0", borderBottom: "1px solid var(--border)" }}>
          <button
            type="button"
            className={`control-pill ${activeTab === "list" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("list");
              setErrorMessage(null);
            }}
          >
            Custom Views ({views.length}/{MAX_CUSTOM_VIEWS})
          </button>
          <button
            type="button"
            className={`control-pill ${activeTab === "editor" ? "active" : ""}`}
            onClick={() => {
              if (activeTab !== "editor") handleOpenAddView();
            }}
            disabled={views.length >= MAX_CUSTOM_VIEWS && !editingViewId}
            title={views.length >= MAX_CUSTOM_VIEWS ? "Maximum 10 custom views reached" : "Add or edit custom view"}
          >
            {editingViewId ? "Edit View" : "+ Add View"}
          </button>
          <button
            type="button"
            className={`control-pill ${activeTab === "import_export" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("import_export");
              setErrorMessage(null);
            }}
          >
            Export / Import &amp; Reset
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          {/* TAB 1: LIST VIEWS */}
          {activeTab === "list" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="text-xs text-muted">
                  Personal views saved: <strong>{views.length}</strong> / {MAX_CUSTOM_VIEWS}. Use keyboard buttons to reorder.
                </span>
                <button
                  type="button"
                  onClick={handleOpenAddView}
                  disabled={views.length >= MAX_CUSTOM_VIEWS}
                  className="button button-small button-primary"
                >
                  + Create View
                </button>
              </div>

              {views.length === 0 ? (
                <div
                  style={{
                    padding: "2.5rem 1rem",
                    textAlign: "center",
                    background: "var(--surface)",
                    borderRadius: "var(--radius)",
                    border: "1px dashed var(--border)"
                  }}
                >
                  <p className="text-muted" style={{ margin: "0 0 0.5rem" }}>
                    No custom views created yet. Built-in presets are currently active.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddView}
                    className="button button-small button-primary"
                  >
                    Create Your First Custom View
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {views.map((view, idx) => {
                    const isDefault = view.id === defaultViewId || view.is_default;
                    const isActive = view.id === activeViewId;
                    const hasUnavailable = (view.unavailable_columns?.length ?? 0) > 0;

                    return (
                      <div
                        key={view.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.6rem 0.85rem",
                          background: "var(--surface-raised)",
                          border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                          borderRadius: "var(--radius)",
                          gap: "0.75rem"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
                          <span className="font-mono text-muted text-xs" style={{ width: "20px" }}>
                            {idx + 1}.
                          </span>
                          <strong style={{ fontSize: "0.9rem", color: "var(--text)" }}>
                            {view.name}
                          </strong>
                          {isDefault && (
                            <span className="replica-badge-active" title="Default view on Stats explorer">
                              ★ Default
                            </span>
                          )}
                          {hasUnavailable && (
                            <span className="replica-badge-gated" title="Contains unavailable metrics (preserved)">
                              🔒 {view.unavailable_columns?.length} unavailable
                            </span>
                          )}
                          <span className="text-xs text-muted font-mono">
                            ({view.columns.length}/25 cols · sort: {view.sort_field || "pts"})
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          {/* Reorder Buttons */}
                          <button
                            type="button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            className="button button-small"
                            style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                            title="Move view up"
                            aria-label={`Move ${view.name} up`}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === views.length - 1}
                            className="button button-small"
                            style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                            title="Move view down"
                            aria-label={`Move ${view.name} down`}
                          >
                            ▼
                          </button>

                          {/* Set Default */}
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(view.id)}
                              className="button button-small"
                              style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                              title="Set as default view"
                            >
                              Make Default
                            </button>
                          )}

                          {/* Open / Select */}
                          {onSelectView && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectView(view.id);
                                onClose();
                              }}
                              className="button button-small button-primary"
                              style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                            >
                              Open
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditView(view)}
                            className="button button-small"
                            style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                          >
                            Edit
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDelete(view.id)}
                            className="button button-small"
                            style={{ padding: "0.15rem 0.45rem", fontSize: "0.75rem", color: "var(--negative)" }}
                            title="Delete custom view"
                            aria-label={`Delete ${view.name}`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Built-in Presets Info */}
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 1rem",
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: "0.82rem", color: "var(--text)" }}>
                      Built-in Presets
                    </strong>
                    <p className="text-xs text-muted" style={{ margin: "0.2rem 0 0" }}>
                      Canonical presets (Overview, Shooting, Defense, True Shooting, Rates Per 36, Playmaking, Rebounding, Impact, On-Off, Six Factor) are recoverable at any time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const presets = await getWorkspacePresets();
                        alert(`Recovered ${presets.length} canonical presets from server.`);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Failed to load presets");
                      }
                    }}
                    className="button button-small"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Inspect Presets
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VIEW EDITOR (ADD / EDIT) */}
          {activeTab === "editor" && (
            <form onSubmit={handleSaveView} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {errorMessage && (
                <div className="notice-box" style={{ borderLeftColor: "var(--negative)", margin: 0 }}>
                  <strong style={{ color: "var(--negative)" }}>Validation Error:</strong> {errorMessage}
                </div>
              )}

              {/* Name & Default row */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "220px" }}>
                  <label htmlFor="custom-view-name" className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: "0.3rem" }}>
                    View Name * (max 100 chars)
                  </label>
                  <input
                    id="custom-view-name"
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    maxLength={100}
                    placeholder="e.g. Playmakers &amp; Efficiency"
                    required
                    style={{ width: "100%", padding: "0.45rem 0.65rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.2rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={formIsDefault}
                      onChange={(e) => setFormIsDefault(e.target.checked)}
                    />
                    <span>Set as Default View</span>
                  </label>
                </div>
              </div>

              {/* Sorting row */}
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ minWidth: "200px" }}>
                  <label htmlFor="custom-view-sort" className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: "0.3rem" }}>
                    Default Sort Field
                  </label>
                  <select
                    id="custom-view-sort"
                    value={formSortField}
                    onChange={(e) => setFormSortField(e.target.value)}
                    style={{ width: "100%", padding: "0.4rem 0.6rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)" }}
                  >
                    {formColumns.map((colKey) => (
                      <option key={colKey} value={colKey}>
                        {ALL_CATALOG_METRICS[colKey]?.label ?? colKey} ({colKey})
                      </option>
                    ))}
                    {!formColumns.includes(formSortField) && (
                      <option value={formSortField}>{formSortField}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="custom-view-dir" className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: "0.3rem" }}>
                    Sort Direction
                  </label>
                  <select
                    id="custom-view-dir"
                    value={formSortDirection}
                    onChange={(e) => setFormSortDirection(e.target.value as "asc" | "desc")}
                    style={{ padding: "0.4rem 0.6rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)" }}
                  >
                    <option value="desc">Descending (High to Low)</option>
                    <option value="asc">Ascending (Low to High)</option>
                  </select>
                </div>
              </div>

              {/* Preserved Unavailable Columns Notice */}
              {formUnavailable.length > 0 && (
                <div className="notice-box" style={{ borderLeftColor: "var(--accent)", margin: 0, padding: "0.5rem 0.75rem" }}>
                  <strong style={{ fontSize: "0.78rem" }}>Explicit Unavailable Columns:</strong>
                  <span className="text-xs text-muted" style={{ marginLeft: "0.5rem" }}>
                    {formUnavailable.join(", ")} (preserved under contract rules).
                  </span>
                </div>
              )}

              {/* Column Selection Header & Filter */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div>
                    <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>
                      Select Metric Columns
                    </strong>
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono)",
                        color: formColumns.length >= MAX_COLUMNS_PER_VIEW ? "var(--negative)" : "var(--accent)"
                      }}
                    >
                      ({formColumns.length} / {MAX_COLUMNS_PER_VIEW} selected)
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder="Filter metrics..."
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    style={{
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.75rem",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      color: "var(--text)",
                      width: "180px"
                    }}
                  />
                </div>

                {/* Selected Columns Chips */}
                {formColumns.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.75rem", padding: "0.4rem", background: "var(--surface)", borderRadius: "var(--radius)" }}>
                    {formColumns.map((colKey) => {
                      const isUnavail = formUnavailable.includes(colKey);
                      const label = ALL_CATALOG_METRICS[colKey]?.label ?? colKey;
                      return (
                        <span
                          key={colKey}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            background: "var(--surface-raised)",
                            border: `1px solid ${isUnavail ? "var(--accent)" : "var(--border)"}`,
                            borderRadius: "12px",
                            padding: "0.15rem 0.5rem",
                            fontSize: "0.72rem",
                            fontFamily: "var(--font-mono)"
                          }}
                        >
                          {isUnavail && "🔒 "}
                          {label}
                          <button
                            type="button"
                            onClick={() => handleToggleColumn(colKey, isUnavail)}
                            style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer", fontSize: "0.7rem", padding: 0 }}
                            title={`Remove ${label}`}
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Available Metrics Grouped Checkboxes */}
                <div style={{ maxHeight: "240px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem", paddingRight: "0.3rem" }}>
                  {Object.entries(groupedMetrics).map(([groupName, cols]) => (
                    <div key={groupName}>
                      <span className="text-xs text-muted font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {groupName}
                      </span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: "0.3rem", marginTop: "0.25rem" }}>
                        {cols.map((col) => {
                          const isSelected = formColumns.includes(col.key);
                          const isDisabled = !isSelected && formColumns.length >= MAX_COLUMNS_PER_VIEW;

                          return (
                            <label
                              key={col.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                padding: "0.25rem 0.4rem",
                                background: isSelected ? "var(--surface-raised)" : "transparent",
                                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                                borderRadius: "var(--radius)",
                                cursor: isDisabled ? "not-allowed" : "pointer",
                                opacity: isDisabled ? 0.4 : 1,
                                fontSize: "0.75rem"
                              }}
                              title={col.tooltip}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isDisabled}
                                onChange={() => handleToggleColumn(col.key, col.unavailable)}
                              />
                              <span style={{ fontWeight: isSelected ? 600 : 400, color: "var(--text)" }}>
                                {col.unavailable ? "🔒 " : ""}
                                {col.label}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("list")}
                  className="button button-small"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-small button-primary"
                  disabled={saving}
                >
                  {saving ? "Saving…" : editingViewId ? "Save Changes" : "Create View"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: EXPORT / IMPORT & RESET */}
          {activeTab === "import_export" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Export Section */}
              <div
                style={{
                  padding: "1rem",
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)"
                }}
              >
                <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>
                  Export Workspace Bundle
                </strong>
                <p className="text-xs text-muted" style={{ margin: "0.3rem 0 0.75rem" }}>
                  Download a portable JSON bundle containing custom views, favorite players, compare tray, ranking boards, tier lists, and layout preferences with a canonical SHA-256 checksum.
                </p>
                <button
                  type="button"
                  onClick={handleExport}
                  className="button button-small button-primary"
                >
                  ⬇ Export Bundle (.json)
                </button>
              </div>

              {/* Import Section */}
              <div
                style={{
                  padding: "1rem",
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)"
                }}
              >
                <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>
                  Import Workspace Bundle
                </strong>
                <p className="text-xs text-muted" style={{ margin: "0.3rem 0 0.5rem" }}>
                  Upload a previously exported workspace JSON file or paste its contents below. Verifies bundle version 1.0 and SHA-256 checksum prior to persistence.
                </p>

                <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.5rem" }}>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    style={{ fontSize: "0.75rem" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span className="text-xs text-muted">Conflict mode:</span>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as ImportConflictMode)}
                      style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text)" }}
                    >
                      <option value="merge">Merge (combine favorites &amp; views)</option>
                      <option value="replace">Replace (overwrite entire workspace)</option>
                    </select>
                  </div>
                </div>

                <textarea
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder="Paste JSON workspace bundle here..."
                  rows={4}
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.72rem",
                    padding: "0.5rem",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--text)",
                    resize: "vertical"
                  }}
                />

                {importStatus && (
                  <div
                    className="notice-box"
                    style={{
                      borderLeftColor: importStatus.startsWith("Success") ? "var(--positive)" : "var(--negative)",
                      margin: "0.5rem 0 0"
                    }}
                  >
                    <span style={{ fontSize: "0.78rem" }}>{importStatus}</span>
                  </div>
                )}

                <div style={{ marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={handleImportSubmit}
                    disabled={!importJsonText.trim()}
                    className="button button-small button-primary"
                  >
                    Verify &amp; Import Bundle
                  </button>
                </div>
              </div>

              {/* Reset Section */}
              <div
                style={{
                  padding: "1rem",
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)"
                }}
              >
                <strong style={{ fontSize: "0.85rem", color: "var(--negative)" }}>
                  Danger Zone: Reset Workspace
                </strong>
                <p className="text-xs text-muted" style={{ margin: "0.3rem 0 0.75rem" }}>
                  Reset all custom views, ranking boards, tier lists, and preferences to original defaults. This action cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="button button-small"
                  style={{ borderColor: "var(--negative)", color: "var(--negative)" }}
                >
                  ⚠ Reset to Defaults
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="text-xs text-muted font-mono">
            Workspace ID: default
          </span>
          <button type="button" className="button button-small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
