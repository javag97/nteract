import { actions, selectors } from "@nteract/core";
import { shell } from "electron";
import { ofType } from "redux-observable";
import { ActionsObservable, StateObservable } from "redux-observable";
import { empty, of } from "rxjs";
import { ajax } from "rxjs/ajax";
import { catchError, mergeMap } from "rxjs/operators";
import { DesktopNotebookAppState } from "../state";

import { Actions } from "../actions";

import * as path from "path";

interface GithubFiles {
  [result: string]: {
    // Raw file as string
    content: string;
    // Specify the filename on update to rename it
    filename?: string;
  } | null; // Null allows for deletes
}

function publishGist(
  model: { files: GithubFiles; description: string; public: boolean },
  token: string,
  id: string | null
) {
  const url =
    id !== null
      ? `https://api.github.com/gists/${id}`
      : "https://api.github.com/gists";

  const opts = {
    url,
    responseType: "json",
    // This allows for us to provide a serverside XMLHttpRequest
    createXHR() {
      return new XMLHttpRequest();
    },
    headers: {
      "Content-Type": "application/json",
      // We can only update authenticated gists so we _must_ send the token
      Authorization: `token ${token}`
    },
    method: id !== null ? "PATCH" : "POST",
    body: model
  };

  return ajax(opts);
}

/**
 * Epic to capture the end to end action of publishing and receiving the
 * response from the Github API.
 */
export const publishEpic = (
  action$: ActionsObservable<actions.PublishGist>,
  state$: StateObservable<DesktopNotebookAppState>
) => {
  return action$.pipe(
    ofType(actions.PUBLISH_GIST),
    mergeMap((action: actions.PublishGist) => {
      const state = state$.value;

      const contentRef = action.payload.contentRef;
      if (!contentRef) {
        return empty();
      }

      const content = selectors.content(state, { contentRef });
      // NOTE: This could save by having selectors for each model type
      //       have toDisk() selectors
      if (!content || content.type !== "notebook") {
        return empty();
      }

      const filepath = content.filepath;
      const notificationSystem = selectors.notificationSystem(state);

      const model = content.model;

      const notebookString = selectors.notebook.asString(model);
      const gistId = selectors.notebook.gistId(model);

      // Allow falling back on the GITHUB_TOKEN environment variable
      const githubToken = state.app.get("githubToken");

      if (githubToken == null) {
        return of(
          actions.coreError(
            new Error("need a github token in order to publish")
          )
        );
      }

      if (gistId && typeof gistId !== "string") {
        return of(
          actions.coreError(new Error("gist id in notebook is not a string"))
        );
      }

      // We are updating, so we require both a gist Id and a github token
      // If this doesn't happen to be our originally gisted notebook,
      // we should likely fork and publish
      //
      // TODO: Check to see if the token matches that of the username listed
      //       in the notebook itself
      if (gistId) {
        notificationSystem.addNotification({
          title: "Updating Gist...",
          message: "💖📓💖",
          dismissible: true,
          position: "tr",
          level: "success"
        });
      } else {
        notificationSystem.addNotification({
          title: "Publishing a New Gist...",
          message: "✨📓✨",
          dismissible: true,
          position: "tr",
          level: "success"
        });
      }

      const filename = filepath ? path.parse(filepath).base : "Untitled.ipynb";
      const files: GithubFiles = {
        [filename]: { content: notebookString }
      };

      return publishGist(
        { files, description: filename, public: false },
        githubToken,
        gistId
      ).pipe(
        mergeMap(xhr => {
          const notificationSystem = selectors.notificationSystem(state$.value);

          const { id, login } = xhr.response;

          // NOTE: One day we need to make this part of our proper store
          //       instead of hidden side effects
          notificationSystem.addNotification({
            title: "Gist uploaded",
            message: "📓 📢",
            dismissible: true,
            position: "tr",
            level: "success",
            action: {
              label: "Open Gist",
              callback() {
                shell.openExternal(`https://nbviewer.jupyter.org/${id}`);
              }
            }
          });

          // TODO: Turn this into one action that does both, even if its
          // sometimes a no-op
          return of(
            actions.overwriteMetadataField({
              field: "github_username",
              value: login,
              contentRef
            }),
            actions.overwriteMetadataField({
              field: "gist_id",
              value: id,
              contentRef
            })
          );
        }),
        catchError(err => {
          // Turn the response headers into an object
          const arr: string[] = err.xhr.getAllResponseHeaders().split("\r\n");
          const headers: { [header: string]: string } = arr.reduce(
            (acc: { [header: string]: string }, current) => {
              const parts = current.split(": ");
              acc[parts[0]] = parts[1];
              return acc;
            },
            {}
          );

          // If we see the oauth scopes don't list gist, we know the problem is the token's access
          if (
            headers.hasOwnProperty("X-OAuth-Scopes") &&
            !headers["X-OAuth-Scopes"].includes("gist")
          ) {
            notificationSystem.addNotification({
              title: "Bad GitHub Token",
              message:
                "The gist API reports that the token doesn't have gist scopes 🤷‍♀️",
              dismissible: true,
              position: "tr",
              level: "error"
            });
            return of(
              actions.coreError(
                new Error("Current token doesn't allow for gists")
              )
            );
          }

          // When the GitHub API returns a 404 for POST'ing on the
          // /gists endpoint, it's a
          if (err.status > 500) {
            // Likely a GitHub API error
            notificationSystem.addNotification({
              title: "Gist publishing failed",
              message: "😩 GitHub API not feelin' good today",
              dismissible: true,
              position: "tr",
              level: "error"
            });
          }
          return of(actions.coreError(err));
        })
      );
    })
  );
};
