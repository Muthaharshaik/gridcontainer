import { useMemo } from "react";

/**
 * useColumnConfigs
 *
 * Reads SpreadsheetColumnConfig items from Mendix and converts them
 * into plain JavaScript objects the rest of the widget can use.
 *
 * Also reads DropdownOption items and groups them by columnKey.
 *
 * OUTPUT shape per column:
 * {
 *   columnKey:       "Name",
 *   displayName:     "Employee Name",
 *   dataType:        "Text",        // Text | Number | Date | Boolean | Dropdown
 *   orderIndex:      1,
 *   isEditable:      true,
 *   isRequired:      false,
 *   width:           150,
 *   validationRegex: null,
 *   defaultValue:    null,
 *   dropdownOptions: [{ value: "A", label: "Option A" }, ...]
 * }
 */
export function useColumnConfigs(props) {
    const {
        columnConfigSource,
        cfgColumnKey,
        cfgDisplayName,
        cfgDataType,
        cfgOrderIndex,
        cfgIsEditable,
        cfgIsRequired,
        cfgWidth,
        cfgValidationRegex,
        cfgDefaultValue,

        dropdownOptionSource,
        doptColumnKey,
        doptValue,
        doptLabel,
    } = props;

    // ── Parse dropdown options (grouped by columnKey) ─────────────
    const dropdownMap = useMemo(() => {
        const map = new Map();
        if (dropdownOptionSource?.status !== "available") return map;

        dropdownOptionSource.items.forEach(item => {
            const keyVal   = readAttr(doptColumnKey, item);
            const value    = readAttr(doptValue, item);
            const label    = readAttr(doptLabel, item);
            if (!keyVal) return;

            if (!map.has(keyVal)) map.set(keyVal, []);
            map.get(keyVal).push({ value: value ?? "", label: label ?? value ?? "" });
        });

        return map;
    }, [dropdownOptionSource?.status, dropdownOptionSource?.items]);

    // ── Parse column configs ──────────────────────────────────────
    const parsedConfigs = useMemo(() => {
        if (columnConfigSource?.status !== "available") return [];

        const configs = columnConfigSource.items.map(item => {
            const columnKey       = readAttr(cfgColumnKey, item)       ?? "";
            const displayName     = readAttr(cfgDisplayName, item)     ?? columnKey;
            const dataType        = readAttr(cfgDataType, item)        ?? "Text";
            const orderIndex      = readAttr(cfgOrderIndex, item)      ?? 0;
            const isEditable      = readAttr(cfgIsEditable, item)      ?? true;
            const isRequired      = readAttr(cfgIsRequired, item)      ?? false;
            const width           = readAttr(cfgWidth, item)           ?? 150;
            const validationRegex = readAttr(cfgValidationRegex, item) ?? null;
            const defaultValue    = readAttr(cfgDefaultValue, item)    ?? null;
            const dropdownOptions = dropdownMap.get(columnKey)         ?? [];

            return {
                columnKey,
                displayName,
                dataType: normaliseDataType(dataType),
                orderIndex,
                isEditable,
                isRequired,
                width,
                validationRegex,
                defaultValue,
                dropdownOptions,
            };
        });

        // Sort by OrderIndex so Admin controls column order
        return configs.sort((a, b) => a.orderIndex - b.orderIndex);
    }, [
        columnConfigSource?.status,
        columnConfigSource?.items,
        dropdownMap,
    ]);

    return parsedConfigs;
}

// ─── Helpers ──────────────────────────────────────────────────────

function readAttr(attrProp, item) {
    if (!attrProp) return null;
    try {
        const ev = typeof attrProp.get === "function" ? attrProp.get(item) : attrProp;
        if (!ev || ev.status !== "available") return null;
        return ev.value ?? null;
    } catch {
        return null;
    }
}

/**
 * Normalise dataType value from Mendix enum to consistent string.
 * Mendix enum values may come as "MF.DataType.Text" or just "Text".
 */
function normaliseDataType(raw) {
    if (!raw) return "Text";
    const s = String(raw).toLowerCase();
    if (s.includes("number"))   return "Number";
    if (s.includes("date"))     return "Date";
    if (s.includes("boolean"))  return "Boolean";
    if (s.includes("dropdown")) return "Dropdown";
    return "Text";
}