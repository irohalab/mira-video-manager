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

import { Job } from '../entity/Job';
import { EventEmitter } from 'events';

export interface VertexManager {
    events: EventEmitter;
    createAllVertices(job: Job): Promise<void>;
    recreateCanceledVertices(job: Job): Promise<void>;
    start(job: Job, jobLogPath: string): Promise<void>;
    stop(): Promise<void>;
    cancelVertices(): Promise<void>;
}

export const EVENT_VERTEX_FAIL = 'vertex_fail';
export const TERMINAL_VERTEX_FINISHED = 'terminal_vertex_finished';
export const VERTEX_MANAGER_LOG = 'vertex_manager_log';