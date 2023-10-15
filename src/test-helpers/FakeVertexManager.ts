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

import { EVENT_VERTEX_FAIL, TERMINAL_VERTEX_FINISHED, VertexManager } from '../JobManager/VertexManager';
import { EventEmitter } from 'events';
import { Job } from '../entity/Job';
import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';

@injectable()
export class FakeVertexManager implements VertexManager {
    public events = new EventEmitter();

    public _job: Job;
    public vxCanceled = false;
    public vxCreated = false;

    constructor(@inject(TYPES.DatabaseService) private _database: DatabaseService) {
    }

    public cancelVertices(): Promise<void> {
        this.vxCanceled = true;
        return Promise.resolve(undefined);
    }

    public start(job: Job, jobLogPath: string): Promise<void> {
        this._job = job;
        return Promise.resolve(undefined);
    }

    public completeAllVertices(): void {
        this.events.emit(TERMINAL_VERTEX_FINISHED, null);
    }

    public failAnyVertex(): void {
        this.events.emit(EVENT_VERTEX_FAIL, new Error('mock vertex error'));
    }

    public createAllVertices(job: Job): Promise<void> {
        this.vxCreated = true;
        return Promise.resolve(undefined);
    }

    public async stop(): Promise<void> {
        await this.cancelVertices();
        return Promise.resolve(undefined);
    }

    public recreateCanceledVertices(job: Job): Promise<void> {
        return Promise.resolve(undefined);
    }

}