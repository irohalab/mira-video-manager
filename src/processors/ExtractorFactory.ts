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

import { Extractor, ExtractorLogger } from './extractors/Extractor';
import { ExtractAction } from '../domains/ExtractAction';
import { DefaultExtractor } from './extractors/DefaultExtractor';
import { interfaces } from 'inversify';
import { Vertex } from '../entity/Vertex';
import * as assert from 'assert';
import { ActionType } from '../domains/ActionType';
import { FileExtractor } from './extractors/FileExtractor';
import { SubtitleExtractor } from './extractors/SubtitleExtractor';
import { AudioExtractor } from './extractors/AudioExtractor';
import pino from 'pino';

export type ExtractorInitiator = (vertex: Vertex, logger: (log: string, severity: pino.Level) => void) => Extractor;

export function ExtractorFactory(context: interfaces.Context): ExtractorInitiator {
    return (vertex: Vertex, logger: ExtractorLogger) => {
        assert(vertex.actionType === ActionType.Extract, "action must be ExtractAction");
        const action = vertex.action as ExtractAction;
        switch (action.extractorId) {
            case DefaultExtractor.Id:
                return new DefaultExtractor(vertex, logger);
            case FileExtractor.Id:
                return new FileExtractor(vertex, logger);
            case SubtitleExtractor.Id:
                return new SubtitleExtractor(vertex, logger);
            case AudioExtractor.Id:
                return new AudioExtractor(vertex, logger);
            default:
                throw new Error('No Extractor found for Id ' + action.extractorId);
        }
    }
}