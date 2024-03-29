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

import { Action } from './Action';
import { ExtractSource } from './ExtractSource';
import { ExtractTarget } from './ExtractTarget';
import { ActionType } from './ActionType';

/**
 * Action that extract files, streams or subtitles from message.
 * This action cannot have upstream action
 */
export class ExtractAction extends Action {
    public type = ActionType.Extract;
    public videoFilePath: string;
    public otherFilePaths: string[];
    public extractFrom: ExtractSource;
    public extractTarget: ExtractTarget;
    // If file is extracted from subtitle files, outputExtname must be provided or the outputPath extension name will
    // be by default .vtt, this may cause an issue.
    public outputExtname: string;
    public extractRegex: string;
    public extractorId: string;
    public extraData: any;
}