/*
 * Copyright 2022 IROHA LAB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ActionMap } from '../domains/ActionMap';

export function findFinalActionsId(actionMap: ActionMap): string[] {
    return Object.keys(actionMap).filter(actionId => {
        return actionMap[actionId].downstreamIds.length === 0;
    });
}

export function reverseTraverse(actionId: string, actionMap: ActionMap, actionIds: string[]): void {
    const action = actionMap[actionId];
    if (action.isFinished || action.upstreamActionIds.length === 0) {
        actionIds.push(action.id);
        return;
    }
    for (const actId of action.upstreamActionIds) {
        reverseTraverse(actId, actionMap, actionIds);
    }
}