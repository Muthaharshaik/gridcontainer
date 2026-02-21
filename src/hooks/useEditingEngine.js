import { useRef, useCallback, useState } from "react";
import { writeMendixAttribute } from "../services/mendixService";

/**
 * useEditingEngine
 *
 * Handles all cell editing logic:
 *
 * 1. Calls writeMendixAttribute() → setValue() writes new value onto the
 *    Mendix object IN MEMORY (object is dirty but not yet saved to DB)
 *
 * 2. Stores a localOverride so the cell shows the new value immediately
 *    without blinking when Mendix triggers a datasource re-render
 *
 * 3. Marks the row dirty (yellow highlight) for manual save mode
 *
 * 4. On saveAll() → fires the onSave Mendix action (nanoflow/microflow)
 *    At this point the Mendix object already has the new values in memory,
 *    so the nanoflow only needs to COMMIT the object — nothing else.
 *
 * REQUIREMENT: Use XPath datasource on your page, not Microflow datasource.
 */
export function useEditingEngine(dataSource, columns, saveAction, saveMode) {

    const dirtyRows      = useRef(new Set());

    // localOverrides: { mendixId → { "col_0": newValue, "col_2": newValue } }
    // Merged on top of rowData so cells don't blink back to old value
    // when Mendix triggers a datasource refresh after setValue()
    const localOverrides = useRef(new Map());

    // Trigger re-render of toolbar when dirty state changes
    const [, setDirtyTick] = useState(0);

    const handleChange = useCallback((params) => {
        const { data, colDef, newValue, oldValue, node, api } = params;
        const mendixId = data?._mendixId;
        if (!mendixId) return;

        const colIndex = parseInt(colDef.field.replace("col_", ""), 10);
        const col = columns[colIndex];
        if (!col) return;

        // ── Step 1: Store local override FIRST ───────────────────
        // Do this before setValue so that even if setValue causes
        // Mendix to re-render, the cell shows the new value, not the old one
        const existing = localOverrides.current.get(mendixId) || {};
        localOverrides.current.set(mendixId, {
            ...existing,
            [colDef.field]: newValue
        });

        // ── Step 2: Write to Mendix object in memory ──────────────
        const item = dataSource?.items?.find(i => i.id === mendixId);
        if (item) {
            const success = writeMendixAttribute(item, col, newValue);
            if (!success) {
                // Revert local override and cell if write failed
                localOverrides.current.delete(mendixId);
                node.setDataValue(colDef.field, oldValue);
                return;
            }
        }

        // ── Step 3: Auto-save or mark dirty ──────────────────────
        if (saveMode === "auto") {
            if (saveAction?.canExecute) {
                saveAction.execute();
            }
            // Clear override after auto-save trigger
            localOverrides.current.delete(mendixId);
        } else {
            dirtyRows.current.add(mendixId);
            setDirtyTick(t => t + 1); // re-render toolbar so Save button lights up
            api.refreshCells({ rowNodes: [node], force: true });
        }
    }, [dataSource, columns, saveAction, saveMode]);

    /**
     * saveAll — fires onSave action.
     *
     * At this point, all edited Mendix objects already have their new values
     * in memory (written by setValue in handleChange).
     * The nanoflow wired to onSave just needs to COMMIT those objects.
     *
     * Simple nanoflow:
     *   Start → Commit $currentObject (or retrieve list and commit all) → End
     */
    const saveAll = useCallback(() => {
        if (saveAction?.canExecute) {
            saveAction.execute();
            dirtyRows.current.clear();
            localOverrides.current.clear();
            setDirtyTick(0);
        }
    }, [saveAction]);

    const hasDirtyRows = useCallback(
        () => dirtyRows.current.size > 0,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    return {
        handleChange,
        saveAll,
        dirtyRows,
        localOverrides,
        hasDirtyRows,
    };
}