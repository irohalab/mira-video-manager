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

import { JobMessage } from '../domains/JobMessage';
import { Vertex } from '../entity/Vertex';

export interface VideoProcessor {
    /**
     * Prepare Action object based on jobMessage
     * @param jobMessage
     * @param vertex
     */
    prepare(jobMessage: JobMessage, vertex: Vertex): Promise<void>;

    /**
     * Process the video files
     * @param vertex
     */
    process(vertex: Vertex): Promise<string>;

    /**
     * Cancel current process
     */
    cancel(): Promise<void>;

    /**
     * Use to update log in realtime
     * @param callback
     */
    registerLogHandler(callback: (logChunk: string, ch: 'stdout' | 'stderr') => void): void;

    /**
     * dispose this object, clean up handlers etc.
     */
    dispose(): Promise<void>;
}