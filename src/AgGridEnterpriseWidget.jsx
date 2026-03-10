import { createElement } from "react";
import { GridContainer } from "./components/GridContainer";

/**
 * AgGridEnterpriseWidget — entry point.
 * Mendix calls this with all configured props from the XML schema.
 * Keep this thin; all logic lives in GridContainer and hooks.
 */
export function AgGridEnterpriseWidget(props) {
    return <GridContainer {...props} />;
}