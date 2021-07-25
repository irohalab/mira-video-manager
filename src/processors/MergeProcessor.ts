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
import { JobMessage } from '../domains/JobMessage';
import { Action } from '../domains/Action';

export class MergeProcessor implements VideoProcessor {
    cancel(): Promise<void> {
        return Promise.resolve(undefined);
    }

    prepare(jobMessage: JobMessage, action: Action): Promise<void> {
        return Promise.resolve();
    }

    process(action: Action): Promise<string> {
        return Promise.resolve('');
    }

    dispose(): Promise<void> {
        return Promise.resolve(undefined);
    }

    registerLogHandler(callback: (logChunk: string, ch: ("stdout" | "stderr")) => void): void {
    }

}