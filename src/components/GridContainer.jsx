import { createElement, useMemo, useRef, useCallback, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

import { useTemplateConfig }   from "../hooks/useTemplateConfig";
import { useColumnConfigs }    from "../hooks/useColumnConfig";
import { useColumnDefs }       from "../hooks/useColumnDefs";
import { useEditingEngine }    from "../hooks/useEditingEngine";
import { useValidationEngine } from "../hooks/useValidationEngine";
import { useServerPagination } from "../hooks/useServerPagination";
import { buildRowData }        from "../services/mendixService";
import { GridToolbar }         from "./GridToolbar";
import { LoadingOverlay, NoRowsOverlay } from "./LoadingOverlay";

if (typeof document !== "undefined" && !document.getElementById("ag-widget-styles")) {
    const style = document.createElement("style");
    style.id = "ag-widget-styles";
    style.textContent = `
        @keyframes ag-grid-widget-spin { to { transform: rotate(360deg); } }
        .ag-row-dirty .ag-cell { background-color: #fef9c3 !important; }
    `;
    document.head.appendChild(style);
}

/**
 * GridContainer — config-driven AG Grid spreadsheet widget.
 *
 * DATA FLOW:
 *   dataSource       → row data (actual entity records)
 *   columnMappings   → which entity attributes map to which column keys
 *   columnConfigs    → metadata from SpreadsheetColumnConfig (admin-defined)
 *   templateSource   → feature flags from SpreadsheetTemplate (admin-defined)
 *   dropdownOptions  → dropdown values from DropdownOption (admin-defined)
 *
 * SAVE FLOW (Manual):
 *   1. User clicks Save
 *   2. saveAll() → setValue() for all dirty rows → fire onSave microflow
 *   3. localOverrides NOT cleared yet → cells keep showing new values
 *   4. Microflow commits to DB → Mendix refreshes datasource
 *   5. useEffect detects dataSource.items changed → clearAfterSave()
 *   6. localOverrides cleared → cells rebuild from committed Mendix values
 *   7. No rollback ✅
 */
export function GridContainer(props) {
    const {
        dataSource,
        columnMappings = [],
        onSave,
        onPageChange,
    } = props;

    const gridRef = useRef(null);

    // Tracks whether a save is in progress
    // Used to know when the next datasource refresh is a post-save refresh
    const saveInProgress = useRef(false);

    // ── 1. Read template feature flags ────────────────────────────
    const config = useTemplateConfig(props);

    // ── 2. Parse column configs from Mendix entities ──────────────
    const parsedConfigs = useColumnConfigs(props);

    // ── 3. Build AG Grid column definitions ───────────────────────
    const columnDefs = useColumnDefs(
        parsedConfigs,
        config.editable,
        config.rowSelection,
        config.enableFiltering,
        config.enableColumnResize
    );

    // ── 4. Editing engine ─────────────────────────────────────────
    const {
        handleChange,
        saveAll,
        clearAfterSave,
        undo,
        redo,
        canUndo,
        canRedo,
        dirtyRows,
        localOverrides,
        hasDirtyRows,
        dirtyTick,
    } = useEditingEngine(dataSource, columnMappings, parsedConfigs, onSave, config.saveMode);

    // ── 5. Row data — merge localOverrides to prevent blinking ────
    const isLoading = !dataSource || dataSource.status === "loading";
    const isError   = dataSource?.status === "unavailable";
    const hasData   = dataSource?.status === "available";

    const rowData = useMemo(() => {
        if (!hasData || !columnMappings.length) return [];
        return dataSource.items.map(item => {
            const base      = buildRowData(item, columnMappings);
            const overrides = localOverrides.current.get(item.id);
            // Merge overrides so cell shows new value without waiting
            // for Mendix to re-render — this prevents blinking
            return overrides ? { ...base, ...overrides } : base;
        });
    }, [dataSource?.items, dataSource?.status, columnMappings, dirtyTick]);

    // ── 6. Clear dirty state after microflow commits ───────────────
    // When saveInProgress is true and the datasource refreshes,
    // it means the microflow has committed the new values to DB.
    // Now it is safe to clear localOverrides without visual rollback.
    useEffect(() => {
        if (!saveInProgress.current) return;
        if (dataSource?.status !== "available") return;

        // Datasource just refreshed after microflow commit
        // Mendix entity values now match what the user typed
        // Safe to clear overrides — cells will rebuild from DB values
        saveInProgress.current = false;
        clearAfterSave();

    }, [dataSource?.items, dataSource?.status, clearAfterSave]);

    // ── 7. Save wrapper — sets saveInProgress before saving ───────
    const handleSaveAll = useCallback(() => {
        if (!hasDirtyRows()) return;
        // Mark that we are waiting for a post-save datasource refresh
        saveInProgress.current = true;
        saveAll();
    }, [saveAll, hasDirtyRows]);

    // ── 8. Validation ─────────────────────────────────────────────
    const { validate } = useValidationEngine(parsedConfigs);

    // ── 9. Cell value changed ─────────────────────────────────────
    const onCellValueChanged = useCallback(params => {
        if (!validate(params)) return;
        handleChange(params);
    }, [validate, handleChange]);

    // ── 10. Pagination ────────────────────────────────────────────
    useServerPagination(gridRef, onPageChange);

    // ── 11. Row class (dirty = yellow) ────────────────────────────
    const getRowClass = useCallback(params => {
        if (!config.highlightDirtyRows) return "";
        return dirtyRows.current.has(params.data?._mendixId) ? "ag-row-dirty" : "";
    }, [dirtyRows, config.highlightDirtyRows]);

    // ── 12. Overlays ──────────────────────────────────────────────
    useEffect(() => {
        const api = gridRef.current?.api;
        if (!api) return;
        if (isLoading) api.showLoadingOverlay();
        else if (!rowData.length) api.showNoRowsOverlay();
        else api.hideOverlay();
    }, [isLoading, rowData.length]);

    // ── Default col def ───────────────────────────────────────────
    const defaultColDef = useMemo(() => ({
        sortable:         true,
        filter:           config.enableFiltering,
        resizable:        config.enableColumnResize,
        editable:         false,
        suppressMovable:  false,
        wrapHeaderText:   true,
        autoHeaderHeight: true,
    }), [config.enableFiltering, config.enableColumnResize]);

    const gridThemeClass = `ag-theme-${config.gridTheme.replace("_", "-")}`;

    const rowSelectionProp = config.rowSelection === "multiple"
        ? { mode: "multiRow", checkboxes: true, headerCheckbox: true }
        : config.rowSelection === "single"
        ? { mode: "singleRow" }
        : undefined;

    // ── Error state ───────────────────────────────────────────────
    if (isError) {
        return (
            <div style={styles.errorBox}>
                ⚠ Data source unavailable. Check widget configuration.
            </div>
        );
    }

    // ── Column config loading ─────────────────────────────────────
    const configLoading = props.columnConfigSource &&
                          props.columnConfigSource.status === "loading";
    if (configLoading) {
        return (
            <div style={styles.infoBox}>
                Loading column configuration...
            </div>
        );
    }

    // ── No column configs wired ───────────────────────────────────
    if (!parsedConfigs.length && !configLoading) {
        return (
            <div style={styles.infoBox}>
                No column configuration found. Wire up the Column Config Source
                to your SpreadsheetColumnConfig datasource in Studio Pro.
            </div>
        );
    }

    return (
        <div style={{ width: "100%", fontFamily: "inherit" }}>

            <GridToolbar
                gridRef={gridRef}
                saveAll={handleSaveAll}
                undo={undo}
                redo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                saveMode={config.saveMode}
                hasDirtyRows={hasDirtyRows}
                editable={config.editable}
                showToolbar={true}
                enableGlobalSearch={true}
                enableCSVExport={config.enableCSVExport}
                enableColumnPanel={true}
                enableAutoSizeColumns={true}
                enableResetFilters={config.enableFiltering}
                columnDefs={columnDefs}
            />

            <div className={gridThemeClass} style={{ height: config.gridHeight, width: "100%" }}>
                <AgGridReact
                    ref={gridRef}

                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}

                    // CRITICAL: prevents blink — AG Grid tracks rows by Mendix GUID
                    // not by array index, so row re-order / re-render doesn't reset cells
                    getRowId={params => params.data._mendixId}

                    pagination={config.enablePagination}
                    paginationPageSize={config.pageSize}
                    paginationPageSizeSelector={[10, 20, 50, 100, 200]}

                    rowSelection={rowSelectionProp}

                    stopEditingWhenCellsLoseFocus={true}
                    enterNavigatesVertically={true}
                    enterNavigatesVerticallyAfterEdit={true}

                    animateRows={true}
                    enableCellTextSelection={true}
                    multiSortKey="ctrl"
                    tooltipShowDelay={500}

                    loadingOverlayComponent={LoadingOverlay}
                    noRowsOverlayComponent={NoRowsOverlay}

                    onCellValueChanged={onCellValueChanged}
                    getRowClass={getRowClass}
                />
            </div>

            {config.saveMode === "manual" && config.highlightDirtyRows && (
                <div style={styles.footer}>
                    <span style={styles.footerDot} />
                    Rows highlighted in yellow have unsaved changes
                </div>
            )}
        </div>
    );
}

const styles = {
    errorBox: {
        padding: 16,
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        borderRadius: 6,
        color: "#dc2626",
        fontSize: 13,
    },
    infoBox: {
        padding: 16,
        background: "#f0f9ff",
        border: "1px solid #bae6fd",
        borderRadius: 6,
        color: "#0369a1",
        fontSize: 13,
    },
    footer: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
        fontSize: 11,
        color: "#9ca3af",
    },
    footerDot: {
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: 2,
        background: "#fef9c3",
        border: "1px solid #fde047",
    },
};