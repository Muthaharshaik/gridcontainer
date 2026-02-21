import { createElement, useMemo, useRef, useCallback, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// ── AG Grid CSS (required — provides grid structure + theme styles) ─────────


// Register all community modules once at module level
ModuleRegistry.registerModules([AllCommunityModule]);

import { useEditingEngine }    from "../hooks/useEditingEngine";
import { useValidationEngine } from "../hooks/useValidationEngine";
import { useColumnDefs }       from "../hooks/useColumnDefs";
import { useServerPagination } from "../hooks/useServerPagination";
import { buildRowData }        from "../services/mendixService";
import { GridToolbar }         from "./GridToolbar";
import { LoadingOverlay, NoRowsOverlay } from "./LoadingOverlay";

// Only custom CSS we need — AG Grid's own themes handle everything else
if (typeof document !== "undefined" && !document.getElementById("ag-widget-styles")) {
    const style = document.createElement("style");
    style.id = "ag-widget-styles";
    style.textContent = `
        @keyframes ag-grid-widget-spin { to { transform: rotate(360deg); } }
        .ag-row-dirty .ag-cell { background-color: #fef9c3 !important; }
    `;
    document.head.appendChild(style);
}

export function GridContainer(props) {
    const {
        dataSource,
        columns             = [],
        onSave,
        onPageChange,
        editable            = true,
        saveMode            = "manual",
        highlightDirtyRows  = true,
        enablePagination    = true,
        pageSize            = 20,
        pageSizeSelector    = true,
        rowSelection        = "none",
        showToolbar         = true,
        enableGlobalSearch  = true,
        enableCSVExport     = true,
        enableColumnPanel   = true,
        enableAutoSizeColumns = true,
        enableResetFilters  = true,
        gridTheme           = "alpine",
        gridHeight          = 500,
        animateRows         = true,
    } = props;

    const gridRef = useRef(null);

    // ── Status ────────────────────────────────────────────────────
    const isLoading = !dataSource || dataSource.status === "loading";
    const isError   = dataSource?.status === "unavailable";
    const hasData   = dataSource?.status === "available";

    // ── Editing engine ────────────────────────────────────────────
    // Must be called before rowData so localOverrides ref is ready
    const { handleChange, saveAll, dirtyRows, localOverrides, hasDirtyRows } =
        useEditingEngine(dataSource, columns, onSave, saveMode);

    // ── Row data ──────────────────────────────────────────────────
    // localOverrides are merged on top of Mendix values so that cells
    // don't blink back to the old value when Mendix re-renders after setValue()
    const rowData = useMemo(() => {
        if (!hasData || !columns.length) return [];

        return dataSource.items.map((item, index) => {
            const base = buildRowData(item, columns, index);
            const overrides = localOverrides.current.get(item.id);
            // Merge overrides: keeps cell showing new value even if
            // Mendix triggers a datasource refresh after setValue()
            return overrides ? { ...base, ...overrides } : base;
        });
    }, [dataSource?.items, dataSource?.status, columns]);

    // ── Column definitions ────────────────────────────────────────
    const columnDefs = useColumnDefs(columns, editable, rowSelection);

    const defaultColDef = useMemo(() => ({
        sortable: true,
        filter: true,
        resizable: true,
        editable: false,
        suppressMovable: false,
        wrapHeaderText: true,
        autoHeaderHeight: true,
    }), []);

    // ── Validation ────────────────────────────────────────────────
    const { validate } = useValidationEngine(columns);

    // ── Pagination ────────────────────────────────────────────────
    useServerPagination(gridRef, onPageChange);

    // ── Row class for dirty highlight ─────────────────────────────
    const getRowClass = useCallback((params) => {
        if (!highlightDirtyRows) return "";
        return dirtyRows.current.has(params.data?._mendixId) ? "ag-row-dirty" : "";
    }, [dirtyRows, highlightDirtyRows]);

    // ── Cell value changed ────────────────────────────────────────
    const onCellValueChanged = useCallback((params) => {
        if (!validate(params)) return;
        handleChange(params);
    }, [validate, handleChange]);

    // ── Overlays ──────────────────────────────────────────────────
    useEffect(() => {
        const api = gridRef.current?.api;
        if (!api) return;
        if (isLoading) api.showLoadingOverlay();
        else if (!rowData.length) api.showNoRowsOverlay();
        else api.hideOverlay();
    }, [isLoading, rowData.length]);

    // ── Theme ─────────────────────────────────────────────────────
    const gridThemeClass = `ag-theme-${gridTheme.replace("_", "-")}`;

    if (isError) {
        return (
            <div style={styles.errorBox}>
                ⚠ Data source unavailable. Please check widget configuration.
            </div>
        );
    }

    const rowSelectionProp = rowSelection === "multiple"
        ? { mode: "multiRow", checkboxes: true, headerCheckbox: true }
        : rowSelection === "single"
        ? { mode: "singleRow" }
        : undefined;

    return (
        <div style={{ width: "100%", fontFamily: "inherit" }}>

            <GridToolbar
                gridRef={gridRef}
                saveAll={saveAll}
                saveMode={saveMode}
                hasDirtyRows={hasDirtyRows}
                showToolbar={showToolbar}
                enableGlobalSearch={enableGlobalSearch}
                enableCSVExport={enableCSVExport}
                enableColumnPanel={enableColumnPanel}
                enableAutoSizeColumns={enableAutoSizeColumns}
                enableResetFilters={enableResetFilters}
                columnDefs={columnDefs}
            />

            <div className={gridThemeClass} style={{ height: gridHeight, width: "100%" }}>
                <AgGridReact
                    ref={gridRef}

                    // Data
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}

                    // getRowId is CRITICAL to prevent blinking —
                    // tells AG Grid to identify rows by Mendix GUID
                    // instead of array index, so it doesn't reset
                    // edited cells when rowData prop updates
                    getRowId={(params) => params.data._mendixId}

                    // Pagination
                    pagination={enablePagination}
                    paginationPageSize={pageSize}
                    paginationPageSizeSelector={pageSizeSelector ? [10, 20, 50, 100, 200] : false}

                    // Selection
                    rowSelection={rowSelectionProp}

                    // Editing
                    stopEditingWhenCellsLoseFocus={true}
                    enterNavigatesVertically={true}
                    enterNavigatesVerticallyAfterEdit={true}

                    // UX
                    animateRows={animateRows}
                    enableCellTextSelection={true}
                    multiSortKey="ctrl"
                    tooltipShowDelay={500}

                    // Overlays
                    loadingOverlayComponent={LoadingOverlay}
                    noRowsOverlayComponent={NoRowsOverlay}

                    // Callbacks
                    onCellValueChanged={onCellValueChanged}
                    getRowClass={getRowClass}
                />
            </div>

            {saveMode === "manual" && highlightDirtyRows && (
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