import { createElement } from "react";
import { GridContainer } from "./components/GridContainer";

/**
 * AgGridEnterpriseWidget
 * Entry point - Mendix calls this with all configured props.
 * Keep this thin; all logic lives in GridContainer.
 */
export function AgGridEnterpriseWidget(props) {
    return <GridContainer {...props} />;
}