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

import { inject, injectable } from 'inversify';
import { TYPES_VM } from '../TYPES';
import { Job } from '../entity/Job';
import { Vertex } from '../entity/Vertex';
import { Action } from '../domains/Action';
import { ProcessorFactoryInitiator } from '../processors/ProcessorFactory';
import pino from 'pino';
import { JobStatus } from '../domains/JobStatus';
import { TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';
import { VertexStatus } from '../domains/VertexStatus';

const logger = pino();

@injectable()
export class VerticesManager {
    private _job: Job;
    constructor(@inject(TYPES_VM.ProcessorFactory) private _processorFactory: ProcessorFactoryInitiator,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    public async pause(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        this._job.status = JobStatus.Pause;
        this._job = await jobRepo.save(this._job) as Job;
        this.cancelVertices();
    }

    public async start(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        this._job.status = JobStatus.Running;
        this._job = await jobRepo.save(this._job) as Job;
        const vertexMap = this._job.jobVertexMap;
        // Start executing vertex from all initiator vertices
        Object.keys(vertexMap).forEach((vertexId) =>{
            if (vertexMap[vertexId].upstreamVertexIds.length === 0) {
                this.executeVertex(vertexMap[vertexId]);
            }
        });
    }

    public async cancel(): Promise<void> {
        const jobRepo = this._databaseService.getJobRepository();
        this._job.status = JobStatus.Canceled;
        this._job = await jobRepo.save(this._job) as Job;
        this.cancelVertices();
    }

    private cancelVertices(): void {
        const vertexMap = this._job.jobVertexMap;
        Object.keys(vertexMap).forEach(vertexId => {
            const vertex = vertexMap[vertexId];
            if (vertex.status === VertexStatus.Running && vertex.videoProcessor) {
                vertex.videoProcessor.cancel().catch((error) => {
                    logger.error(error);
                });
            }
        });
    }

    private executeVertex(vertex: Vertex): void {
        if (vertex.status === VertexStatus.Finished) {
            this.onVertexFinished(vertex.id);
        }
        const jobMessage = this._job.jobMessage;
        vertex.videoProcessor = this._processorFactory(vertex.type);

        vertex.videoProcessor.prepare(jobMessage, vertex)
            .then(() => {
                return vertex.videoProcessor.process(vertex as Action);
            })
            .then((output) => {
                this.onVertexFinished(vertex.id);
            })
            .catch((error) => {
                this.onVertexError(vertex.id);
            });
    }

    private onVertexFinished(vertexId: string): void {
        const vertexMap = this._job.jobVertexMap;
        const vertex = vertexMap[vertexId];
        // clean up videoProcessor
        vertex.videoProcessor.dispose().catch((error) => {
            vertex.videoProcessor = null;
            logger.error(error);
        });
        for (const vxId of vertex.downstreamVertexIds) {
            const vx = vertexMap[vxId];
            for (let i = 0 ; i < vx.upstreamVertexIds.length; i++) {
                if (vx.upstreamVertexIds[i] === vertex.id) {
                    vx.upstreamVertexFinished[i] = true;
                    break;
                }
            }
            if (vx.upstreamVertexFinished.every(v => v)) {
                this.executeVertex(vx);
            }
        }
    }

    private onVertexError(vertexId: string): void {

    }
}