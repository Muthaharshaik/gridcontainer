import { useMemo, createElement } from "react";

/**
 * useColumnDefs
 *
 * Converts parsedConfigs (from useColumnConfigs) into AG Grid columnDefs.
 *
 * KEY CHANGE: field is now the ColumnKey string (e.g. "Name", "Age")
 * instead of positional "col_0", "col_1". This makes the data
 * self-describing and independent of column order changes.
 *
 * @param parsedConfigs  - array from useColumnConfigs
 * @param globalEditable - master editable switch from template/fallback
 * @param rowSelection   - "none" | "single" | "multiple"
 * @param enableFiltering - from template config
 * @param enableColumnResize - from template config
 */
export function useColumnDefs(
    parsedConfigs,
    globalEditable,
    rowSelection,
    enableFiltering     = true,
    enableColumnResize  = true
) {
    return useMemo(() => {
        if (!parsedConfigs || parsedConfigs.length === 0) return [];

        const defs = parsedConfigs.map(cfg => {
            const isEditable = globalEditable && cfg.isEditable;

            return {
                // Use ColumnKey as field — meaningful and stable
                field:      cfg.columnKey,
                headerName: cfg.displayName || cfg.columnKey,

                editable:   isEditable,
                sortable:   true,
                filter:     enableFiltering ? getFilter(cfg.dataType) : false,
                resizable:  enableColumnResize,
                width:      cfg.width || 150,
                minWidth:   80,

                cellEditor:       getCellEditor(cfg),
                cellEditorParams: getCellEditorParams(cfg),
                cellRenderer:     getCellRenderer(cfg.dataType),
                valueParser:      getValueParser(cfg.dataType),
                filterParams:     getFilterParams(cfg.dataType),

                // Store config on the colDef so validation engine can access it
                // without needing a separate lookup
                _cfg: cfg,

                tooltipField: cfg.columnKey,
            };
        });

        // Checkbox column for multi-select
        if (rowSelection === "multiple") {
            defs.unshift({
                headerCheckboxSelection: true,
                checkboxSelection:       true,
                width:        50,
                minWidth:     50,
                maxWidth:     50,
                pinned:       "left",
                resizable:    false,
                sortable:     false,
                filter:       false,
                editable:     false,
                field:        "__checkbox__",
                headerName:   "",
                lockPosition: true,
                suppressMovable: true,
            });
        }

        return defs;
    }, [parsedConfigs, globalEditable, rowSelection, enableFiltering, enableColumnResize]);
}

// ─── Helpers ──────────────────────────────────────────────────────

function getFilter(dataType) {
    switch (dataType) {
        case "Number":   return "agNumberColumnFilter";
        case "Date":     return "agDateColumnFilter";
        case "Boolean":  return false;
        default:         return "agTextColumnFilter";
    }
}

function getFilterParams(dataType) {
    if (dataType === "Number") {
        return {
            filterOptions: ["equals","notEqual","greaterThan","greaterThanOrEqual","lessThan","lessThanOrEqual","inRange"],
        };
    }
    if (dataType === "Date") {
        return {
            filterOptions: ["equals","greaterThan","lessThan","notEqual","inRange"],
            comparator: (filterDate, cellValue) => {
                if (!cellValue) return -1;
                const d = cellValue instanceof Date ? cellValue : new Date(cellValue);
                if (filterDate.getTime() === d.getTime()) return 0;
                return d < filterDate ? -1 : 1;
            },
        };
    }
    return {
        filterOptions: ["contains","notContains","startsWith","endsWith","equals","notEqual"],
        trimInput: true,
        debounceMs: 300,
    };
}

function getCellEditor(cfg) {
    switch (cfg.dataType) {
        case "Number":   return "agNumberCellEditor";
        case "Boolean":  return "agCheckboxCellEditor";
        case "Date":     return "agDateStringCellEditor";
        case "Dropdown": return "agSelectCellEditor";
        default:         return "agTextCellEditor";
    }
}

function getCellEditorParams(cfg) {
    if (cfg.dataType === "Number") {
        return { precision: 2 };
    }
    if (cfg.dataType === "Dropdown") {
        // AG Grid agSelectCellEditor uses "values" array of strings
        // We map { value, label } → just use label for display
        // For proper value/label dropdown, a custom cellEditor would be needed
        return {
            values: cfg.dropdownOptions.map(o => o.label || o.value),
        };
    }
    return {};
}

function getCellRenderer(dataType) {
    if (dataType === "Boolean") return "agCheckboxCellRenderer";
    return undefined;
}

function getValueParser(dataType) {
    switch (dataType) {
        case "Number":
            return p => {
                const n = parseFloat(p.newValue);
                return isNaN(n) ? p.oldValue : n;
            };
        case "Boolean":
            return p => p.newValue === true || p.newValue === "true";
        default:
            return p => p.newValue;
    }
}