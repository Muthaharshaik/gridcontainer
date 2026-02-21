import { useCallback } from "react";

/**
 * useValidationEngine
 *
 * Validates cell edits before they are written to Mendix.
 * Returns false to reject + revert, true to accept the change.
 *
 * Rules applied per column config:
 *  - Required fields reject null/empty
 *  - Number fields reject non-numeric input
 *  - Date fields reject invalid date strings
 *  - String fields trim and reject if only whitespace when required
 */
export function useValidationEngine(columns) {

    const validate = useCallback((params) => {
        const { newValue, oldValue, colDef } = params;

        const colIndex = parseInt(colDef.field.replace("col_", ""), 10);
        const column = columns?.[colIndex];

        if (!column) return true; // No config found, allow

        const isRequired = column.columnRequired;
        const colType    = column.columnType ?? "auto";

        // ── Required check ──────────────────────────────────────────────
        if (isRequired) {
            if (newValue === null || newValue === undefined) {
                showValidationError(params, "This field is required.");
                return false;
            }
            if (typeof newValue === "string" && newValue.trim() === "") {
                showValidationError(params, "This field cannot be empty.");
                return false;
            }
        }

        // ── Type-specific checks ─────────────────────────────────────────
        if (colType === "number" || colType === "auto") {
            if (newValue !== null && newValue !== undefined && newValue !== "") {
                const num = Number(newValue);
                if (isNaN(num)) {
                    showValidationError(params, "Please enter a valid number.");
                    return false;
                }
            }
        }

        if (colType === "date") {
            if (newValue && !(newValue instanceof Date) && isNaN(Date.parse(newValue))) {
                showValidationError(params, "Please enter a valid date.");
                return false;
            }
        }

        return true;
    }, [columns]);

    return { validate };
}

/**
 * Flashes the cell red briefly and reverts to oldValue.
 * AG Grid does not have a built-in validation UI in Community,
 * so we apply a temporary CSS class.
 */
function showValidationError(params, _message) {
    const cell = params.api.getCellEditorInstances({
        rowNodes: [params.node],
        columns: [params.column]
    });
    // Revert value
    params.node.setDataValue(params.colDef.field, params.oldValue);

    // Flash the cell to signal rejection
    params.api.flashCells({
        rowNodes: [params.node],
        columns: [params.column],
        flashDelay: 0,
        fadeDelay: 500
    });
}