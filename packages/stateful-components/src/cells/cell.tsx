import React from "react";
import { connect } from "react-redux";

import { ImmutableCell } from "@nteract/commutable/src";
import { AppState, selectors } from "@nteract/core";

interface ComponentProps {
  id: string;
  contentRef: string;
  children: React.ReactNode;
}

interface StateProps {
  cell?: ImmutableCell;
  selected: boolean;
}

export class Cell extends React.PureComponent<ComponentProps & StateProps> {
  render(): JSX.Element | null {
    // We must pick only one child to render
    let chosenOne: React.ReactNode | null = null;

    if (!this.props.cell) {
      return null;
    }

    const cell_type = this.props.cell.get("cell_type", "code");

    // Find the first child element that matches something in this.props.data
    React.Children.forEach(this.props.children, child => {
      if (!child) {
        return;
      }

      if (
        typeof child === "string" ||
        typeof child === "number" ||
        typeof child === "boolean"
      ) {
        return;
      }

      if (chosenOne) {
        // Already have a selection
        return;
      }

      if (typeof child !== "object" || !("props" in child)) {
        return;
      }

      if (child.props && child.props.cell_type) {
        const child_cell_type = child.props.cell_type;

        chosenOne = child_cell_type === cell_type ? child : null;
        return;
      }
    });

    // If we didn't find a match, render nothing
    if (chosenOne === null) {
      return null;
    }

    // Render the output component that handles this output type
    return (
      <div
        className={`nteract-cell-container ${
          this.props.selected ? "selected" : ""
        }`}
      >
        {React.cloneElement(chosenOne, {
          cell: this.props.cell,
          id: this.props.id,
          contentRef: this.props.contentRef
        })}
      </div>
    );
  }
}

export const makeMapStateToProps = (
  initialState: AppState,
  ownProps: ComponentProps
): ((state: AppState) => StateProps) => {
  const mapStateToProps = (state: AppState): StateProps => {
    const { id, contentRef } = ownProps;
    const model = selectors.model(state, { contentRef });
    let cell;
    let selected = false;

    if (model && model.type === "notebook") {
      cell = selectors.notebook.cellById(model, { id });
      selected = selectors.notebook.cellFocused(model) === id;
    }

    return { cell, selected };
  };
  return mapStateToProps;
};

export default connect<StateProps, void, ComponentProps, AppState>(
  makeMapStateToProps
)(Cell);
