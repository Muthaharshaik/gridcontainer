/**
 * mendixService.js
 *
 * Bridges Mendix ObjectItems <-> AG Grid row data.
 *
 * READ  : buildRowData   — reads live Mendix object → flat AG Grid row
 * WRITE : writeMendixAttribute — writes new value into live Mendix object
 *
 * NO direct commits here. Widget only calls setValue().
 * The Mendix microflow wired to onSave / onChange handles the actual DB commit.
 *
 * Row shape example:
 *   { _mendixId: "197abc...", Name: "John", Age: 25, Salary: 50000 }
 *
 * columnMappings (from widget XML "Column Mappings" property group):
 *   [{ mappingKey: "Name", mappingAttribute: <ListAttributeValue> }, ...]
 */

// ─────────────────────────────────────────────────────────────────────────────
//  READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a flat AG Grid row object from a Mendix ObjectItem.
 * Uses mappingKey as the field name — matches ColumnKey in SpreadsheetColumnConfig.
 *
 * Dates are stored as ISO strings so the round-trip back through
 * writeMendixAttribute is reliable across all locales.
 */
export function buildRowData(item, columnMappings) {
    const row = { _mendixId: item.id };

    columnMappings.forEach(mapping => {
        const key  = mapping.mappingKey;
        const attr = mapping.mappingAttribute;

        if (!key || !attr) return;

        try {
            // attr is a ListAttributeValue — call .get(item) to get the EditableValue
            const ev = typeof attr.get === "function" ? attr.get(item) : attr;

            if (!ev || ev.status !== "available") {
                row[key] = null;
                return;
            }

            const raw = ev.value;

            // Store dates as ISO strings — avoids locale-dependent display strings
            // that break when we try to parse them back during write
            if (raw instanceof Date) {
                row[key] = raw.toISOString();
            } else {
                row[key] = raw ?? null;
            }

        } catch (e) {
            console.warn(`[Widget] buildRowData key "${key}":`, e.message);
            row[key] = null;
        }
    });

    return row;
}

// ─────────────────────────────────────────────────────────────────────────────
//  WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write a new cell value into the live Mendix object using setValue().
 *
 * This is the ONLY write operation the widget performs.
 * After calling this, the Mendix object is "dirty" in client memory.
 * The Mendix microflow (onSave / onChange action) is responsible for committing it.
 *
 * @param item           - Mendix ObjectItem (the live reference)
 * @param mappingKey     - ColumnKey string, e.g. "Name"
 * @param newValue       - new value coming from AG Grid cell edit
 * @param columnMappings - widget columnMappings prop list
 * @param parsedConfigs  - array of parsed column configs (for dataType coercion)
 * @returns boolean      - true if setValue succeeded, false otherwise
 */
export function writeMendixAttribute(item, mappingKey, newValue, columnMappings, parsedConfigs) {
    // 1. Find the mapping for this column key
    const mapping = columnMappings.find(m => m.mappingKey === mappingKey);
    if (!mapping) {
        console.warn(`[Widget] writeMendixAttribute: no mapping for key "${mappingKey}"`);
        return false;
    }

        // ADD THIS TEMPORARILY
    console.info("mapping:", mapping);
    console.info("mapping.mappingAttribute:", mapping.mappingAttribute);
    console.info("item:", item);


    // 2. Find the config to know the dataType (for correct coercion)
    const config   = parsedConfigs?.find(c => c.columnKey === mappingKey);
    const dataType = config?.dataType ?? "Text";

    try {
        const attr = mapping.mappingAttribute;

        // attr is a ListAttributeValue — call .get(item) to get the EditableValue
        const ev = typeof attr?.get === "function" ? attr.get(item) : attr;
        console.info("ev:", ev);
    console.info("ev.status:", ev?.status);
    console.info("ev.setValue exists:", typeof ev?.setValue);

        // setValue must exist — it won't if the datasource is a Microflow datasource
        // (Microflow datasources are read-only; only XPath datasources support setValue)
        if (!ev?.setValue) {
            console.error(
                `[Widget] setValue not available for "${mappingKey}". ` +
                "The datasource must be XPath-based, not a Microflow datasource."
            );
            return false;
        }

        // 3. Coerce the value to the correct JS type Mendix expects,
        //    then call setValue — this marks the Mendix object as dirty in memory
        const coerced = coerceValue(newValue, dataType, config);
        ev.setValue(coerced);

        return true;

    } catch (e) {
        console.error(`[Widget] writeMendixAttribute "${mappingKey}":`, e.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerce a raw AG Grid value to the correct JS type for Mendix setValue().
 *
 * Mendix expects:
 *   String    → string
 *   Number    → number  (not a string like "25")
 *   Boolean   → boolean (not a string like "true")
 *   Date      → Date object
 *   Dropdown  → string  (the VALUE, not the display label)
 *
 * @param value      - raw value from AG Grid
 * @param dataType   - "Text" | "Number" | "Boolean" | "Date" | "Dropdown"
 * @param config     - parsed column config (used for dropdown label→value lookup)
 */
export function coerceValue(value, dataType, config) {
    // Empty / null → undefined tells Mendix to clear the field
    if (value === null || value === undefined || value === "") return undefined;

    switch (dataType) {

        case "Number":
            // AG Grid may return a number already (agNumberCellEditor)
            // but guard against string input too
            if (typeof value === "number") return value;
            const n = parseFloat(value);
            return isNaN(n) ? undefined : n;

        case "Boolean":
            return value === true || value === "true";

        case "Date":
            // We store dates as ISO strings in buildRowData,
            // so new Date(isoString) is reliable here
            if (value instanceof Date) return value;
            const d = new Date(value);
            return isNaN(d.getTime()) ? undefined : d;

        case "Dropdown":
            // AG Grid agSelectCellEditor works with label strings (display values).
            // We need to store the actual VALUE back in Mendix, not the label.
            // Look up the matching option and return its value.
            if (config?.dropdownOptions?.length) {
                const option = config.dropdownOptions.find(
                    o => o.label === value || o.value === value
                );
                // If a match found, return the stored value; otherwise fall through to string
                if (option) return String(option.value);
            }
            return String(value);

        default:
            // Text, Enum, unknown types
            return String(value);
    }
}