/**
 * mendixService.js
 * Handles all reading AND writing of Mendix attribute values.
 *
 * KEY REQUIREMENT:
 * Your page datasource must be XPath-based (not Microflow).
 * XPath datasource → setValue() works perfectly.
 * Microflow datasource → setValue() is blocked by Mendix platform.
 *
 * How to set XPath datasource in Studio Pro:
 *   Page → Widget → Data Source → Type: XPath → Entity: YourEntity
 */

/**
 * Get the EditableValue for a column + ObjectItem.
 * Mendix exposes attributes inside type="object" isList="true" as
 * ListAttributeValue objects — you must call .get(item) to get the
 * per-row EditableValue.
 */
function getEditableValue(col, item) {
    const attr = col.columnAttribute;
    if (!attr) return null;

    // Standard pattern: ListAttributeValue has a .get(item) method
    if (typeof attr.get === "function") {
        return attr.get(item);
    }

    // Fallback: already a direct EditableValue
    if (typeof attr === "object" && "value" in attr) {
        return attr;
    }

    return null;
}

/**
 * READ: Build a flat row object for AG Grid from a Mendix ObjectItem.
 * Fields are keyed "col_0", "col_1", etc. + "_mendixId" for identity.
 */
export function buildRowData(item, columns, rowIndex) {
    const row = {
        _mendixId: item.id,
        _rowIndex: rowIndex,
    };

    columns.forEach((col, index) => {
        try {
            const ev = getEditableValue(col, item);

            if (!ev || ev.status !== "available") {
                row[`col_${index}`] = null;
                return;
            }

            const raw = ev.value;
            // Convert Date to locale string for display
            row[`col_${index}`] = raw instanceof Date
                ? raw.toLocaleDateString()
                : (raw ?? null);

        } catch (e) {
            console.warn(`[AgGridWidget] buildRowData col ${index}:`, e.message);
            row[`col_${index}`] = null;
        }
    });

    return row;
}

/**
 * WRITE: Set a new value on a Mendix attribute after inline cell edit.
 *
 * This writes the value into the Mendix object IN MEMORY.
 * The object is NOT saved to the database yet — that happens when your
 * nanoflow (wired to "On Save") calls Commit on the object.
 *
 * @returns {boolean} true if setValue succeeded
 */
export function writeMendixAttribute(item, col, newValue) {
    try {
        const ev = getEditableValue(col, item);

        if (!ev) {
            console.warn("[AgGridWidget] writeMendixAttribute: no EditableValue found");
            return false;
        }

        if (ev.status !== "available") {
            console.warn("[AgGridWidget] writeMendixAttribute: attribute status is", ev.status);
            return false;
        }

        if (!ev.setValue) {
            console.error(
                "[AgGridWidget] writeMendixAttribute: setValue not available.\n" +
                "This usually means your datasource is a Microflow datasource.\n" +
                "Fix: Change your page datasource to XPath in Studio Pro."
            );
            return false;
        }

        ev.setValue(coerceValue(newValue, col.columnType));
        return true;

    } catch (e) {
        console.error(
            "[AgGridWidget] writeMendixAttribute failed:", e.message, "\n" +
            "If error says 'setValue not supported on datasource attributes',\n" +
            "change your page datasource from Microflow to XPath."
        );
        return false;
    }
}

/**
 * Coerce raw AG Grid input to the correct JS type for Mendix.
 */
export function coerceValue(value, columnType) {
    if (value === null || value === undefined || value === "") return undefined;
    switch (columnType) {
        case "number":  return typeof value === "string" ? parseFloat(value) : value;
        case "boolean": return value === "true" || value === true;
        case "date":    return value instanceof Date ? value : new Date(value);
        default:        return String(value);
    }
}