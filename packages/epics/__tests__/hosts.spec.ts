import { actions, state as stateModule } from "@nteract/core";
import Immutable from "immutable";
import { ActionsObservable } from "redux-observable";

import { publishToBookstore } from "../src/hosts";

describe("publishToBookstore", () => {
  test("throws an error if no payload is provided to action", () => {
    const badAction$ = ActionsObservable.of({
      type: actions.PUBLISH_TO_BOOKSTORE,
      payload: undefined
    });
    const epic = publishToBookstore(badAction$);
    const responseActions = [];
    epic.subscribe(
      action => responseActions.push(action),
      err => {
        throw err;
      },
      () => {
        expect(responseActions).toEqual([
          {
            type: "ERROR",
            error: true,
            payload: {
              error: new Error("saving content to Bookstore needs a payload")
            }
          }
        ]);
      }
    );
  });
  test("throws error if content type is not notebook", () => {
    const action$ = ActionsObservable.of({
      type: actions.PUBLISH_TO_BOOKSTORE,
      payload: { contentRef: "contentRef" }
    });
    const state$ = {
      value: {
        core: stateModule.makeStateRecord({
          kernelRef: "fake",
          entities: stateModule.makeEntitiesRecord({
            kernels: stateModule.makeKernelsRecord({
              byRef: Immutable.Map({
                fake: stateModule.makeRemoteKernelRecord({})
              })
            }),
            contents: stateModule.makeContentsRecord({
              byRef: Immutable.Map({
                contentRef: stateModule.makeDummyContentRecord({})
              })
            })
          })
        }),
        app: {
          notificationSystem: { addNotification: jest.fn() }
        }
      }
    };
    const epic = publishToBookstore(action$, state$);
    const responseActions = [];
    epic.subscribe(
      action => responseActions.push(action),
      err => {
        throw err;
      },
      () => {
        expect(responseActions).toEqual([
          {
            type: "ERROR",
            error: true,
            payload: {
              error: new Error("Only Notebooks can be published to Bookstore")
            }
          }
        ]);
      }
    );
  });

  test("emits correct action after successful save", () => {
    const action$ = ActionsObservable.of({
      type: actions.PUBLISH_TO_BOOKSTORE,
      payload: { contentRef: "contentRef" }
    });
    const state$ = {
      value: {
        core: stateModule.makeStateRecord({
          kernelRef: "fake",
          entities: stateModule.makeEntitiesRecord({
            kernels: stateModule.makeKernelsRecord({
              byRef: Immutable.Map({
                fake: stateModule.makeRemoteKernelRecord({})
              })
            }),
            contents: stateModule.makeContentsRecord({
              byRef: Immutable.Map({
                contentRef: stateModule.makeNotebookContentRecord({})
              })
            })
          })
        }),
        app: {
          notificationSystem: { addNotification: jest.fn() }
        }
      }
    };
    const epic = publishToBookstore(action$, state$);
    const responseActions = [];
    epic.subscribe(
      action => responseActions.push(action),
      err => {
        throw err;
      },
      () => {
        expect(responseActions[0].type).toEqual(
          actions.PUBLISH_TO_BOOKSTORE_AFTER_SAVE
        );
      }
    );
  });
});
