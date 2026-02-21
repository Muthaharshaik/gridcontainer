import { createElement } from "react";

/**
 * LoadingOverlay
 * Custom AG Grid loading overlay displayed while Mendix dataSource
 * status is "loading".
 */
export function LoadingOverlay() {
    return (
        <div className="ag-overlay-loading-center" style={styles.wrapper}>
            <div style={styles.spinner} />
            <span style={styles.text}>Loading data…</span>
        </div>
    );
}

/**
 * NoRowsOverlay
 * Shown when dataSource is available but returns 0 items.
 */
export function NoRowsOverlay() {
    return (
        <div style={styles.wrapper}>
            <svg style={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7h18M3 12h18M3 17h18"/>
            </svg>
            <span style={styles.text}>No records found</span>
        </div>
    );
}

const styles = {
    wrapper: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "#6b7280",
        fontSize: 14,
    },
    spinner: {
        width: 28,
        height: 28,
        border: "3px solid #e5e7eb",
        borderTopColor: "#3b82f6",
        borderRadius: "50%",
        animation: "ag-grid-widget-spin 0.75s linear infinite",
    },
    icon: {
        width: 32,
        height: 32,
    },
    text: {
        fontWeight: 500,
    }
};