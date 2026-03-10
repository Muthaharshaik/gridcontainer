import { useRef, useCallback, useState } from "react";
import { writeMendixAttribute } from "../services/mendixService";

/**
 * useEditingEngine
 *
 * Handles cell editing, undo/redo, and save.
 *
 * ─── EDITING FLOW ────────────────────────────────────────────────────────────
 *
 *   User edits cell
 *       ↓
 *   handleChange() stores new value in localOverrides ONLY
 *       ↓
 *   NO setValue called yet — Mendix doesn't know about this edit
 *       ↓
 *   Row turns yellow (dirty indicator)
 *       ↓
 *   AG Grid cell shows new value immediately (no blink, no Mendix re-render)
 *
 * ─── SAVE FLOW (Manual mode) ─────────────────────────────────────────────────
 *
 *   User clicks Save
 *       ↓
 *   saveAll() loops every dirty row
 *       ↓
 *   writeMendixAttribute() → ev.setValue(newValue)   ← this is the ONLY write
 *       ↓
 *   onSave Mendix action fires
 *       ↓
 *   Mendix microflow (ACT_Save) runs → commits objects → saves to DB
 *       ↓
 *   dirty state cleared AFTER action fires
 *
 * ─── SAVE FLOW (Auto mode) ───────────────────────────────────────────────────
 *
 *   User leaves cell (onCellValueChanged fires)
 *       ↓
 *   handleChange() → writeMendixAttribute() immediately
 *       ↓
 *   onChange Mendix action fires
 *       ↓
 *   Mendix microflow commits that single object
 *
 * ─── UNDO / REDO ─────────────────────────────────────────────────────────────
 *
 *   Each edit is pushed onto historyStack.
 *   Ctrl+Z  → undo last edit (restores localOverride + AG Grid cell to oldValue)
 *   Ctrl+Y  → redo
 *   Note: undo/redo only affects localOverrides — does NOT call setValue.
 *   Values are only written to Mendix when the user saves.
 */
export function useEditingEngine(dataSource, columnMappings, parsedConfigs, saveAction, saveMode) {

    // Set of mendixIds that have unsaved changes
    const dirtyRows      = useRef(new Set());

    // Map of mendixId → { fieldKey: latestValue }
    // Used to show the new value in the cell immediately without waiting for
    // Mendix to re-render (prevents cell blinking)
    const localOverrides = useRef(new Map());

    // Tick counter — incrementing this forces rowData useMemo to re-run
    // so localOverrides actually reach the AG Grid row data
    const [dirtyTick, setDirtyTick] = useState(0);

    // ── Undo / Redo history ───────────────────────────────────────────────────
    // Each entry: { mendixId, field, oldValue, newValue }
    const historyStack = useRef([]);
    const historyIndex = useRef(-1);

    // ── Handle cell change ────────────────────────────────────────────────────
    const handleChange = useCallback((params) => {
        const { data, colDef, newValue, oldValue, node, api } = params;

        const mendixId = data?._mendixId;
        const field    = colDef.field;   // ColumnKey string, e.g. "Name"

        if (!mendixId || !field || field === "__checkbox__") return;

        // ── AUTO SAVE MODE ─────────────────────────────────────────────────
        // Write to Mendix immediately and fire the onChange action.
        // No dirty tracking needed — Mendix handles commit via microflow.
        if (saveMode === "auto") {
            const item = dataSource?.items?.find(i => i.id === mendixId);
            if (!item) return;

            const success = writeMendixAttribute(item, field, newValue, columnMappings, parsedConfigs);

            if (success && saveAction?.canExecute) {
                saveAction.execute();
            }

            // Still update localOverrides so the cell doesn't blink
            // while Mendix re-renders after the action
            const existing = localOverrides.current.get(mendixId) || {};
            localOverrides.current.set(mendixId, { ...existing, [field]: newValue });
            setDirtyTick(t => t + 1);
            return;
        }

        // ── MANUAL SAVE MODE ───────────────────────────────────────────────
        // Store in localOverrides only — do NOT call setValue yet.
        // The cell shows the new value immediately via localOverrides,
        // but Mendix won't know about this edit until the user clicks Save.

        const existing = localOverrides.current.get(mendixId) || {};
        localOverrides.current.set(mendixId, { ...existing, [field]: newValue });

        // Mark this row as dirty (yellow highlight)
        dirtyRows.current.add(mendixId);

        // Increment tick so rowData useMemo re-runs and picks up the override
        setDirtyTick(t => t + 1);

        // Refresh this row's cells in AG Grid
        api?.refreshCells({ rowNodes: [node], force: true });

        // ── Push onto undo history ─────────────────────────────────────────
        // If user undid some steps and then made a new edit,
        // truncate the forward history (same as VS Code / Word behaviour)
        historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
        historyStack.current.push({ mendixId, field, oldValue, newValue });
        historyIndex.current = historyStack.current.length - 1;

    }, [dataSource, columnMappings, parsedConfigs, saveAction, saveMode]);

    // ── Undo ──────────────────────────────────────────────────────────────────
    const undo = useCallback((gridApi) => {
        if (historyIndex.current < 0) return;

        const entry = historyStack.current[historyIndex.current];
        historyIndex.current--;

        const { mendixId, field, oldValue } = entry;

        // Restore the localOverride to the old value
        const existing = localOverrides.current.get(mendixId) || {};
        localOverrides.current.set(mendixId, { ...existing, [field]: oldValue });

        // If all fields for this row are now back to original, unmark as dirty
        // (This is a basic check — for full accuracy you'd compare against original values)
        const overrides = localOverrides.current.get(mendixId);
        const allReverted = Object.values(overrides).every(v => v === null || v === undefined);
        if (allReverted) {
            dirtyRows.current.delete(mendixId);
        }

        setDirtyTick(t => t + 1);

        // Update the AG Grid cell to show the reverted value
        if (gridApi) {
            gridApi.forEachNode(node => {
                if (node.data?._mendixId === mendixId) {
                    node.setDataValue(field, oldValue);
                }
            });
        }
    }, []);

    // ── Redo ──────────────────────────────────────────────────────────────────
    const redo = useCallback((gridApi) => {
        if (historyIndex.current >= historyStack.current.length - 1) return;

        historyIndex.current++;
        const entry = historyStack.current[historyIndex.current];
        const { mendixId, field, newValue } = entry;

        const existing = localOverrides.current.get(mendixId) || {};
        localOverrides.current.set(mendixId, { ...existing, [field]: newValue });

        dirtyRows.current.add(mendixId);
        setDirtyTick(t => t + 1);

        if (gridApi) {
            gridApi.forEachNode(node => {
                if (node.data?._mendixId === mendixId) {
                    node.setDataValue(field, newValue);
                }
            });
        }
    }, []);

    // ── Save all dirty rows ───────────────────────────────────────────────────
const saveAll = useCallback(() => {
    if (dirtyRows.current.size === 0) return;

    const dirtyIds = [...dirtyRows.current];

    dirtyIds.forEach(mendixId => {
        const item = dataSource?.items?.find(i => i.id === mendixId);
        if (!item) return;

        const overrides = localOverrides.current.get(mendixId) || {};

        // Write all changed values into Mendix memory
        Object.entries(overrides).forEach(([field, newValue]) => {
            writeMendixAttribute(item, field, newValue, columnMappings, parsedConfigs);
        });
    });

    // Fire microflow — it will commit
    // Do NOT clear state here — datasource refresh will trigger the clear
    if (saveAction?.canExecute) saveAction.execute();

}, [dataSource, columnMappings, parsedConfigs, saveAction]);

const clearAfterSave = useCallback(() => {
    dirtyRows.current.clear();
    localOverrides.current.clear();
    historyStack.current = [];
    historyIndex.current = -1;
    setDirtyTick(0);
}, []);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const hasDirtyRows = useCallback(() => dirtyRows.current.size > 0, []);
    const canUndo      = useCallback(() => historyIndex.current >= 0, []);
    const canRedo      = useCallback(() => historyIndex.current < historyStack.current.length - 1, []);

    return {
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
        dirtyTick,      // ← expose this so GridContainer can add it as rowData dependency
    };
}