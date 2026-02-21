import { useMemo } from "react";

/**
 * useColumnDefs
 *
 * Converts the Mendix widget "columns" property list into
 * AG Grid column definitions, including:
 *  - Correct cell editors per type (text, number, date, checkbox)
 *  - Correct column filters per type
 *  - Pinning, width, sortable, filterable, hidden
 *  - Checkbox column when row selection is "multiple"
 */
export function useColumnDefs(columns, editable, rowSelection) {
    return useMemo(() => {
        if (!columns || columns.length === 0) return [];

        const defs = columns.map((col, index) => {
            const colType = col.columnType ?? "auto";
            const isEditable = editable && (col.columnEditable ?? true);

            return {
                field: `col_${index}`,
                headerName: col.columnHeader || `Column ${index + 1}`,
                editable: isEditable,
                sortable: col.columnSortable ?? true,
                filter: getFilter(colType, col.columnFilterable),
                resizable: true,
                width: col.columnWidth || 150,
                minWidth: col.columnMinWidth || 80,
                hide: col.columnHidden ?? false,
                pinned: col.columnPinned !== "none" ? col.columnPinned : null,
                cellEditor: getCellEditor(colType),
                cellEditorParams: getCellEditorParams(colType),
                cellRenderer: getCellRenderer(colType),
                valueParser: getValueParser(colType),
                filterParams: getFilterParams(colType),
                // Tooltip shows full content for truncated cells
                tooltipField: `col_${index}`,
                // Used for CSV export header
                headerTooltip: col.columnHeader || `Column ${index + 1}`,
            };
        });

        // Prepend checkbox column if multiple selection enabled
        if (rowSelection === "multiple") {
            defs.unshift({
                headerCheckboxSelection: true,
                checkboxSelection: true,
                width: 50,
                minWidth: 50,
                maxWidth: 50,
                pinned: "left",
                resizable: false,
                sortable: false,
                filter: false,
                editable: false,
                field: "_checkbox",
                headerName: "",
                lockPosition: true,
                suppressMovable: true,
            });
        }

        return defs;
    }, [columns, editable, rowSelection]);
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function getFilter(colType, filterable) {
    if (filterable === false) return false;
    switch (colType) {
        case "number":    return "agNumberColumnFilter";
        case "date":      return "agDateColumnFilter";
        case "boolean":   return false; // Use column header checkbox instead
        default:          return "agTextColumnFilter";
    }
}

function getFilterParams(colType) {
    if (colType === "text" || colType === "auto") {
        return {
            filterOptions: ["contains", "notContains", "startsWith", "endsWith", "equals", "notEqual"],
            trimInput: true,
            debounceMs: 300,
        };
    }
    if (colType === "number") {
        return {
            filterOptions: ["equals", "notEqual", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual", "inRange"],
        };
    }
    if (colType === "date") {
        return {
            filterOptions: ["equals", "greaterThan", "lessThan", "notEqual", "inRange"],
            comparator: (filterDate, cellValue) => {
                if (!cellValue) return -1;
                const cellDate = cellValue instanceof Date ? cellValue : new Date(cellValue);
                if (filterDate.getTime() === cellDate.getTime()) return 0;
                return cellDate < filterDate ? -1 : 1;
            },
        };
    }
    return {};
}

function getCellEditor(colType) {
    switch (colType) {
        case "number":  return "agNumberCellEditor";
        case "boolean": return "agCheckboxCellEditor";
        case "date":    return "agDateStringCellEditor";
        default:        return "agTextCellEditor";
    }
}

function getCellEditorParams(colType) {
    if (colType === "number") {
        return { precision: 2 };
    }
    return {};
}

function getCellRenderer(colType) {
    switch (colType) {
        case "boolean":  return "agCheckboxCellRenderer";
        default:         return undefined;
    }
}

function getValueParser(colType) {
    switch (colType) {
        case "number":
            return params => {
                const n = parseFloat(params.newValue);
                return isNaN(n) ? params.oldValue : n;
            };
        case "boolean":
            return params => params.newValue === true || params.newValue === "true";
        default:
            return params => params.newValue;
    }
}