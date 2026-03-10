import { useMemo } from "react";

/**
 * useTemplateConfig
 *
 * Reads the SpreadsheetTemplate entity from Mendix and extracts
 * all feature toggles. Falls back to widget-level defaults if
 * no template is configured or template is still loading.
 *
 * Template takes full priority over fallback props —
 * this is the whole point of the config-driven architecture.
 *
 * @param props - full widget props
 * @returns parsed config object consumed by GridContainer
 */
export function useTemplateConfig(props) {
    const {
        // Template datasource
        templateSource,
        tmplEnablePagination,
        tmplPageSize,
        tmplEnableFiltering,
        tmplEnableCSVExport,
        tmplEnableColumnResize,

        // Fallback values (used when no template wired)
        fallbackEditable      = true,
        fallbackSaveMode      = "manual",
        fallbackPagination    = true,
        fallbackPageSize      = 20,
        fallbackCSVExport     = true,

        // Always from widget props (not in template entity)
        rowSelection          = "none",
        highlightDirtyRows    = true,
        gridHeight            = 500,
        gridTheme             = "alpine",
    } = props;

    return useMemo(() => {
        const hasTemplate = templateSource?.status === "available" &&
                            templateSource.items?.length > 0;

        let enablePagination  = fallbackPagination;
        let pageSize          = fallbackPageSize;
        let enableFiltering   = true;
        let enableCSVExport   = fallbackCSVExport;
        let enableColumnResize = true;

        if (hasTemplate) {
            const item = templateSource.items[0];

            if (tmplEnablePagination) {
                const v = tmplEnablePagination.get(item);
                if (v?.status === "available") enablePagination = v.value ?? fallbackPagination;
            }
            if (tmplPageSize) {
                const v = tmplPageSize.get(item);
                if (v?.status === "available") pageSize = v.value ?? fallbackPageSize;
            }
            if (tmplEnableFiltering) {
                const v = tmplEnableFiltering.get(item);
                if (v?.status === "available") enableFiltering = v.value ?? true;
            }
            if (tmplEnableCSVExport) {
                const v = tmplEnableCSVExport.get(item);
                if (v?.status === "available") enableCSVExport = v.value ?? fallbackCSVExport;
            }
            if (tmplEnableColumnResize) {
                const v = tmplEnableColumnResize.get(item);
                if (v?.status === "available") enableColumnResize = v.value ?? true;
            }
        }

        return {
            // From template (or fallback)
            enablePagination,
            pageSize,
            enableFiltering,
            enableCSVExport,
            enableColumnResize,

            // From widget fallback props
            editable:          fallbackEditable,
            saveMode:          fallbackSaveMode,

            // Always from widget props
            rowSelection,
            highlightDirtyRows,
            gridHeight,
            gridTheme,
        };
    }, [
        templateSource?.status,
        templateSource?.items,
        fallbackPagination,
        fallbackPageSize,
        fallbackCSVExport,
        fallbackEditable,
        fallbackSaveMode,
        rowSelection,
        highlightDirtyRows,
        gridHeight,
        gridTheme,
    ]);
}