/*
 * Copyright 2021 IROHA LAB
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

import { VideoProcessor } from './VideoProcessor';
import { interfaces } from 'inversify';
import { ActionType } from '../domains/ActionType';
import { TYPES } from '../TYPES';
import { LocalConvertProcessor } from './LocalConvertProcessor';
import { NotImplementException } from '../exceptions/NotImplementException';

export function ProcessorFactory(context: interfaces.Context): ProcessorFactoryInitiator {
    return (actionType: ActionType) => {
        switch (actionType) {
            case ActionType.Copy:
                throw new NotImplementException();
            case ActionType.Convert:
                return context.container.get<LocalConvertProcessor>(TYPES.LocalConvertProcessor);
            case ActionType.Fragment:
                throw new NotImplementException();
        }
    };
}

export type ProcessorFactoryInitiator = (actionType: ActionType) => VideoProcessor;