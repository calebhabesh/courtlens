"use client";

import { Icon } from "./ui/icon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { ALL_CATALOG_METRICS, IMPACT_COLUMNS, isV4Column } from "@/lib/stats-presets";
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
  /** Open straight into a new-view editor (the Stats "Add View" button) instead of the list. */
  startWithNewView?: boolean;
  onSelectView?: (viewId: string) => void;
}

type ModalTab = "list" | "editor" | "import_export";

const MAX_CUSTOM_VIEWS = 10;
const MAX_COLUMNS_PER_VIEW = 25;

export function ManageViewsModal({
  isOpen,
  onClose,
  activeViewId,
  startWithNewView = false,
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

  // Each opening starts on the tab its trigger asked for.
  const [openedState, setOpenedState] = useState(false);
  if (isOpen !== openedState) {
    setOpenedState(isOpen);
    if (isOpen && startWithNewView && views.length < MAX_CUSTOM_VIEWS) handleOpenAddView();
    else if (isOpen) setActiveTab("list");
  }

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
      const metricVersion = formColumns.some(isV4Column) ? "courtlens-stats-v4"
        : formColumns.some(key => key in IMPACT_COLUMNS) ? "courtlens-stats-v3" : "v2";
      const unavailable = formUnavailable.filter(key => !(key in IMPACT_COLUMNS) && !isV4Column(key));
      if (editingViewId) {
        await updateCustomView(editingViewId, {
          name: formName.trim(),
          columns: formColumns,
          metric_version: metricVersion,
          unavailable_columns: unavailable,
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
          metric_version: metricVersion,
          unavailable_columns: unavailable,
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
      a.download = `courtlens-workspace-bundle-${new Date().toISOString().slice(0, 10)}.json`;
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
        className="modal-card views-modal-card"
        ref={modalRef}
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
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Conflict Notice if any */}
        {conflictNotice && (
          <div className="notice-box views-modal-notice">
            <span className="views-modal-notice-text">{conflictNotice}</span>
            <button
              type="button"
              className="button button-small views-modal-notice-dismiss"
              onClick={clearConflictNotice}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div className="views-modal-tabs">
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
            {editingViewId ? "Edit View" : <><Icon name="plus" size={14} />Add View</>}
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
        <div className="modal-body views-modal-body">
          {/* TAB 1: LIST VIEWS */}
          {activeTab === "list" && (
            <div className="views-modal-list">
              <div className="views-modal-list-header">
                <span className="text-xs text-muted">
                  Personal views saved: <strong>{views.length}</strong> / {MAX_CUSTOM_VIEWS}. Use keyboard buttons to reorder.
                </span>
                <button
                  type="button"
                  onClick={handleOpenAddView}
                  disabled={views.length >= MAX_CUSTOM_VIEWS}
                  className="button button-small button-primary"
                >
                  <Icon name="plus" size={14} />Create View
                </button>
              </div>

              {views.length === 0 ? (
                <div className="views-modal-empty">
                  <p className="text-muted views-modal-empty-p">
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
                <div className="views-modal-items">
                  {views.map((view, idx) => {
                    const isDefault = view.id === defaultViewId || view.is_default;
                    const isActive = view.id === activeViewId;
                    const hasUnavailable = (view.unavailable_columns?.length ?? 0) > 0;

                    return (
                      <div
                        key={view.id}
                        className={`views-modal-row ${isActive ? "is-active" : ""}`}
                      >
                        <div className="views-modal-row-left">
                          <span className="font-mono text-muted text-xs views-modal-row-idx">
                            {idx + 1}.
                          </span>
                          <strong className="views-modal-row-name">
                            {view.name}
                          </strong>
                          {isDefault && (
                            <span className="replica-badge-active" title="Default view on Stats explorer">
                              <Icon name="star" size={14} filled />Default
                            </span>
                          )}
                          {hasUnavailable && (
                            <span className="replica-badge-gated" title="Contains unavailable metrics (preserved)">
                              <Icon name="lock" size={14} />{view.unavailable_columns?.length} unavailable
                            </span>
                          )}
                          <span className="text-xs text-muted font-mono">
                            ({view.columns.length}/25 cols · sort: {view.sort_field || "pts"})
                          </span>
                        </div>

                        <div className="views-modal-row-actions">
                          {/* Reorder Buttons */}
                          <button
                            type="button"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            className="button button-small views-modal-btn-icon"
                            title="Move view up"
                            aria-label={`Move ${view.name} up`}
                          >
                            <Icon name="chevron-up" size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === views.length - 1}
                            className="button button-small views-modal-btn-icon"
                            title="Move view down"
                            aria-label={`Move ${view.name} down`}
                          >
                            <Icon name="chevron-down" size={14} />
                          </button>

                          {/* Set Default */}
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(view.id)}
                              className="button button-small views-modal-btn-action"
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
                              className="button button-small button-primary views-modal-btn-action"
                            >
                              Open
                            </button>
                          )}

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditView(view)}
                            className="button button-small views-modal-btn-action"
                          >
                            Edit
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDelete(view.id)}
                            className="button button-small views-modal-btn-danger"
                            title="Delete custom view"
                            aria-label={`Delete ${view.name}`}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Built-in Presets Info */}
              <div className="views-modal-preset-card">
                <div className="views-modal-list-header">
                  <div>
                    <strong className="text-sm font-semibold">
                      Built-in Presets
                    </strong>
                    <p className="text-xs text-muted mt-1">
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
                    className="button button-small whitespace-nowrap"
                  >
                    Inspect Presets
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VIEW EDITOR (ADD / EDIT) */}
          {activeTab === "editor" && (
            <form onSubmit={handleSaveView} className="views-modal-form">
              {errorMessage && (
                <div className="notice-box notice-box-error m-0">
                  <strong className="text-negative">Validation Error:</strong> {errorMessage}
                </div>
              )}

              {/* Name & Default row */}
              <div className="views-modal-form-row">
                <div className="views-modal-form-col">
                  <label htmlFor="custom-view-name" className="text-xs font-semibold text-muted views-modal-label">
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
                    className="views-modal-input"
                  />
                </div>

                <div className="views-modal-row-actions mt-4">
                  <label className="views-modal-checkbox-label">
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
              <div className="views-modal-form-row">
                <div className="views-modal-col-select">
                  <label htmlFor="custom-view-sort" className="text-xs font-semibold text-muted views-modal-label">
                    Default Sort Field
                  </label>
                  <select
                    id="custom-view-sort"
                    value={formSortField}
                    onChange={(e) => setFormSortField(e.target.value)}
                    className="views-modal-select"
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
                  <label htmlFor="custom-view-dir" className="text-xs font-semibold text-muted views-modal-label">
                    Sort Direction
                  </label>
                  <select
                    id="custom-view-dir"
                    value={formSortDirection}
                    onChange={(e) => setFormSortDirection(e.target.value as "asc" | "desc")}
                    className="views-modal-select"
                  >
                    <option value="desc">Descending (High to Low)</option>
                    <option value="asc">Ascending (Low to High)</option>
                  </select>
                </div>
              </div>

              {/* Preserved Unavailable Columns Notice */}
              {formUnavailable.length > 0 && (
                <div className="notice-box notice-box-warning m-0 p-2">
                  <strong className="text-xs">Explicit Unavailable Columns:</strong>
                  <span className="text-xs text-muted ml-2">
                    {formUnavailable.join(", ")} (preserved under contract rules).
                  </span>
                </div>
              )}

              {/* Column Selection Header & Filter */}
              <div className="views-modal-metric-filter">
                <div className="views-modal-metric-filter-header">
                  <div>
                    <strong className="text-sm font-semibold">
                      Select Metric Columns
                    </strong>
                    <span
                      className={`font-mono text-xs ml-2 ${formColumns.length >= MAX_COLUMNS_PER_VIEW ? "text-negative" : "text-accent"}`}
                    >
                      ({formColumns.length} / {MAX_COLUMNS_PER_VIEW} selected)
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder="Filter metrics..."
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    className="views-modal-input w-44"
                  />
                </div>

                {/* Selected Columns Chips */}
                {formColumns.length > 0 && (
                  <div className="views-modal-metric-chips">
                    {formColumns.map((colKey) => {
                      const isUnavail = formUnavailable.includes(colKey);
                      const label = ALL_CATALOG_METRICS[colKey]?.label ?? colKey;
                      return (
                        <span
                          key={colKey}
                          className={`views-modal-metric-chip ${isUnavail ? "is-unavail" : ""}`}
                        >
                          {isUnavail && <Icon name="lock" size={14} />}
                          {label}
                          <button
                            type="button"
                            onClick={() => handleToggleColumn(colKey, isUnavail)}
                            className="views-modal-metric-chip-remove"
                            title={`Remove ${label}`}
                            aria-label={`Remove ${label}`}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Available Metrics Grouped Checkboxes */}
                <div className="views-modal-metrics-grid-container">
                  {Object.entries(groupedMetrics).map(([groupName, cols]) => (
                    <div key={groupName}>
                      <span className="text-xs text-muted font-semibold tracking-wider uppercase">
                        {groupName}
                      </span>
                      <div className="views-modal-metrics-grid">
                        {cols.map((col) => {
                          const isSelected = formColumns.includes(col.key);
                          const isDisabled = !isSelected && formColumns.length >= MAX_COLUMNS_PER_VIEW;

                          return (
                            <label
                              key={col.key}
                              className={`views-modal-metric-label ${isSelected ? "is-selected" : ""} ${isDisabled ? "is-disabled" : ""}`}
                              title={col.tooltip}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isDisabled}
                                onChange={() => handleToggleColumn(col.key, col.unavailable)}
                              />
                              <span className={isSelected ? "font-semibold" : "font-normal"}>
                                {col.unavailable && <Icon name="lock" size={14} />}
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
              <div className="views-modal-form-row justify-end pt-3 border-t">
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
            <div className="views-modal-list">
              {/* Export Section */}
              <div className="views-modal-card-section">
                <strong className="text-sm font-semibold">
                  Export Workspace Bundle
                </strong>
                <p className="text-xs text-muted">
                  Download a portable JSON bundle containing custom views, favorite players, compare tray, ranking boards, tier lists, and layout preferences with a canonical SHA-256 checksum.
                </p>
                <button
                  type="button"
                  onClick={handleExport}
                  className="button button-small button-primary"
                >
                  <Icon name="download" size={14} />Export Bundle (.json)
                </button>
              </div>

              {/* Import Section */}
              <div className="views-modal-card-section">
                <strong className="text-sm font-semibold">
                  Import Workspace Bundle
                </strong>
                <p className="text-xs text-muted">
                  Upload a previously exported workspace JSON file or paste its contents below. Verifies bundle version 1.0 and SHA-256 checksum prior to persistence.
                </p>

                <div className="views-modal-form-row mb-2">
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="text-xs"
                  />
                  <div className="views-modal-row-actions">
                    <span className="text-xs text-muted">Conflict mode:</span>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as ImportConflictMode)}
                      className="views-modal-select"
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
                  className="views-modal-textarea"
                />

                {importStatus && (
                  <div
                    className={`notice-box ${importStatus.startsWith("Success") ? "notice-box-success" : "notice-box-error"} mt-2`}
                  >
                    <span className="text-xs">{importStatus}</span>
                  </div>
                )}

                <div className="mt-3">
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
              <div className="views-modal-card-section">
                <strong className="text-sm font-semibold text-negative">
                  Danger Zone: Reset Workspace
                </strong>
                <p className="text-xs text-muted">
                  Reset all custom views, ranking boards, tier lists, and preferences to original defaults. This action cannot be undone.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="button button-small text-negative border-negative"
                >
                  <Icon name="reset" size={14} />Reset to Defaults
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer views-modal-footer">
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
