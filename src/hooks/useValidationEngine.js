import { useCallback } from "react";

/**
 * useValidationEngine
 *
 * Validates cell edits against rules from SpreadsheetColumnConfig.
 * Returns false to reject + revert, true to accept.
 *
 * Rules applied per column:
 *  1. Required    — reject null/empty if IsRequired = true
 *  2. Type check  — reject non-numeric for Number columns
 *  3. Regex       — reject if ValidationRegex set and value doesn't match
 *
 * @param parsedConfigs - array from useColumnConfigs
 */
export function useValidationEngine(parsedConfigs) {

    const validate = useCallback((params) => {
        const { newValue, oldValue, colDef, node, api, column } = params;

        // field is now the ColumnKey (e.g. "Name"), not "col_0"
        const field  = colDef.field;
        // Config is also stored on the colDef for convenience
        const cfg    = colDef._cfg ?? parsedConfigs?.find(c => c.columnKey === field);

        if (!cfg) return true;

        const val = newValue;

        // ── 1. Required ──────────────────────────────────────────
        if (cfg.isRequired) {
            const isEmpty = val === null || val === undefined ||
                            (typeof val === "string" && val.trim() === "");
            if (isEmpty) {
                rejectCell(params, `"${cfg.displayName}" is required.`);
                return false;
            }
        }

        // ── 2. Type checks ────────────────────────────────────────
        if (cfg.dataType === "Number" && val !== null && val !== undefined && val !== "") {
            if (isNaN(Number(val))) {
                rejectCell(params, `"${cfg.displayName}" must be a number.`);
                return false;
            }
        }

        if (cfg.dataType === "Date" && val) {
            if (!(val instanceof Date) && isNaN(Date.parse(val))) {
                rejectCell(params, `"${cfg.displayName}" must be a valid date.`);
                return false;
            }
        }

        // ── 3. Regex validation ────────────────────────────────────
        if (cfg.validationRegex && val !== null && val !== undefined && val !== "") {
            try {
                const regex = new RegExp(cfg.validationRegex);
                if (!regex.test(String(val))) {
                    rejectCell(params, `"${cfg.displayName}" does not match the required format.`);
                    return false;
                }
            } catch (e) {
                console.warn(`[Widget] Invalid regex for column "${field}":`, cfg.validationRegex);
                // Don't reject if regex itself is invalid — log and continue
            }
        }

        return true;
    }, [parsedConfigs]);

    return { validate };
}

function rejectCell(params, _message) {
    // Revert to old value
    params.node.setDataValue(params.colDef.field, params.oldValue);

    // Flash cell red to signal rejection
    params.api.flashCells({
        rowNodes: [params.node],
        columns:  [params.column],
        flashDelay: 0,
        fadeDelay:  600,
    });
}