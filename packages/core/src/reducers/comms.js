/* @flow */
import * as Immutable from "immutable";

import type {
  RegisterCommTargetAction,
  CommOpenAction,
  CommMessageAction
} from "../actionTypes";

type CommState = Immutable.Map<string, any>;

const defaultCommState: CommState = Immutable.Map({
  targets: Immutable.Map(),
  models: Immutable.Map(),
  info: Immutable.Map()
});

function registerCommTarget(
  state: CommState,
  action: RegisterCommTargetAction
): CommState {
  return state.setIn(["targets", action.name], action.handler);
}

function processCommOpen(state: CommState, action: CommOpenAction): CommState {
  const { target_name, target_module, data, comm_id } = action;

  const commInfo = {
    target_module,
    target_name
  };

  return state
    .setIn(["info", comm_id], Immutable.fromJS(commInfo))
    .setIn(["models", comm_id], Immutable.fromJS(data));
}

function processCommMessage(
  state: CommState,
  action: CommMessageAction
): CommState {
  const { data, comm_id } = action;

  const commInfo = state.getIn(["info", comm_id]);
  if (
    commInfo &&
    commInfo.get("target_module") === "reducers" &&
    commInfo.get("target_name") === "setIn"
  ) {
    const path: Array<string | number> = data.path;
    const value = Immutable.fromJS(data.value);

    // set `value` into `path` of the model data
    // $FlowFixMe: Intersection type error.
    return state.setIn(["models", comm_id].concat(path), value);
  }

  // Default to overwrite / replace for now
  return state.setIn(["models", comm_id], Immutable.fromJS(data));
}

type CommAction = RegisterCommTargetAction | CommMessageAction | CommOpenAction;

export default function(
  state: CommState = defaultCommState,
  action: CommAction
) {
  switch (action.type) {
    case "REGISTER_COMM_TARGET":
      return registerCommTarget(state, action);
    case "COMM_OPEN":
      return processCommOpen(state, action);
    case "COMM_MESSAGE":
      return processCommMessage(state, action);
    default:
      (action: empty);
      return state;
  }
}
