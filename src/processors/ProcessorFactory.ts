/*
 * Copyright 2023 IROHA LAB
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
import { LocalConvertProcessor } from './LocalConvertProcessor';
import { NotImplementException } from '@irohalab/mira-shared';
import { TYPES_VM } from '../TYPES';
import { LocalExtractProcessor } from './LocalExtractProcessor';
import { LocalVideoValidateProcessor } from './LocalVideoValidateProcessor';

export function ProcessorFactory(context: interfaces.Context): ProcessorFactoryInitiator {
    return (actionType: ActionType) => {
        switch (actionType) {
            case ActionType.Extract:
                return context.container.get<LocalExtractProcessor>(TYPES_VM.LocalExtractProcessor);
            case ActionType.Copy:
                throw new NotImplementException();
            case ActionType.Convert:
                return context.container.get<LocalConvertProcessor>(TYPES_VM.LocalConvertProcessor);
            case ActionType.Validate:
                return context.container.get<LocalVideoValidateProcessor>(TYPES_VM.LocalValidateProcessor);
            case ActionType.Fragment:
                throw new NotImplementException();
            default:
                throw new Error('ActionType not support');
        }
    };
}

export type ProcessorFactoryInitiator = (actionType: ActionType) => VideoProcessor;