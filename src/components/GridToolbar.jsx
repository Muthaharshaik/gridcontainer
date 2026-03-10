import { createElement, useState, useCallback, useRef, useEffect } from "react";

/**
 * GridToolbar
 *
 * Toolbar with: Search | Undo | Redo | Reset Filters | Auto-Size | Columns | Export CSV | Save
 * Undo/Redo only shown when editable.
 * All buttons togglable via template config.
 *
 * NOTE: No React fragments (<> </>) used — Mendix requires createElement compatibility.
 */
export function GridToolbar({
    gridRef,
    saveAll,
    undo,
    redo,
    canUndo,
    canRedo,
    saveMode,
    hasDirtyRows,
    // Feature toggles (from template or fallback)
    showToolbar           = true,
    enableGlobalSearch    = true,
    enableCSVExport       = true,
    enableColumnPanel     = true,
    enableAutoSizeColumns = true,
    enableResetFilters    = true,
    editable              = true,
    columnDefs            = [],
}) {
    const [searchValue,  setSearchValue]  = useState("");
    const [colPanelOpen, setColPanelOpen] = useState(false);
    const [hiddenCols,   setHiddenCols]   = useState({});
    const [, forceRender] = useState(0);
    const colPanelRef    = useRef(null);
    const searchDebounce = useRef(null);

    // Close column panel on outside click
    useEffect(() => {
        if (!colPanelOpen) return;
        const handler = e => {
            if (colPanelRef.current && !colPanelRef.current.contains(e.target)) {
                setColPanelOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [colPanelOpen]);

    // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
    useEffect(() => {
        if (!editable) return;
        const handler = e => {
            if (e.target.closest(".ag-cell-editor")) return;

            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
                e.preventDefault();
                undo?.(gridRef.current?.api);
                forceRender(r => r + 1);
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
                e.preventDefault();
                redo?.(gridRef.current?.api);
                forceRender(r => r + 1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [undo, redo, editable, gridRef]);

    // ── Search ─────────────────────────────────────────────────────
    const handleSearchChange = useCallback(e => {
        const v = e.target.value;
        setSearchValue(v);
        clearTimeout(searchDebounce.current);
        searchDebounce.current = setTimeout(() => {
            gridRef.current?.api?.setGridOption("quickFilterText", v);
        }, 250);
    }, [gridRef]);

    const clearSearch = useCallback(() => {
        setSearchValue("");
        gridRef.current?.api?.setGridOption("quickFilterText", "");
    }, [gridRef]);

    // ── Export ─────────────────────────────────────────────────────
    const handleExport = useCallback(() => {
        gridRef.current?.api?.exportDataAsCsv({
            fileName: `export_${new Date().toISOString().slice(0, 10)}.csv`,
        });
    }, [gridRef]);

    // ── Auto-size ──────────────────────────────────────────────────
    const handleAutoSize = useCallback(() => {
        gridRef.current?.api?.autoSizeAllColumns();
    }, [gridRef]);

    // ── Reset filters ──────────────────────────────────────────────
    const handleResetFilters = useCallback(() => {
        gridRef.current?.api?.setFilterModel(null);
        clearSearch();
    }, [gridRef, clearSearch]);

    // ── Column visibility ──────────────────────────────────────────
    const toggleColumn = useCallback((field, visible) => {
        gridRef.current?.api?.setColumnsVisible([field], visible);
        setHiddenCols(prev => ({ ...prev, [field]: !visible }));
    }, [gridRef]);

    if (!showToolbar) return null;

    const dirty      = hasDirtyRows?.();
    const canUndoNow = editable && canUndo?.();
    const canRedoNow = editable && canRedo?.();
    const toggleableCols = columnDefs.filter(c => c.field && c.field !== "__checkbox__");

    return (
        <div style={styles.toolbar}>

            {/* LEFT: Search */}
            {enableGlobalSearch && (
                <div style={styles.searchWrapper}>
                    <span style={styles.searchIcon}>🔍</span>
                    <input
                        type="text"
                        placeholder="Search all columns..."
                        value={searchValue}
                        onChange={handleSearchChange}
                        style={styles.searchInput}
                    />
                    {searchValue && (
                        <button onClick={clearSearch} style={styles.clearBtn}>✕</button>
                    )}
                </div>
            )}

            {/* RIGHT: Action buttons */}
            <div style={styles.right}>

                {/* Undo / Redo — wrapped in a div instead of a fragment */}
                {editable && (
                    <div style={styles.undoRedoGroup}>
                        <Btn
                            onClick={() => { undo?.(gridRef.current?.api); forceRender(r => r + 1); }}
                            disabled={!canUndoNow}
                            title="Undo last edit (Ctrl+Z)"
                        >↩ Undo</Btn>
                        <Btn
                            onClick={() => { redo?.(gridRef.current?.api); forceRender(r => r + 1); }}
                            disabled={!canRedoNow}
                            title="Redo (Ctrl+Y)"
                        >↪ Redo</Btn>
                    </div>
                )}

                {enableResetFilters && (
                    <Btn onClick={handleResetFilters} title="Reset all filters">🔄 Reset Filters</Btn>
                )}

                {enableAutoSizeColumns && (
                    <Btn onClick={handleAutoSize} title="Auto-size columns">↔ Auto-Size</Btn>
                )}

                {/* Column visibility panel */}
                {enableColumnPanel && toggleableCols.length > 0 && (
                    <div style={{ position: "relative" }} ref={colPanelRef}>
                        <Btn
                            onClick={() => setColPanelOpen(p => !p)}
                            active={colPanelOpen}
                            title="Show/hide columns"
                        >☰ Columns</Btn>
                        {colPanelOpen && (
                            <div style={styles.dropdown}>
                                <div style={styles.dropdownTitle}>Column Visibility</div>
                                {toggleableCols.map(col => {
                                    const isHidden = hiddenCols[col.field] ?? (col.hide ?? false);
                                    return (
                                        <label key={col.field} style={styles.dropdownItem}>
                                            <input
                                                type="checkbox"
                                                checked={!isHidden}
                                                onChange={e => toggleColumn(col.field, e.target.checked)}
                                                style={{ marginRight: 6 }}
                                            />
                                            {col.headerName || col.field}
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {enableCSVExport && (
                    <Btn onClick={handleExport} title="Export to CSV">⬇ Export CSV</Btn>
                )}

                {saveMode === "manual" && (
                    <Btn
                        onClick={saveAll}
                        variant={dirty ? "primary" : "default"}
                        title="Save all pending changes"
                    >
                        💾 {dirty ? "Save Changes •" : "Save Changes"}
                    </Btn>
                )}
            </div>
        </div>
    );
}

function Btn({ onClick, title, children, variant, active, disabled }) {
    const s = disabled          ? styles.btnDisabled
            : variant === "primary" ? styles.btnPrimary
            : active            ? styles.btnActive
            : styles.btn;
    return (
        <button onClick={disabled ? undefined : onClick} title={title} style={s}>
            {children}
        </button>
    );
}

const styles = {
    toolbar: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        padding: "8px 4px",
        marginBottom: 4,
    },
    right: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
    },
    // Wrapper for Undo + Redo pair — replaces the fragment
    undoRedoGroup: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    searchWrapper: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        flex: 1,
        maxWidth: 300,
        minWidth: 160,
    },
    searchIcon: {
        position: "absolute",
        left: 8,
        fontSize: 13,
        pointerEvents: "none",
    },
    searchInput: {
        width: "100%",
        paddingLeft: 28,
        paddingRight: 28,
        paddingTop: 6,
        paddingBottom: 6,
        border: "1px solid #d1d5db",
        borderRadius: 6,
        fontSize: 13,
        outline: "none",
        background: "#fff",
        color: "#374151",
        boxSizing: "border-box",
    },
    clearBtn: {
        position: "absolute",
        right: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#9ca3af",
        fontSize: 12,
        padding: 0,
    },
    btn: {
        padding: "5px 10px",
        fontSize: 12,
        border: "1px solid #d1d5db",
        borderRadius: 6,
        background: "#fff",
        color: "#374151",
        cursor: "pointer",
        whiteSpace: "nowrap",
    },
    btnActive: {
        padding: "5px 10px",
        fontSize: 12,
        border: "1px solid #3b82f6",
        borderRadius: 6,
        background: "#eff6ff",
        color: "#1d4ed8",
        cursor: "pointer",
        whiteSpace: "nowrap",
    },
    btnPrimary: {
        padding: "5px 12px",
        fontSize: 12,
        border: "1px solid #2563eb",
        borderRadius: 6,
        background: "#3b82f6",
        color: "#fff",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: 600,
    },
    btnDisabled: {
        padding: "5px 10px",
        fontSize: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        background: "#f9fafb",
        color: "#d1d5db",
        cursor: "default",
        whiteSpace: "nowrap",
    },
    dropdown: {
        position: "absolute",
        top: "calc(100% + 4px)",
        right: 0,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        minWidth: 180,
        zIndex: 1000,
        padding: "8px 0",
    },
    dropdownTitle: {
        padding: "4px 12px 8px",
        fontSize: 11,
        fontWeight: 700,
        color: "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderBottom: "1px solid #f3f4f6",
        marginBottom: 4,
    },
    dropdownItem: {
        display: "flex",
        alignItems: "center",
        padding: "5px 12px",
        fontSize: 13,
        color: "#374151",
        cursor: "pointer",
        userSelect: "none",
    },
};