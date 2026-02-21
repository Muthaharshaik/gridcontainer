import { useEffect, useCallback } from "react";

/**
 * useServerPagination
 *
 * Listens to AG Grid pagination events and fires the Mendix
 * onPageChange action with the current page number.
 *
 * Properly cleans up the event listener on unmount.
 *
 * @param {React.RefObject} gridRef    - ref to AgGridReact
 * @param {Object}          onPageChange - Mendix action
 */
export function useServerPagination(gridRef, onPageChange) {

    const handlePaginationChanged = useCallback((event) => {
        // Only fire for real user navigation, not initial load
        if (!event.newPage) return;

        if (onPageChange?.canExecute) {
            onPageChange.execute();
        }
    }, [onPageChange]);

    useEffect(() => {
        const api = gridRef.current?.api;
        if (!api) return;

        api.addEventListener("paginationChanged", handlePaginationChanged);

        return () => {
            // AG Grid may already be destroyed on unmount
            try {
                api.removeEventListener("paginationChanged", handlePaginationChanged);
            } catch {
                // Silently ignore if grid was already destroyed
            }
        };
    }, [gridRef, handlePaginationChanged]);
}