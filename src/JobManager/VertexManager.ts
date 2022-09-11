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
import { ProcessorFactoryInitiator } from '../processors/ProcessorFactory';
import pino from 'pino';
import { JobStatus } from '../domains/JobStatus';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { DatabaseService } from '../services/DatabaseService';
import { VertexStatus } from '../domains/VertexStatus';
import { ConfigManager } from '../utils/ConfigManager';
import { EventEmitter } from 'events';
import { getFileLogger } from '../utils/Logger';
import { join } from 'path';

@injectable()
export class VertexManager {
    public static EVENT_VERTEX_FAIL = 'vertex_fail';
    public static TERMINAL_VERTEX_FINISHED = 'terminal_vertex_finished';
    public events = new EventEmitter();
    private _logPath: string;
    private _vertexLoggerDict: {[vxId: string]: pino.Logger} = {};
    private _job: Job;

    constructor(@inject(TYPES_VM.ProcessorFactory) private _processorFactory: ProcessorFactoryInitiator,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public async start(job: Job, jobLogPath: string): Promise<void> {
        this._job = job;
        this._logPath = jobLogPath;
        const vertexRepo = this._databaseService.getVertexRepository();
        const vertexMap = await vertexRepo.getVertexMap(this._job.id);
        // Start executing vertex from all initiator vertices
        Object.keys(vertexMap).forEach((vertexId) => {
            this._vertexLoggerDict[vertexId] = getFileLogger(join(this._logPath, `vertex-${vertexId}.json`));
            if (vertexMap[vertexId].upstreamVertexIds.length === 0) {
                this.executeVertex(vertexMap[vertexId]);
            }
        });
    }

    /**
     * cancel all running vertices, save each vertex status to VertexStatus.Canceled.
     * waiting until all vertices canceled.
     */
    public async cancelVertices(): Promise<void> {
        const vertexRepo = this._databaseService.getVertexRepository();
        const vertexMap = await vertexRepo.getVertexMap(this._job.id);
        const allPromise = [];
        Object.keys(vertexMap).forEach(vertexId => {
            const vertex = vertexMap[vertexId];
            const vertexLogger = this._vertexLoggerDict[vertexId];
            if (vertex.status === VertexStatus.Running && vertex.videoProcessor) {
                allPromise.push(vertex.videoProcessor.cancel()
                    .then(() => {
                        vertex.status = VertexStatus.Canceled;
                        return vertexRepo.save(vertex);
                    })
                    .then(() => {
                        vertexLogger.warn('vertex canceled');
                    })
                    .catch((error) => {
                        vertexLogger.error(error);
                    }));
            }
        });
        await Promise.all(allPromise);
    }

    private executeVertex(vertex: Vertex): void {
        if (vertex.status === VertexStatus.Finished) {
            this.onVertexFinished(vertex.id);
        }
        const vertexLogger = this._vertexLoggerDict[vertex.id];
        const vertexRepo = this._databaseService.getVertexRepository();
        const jobMessage = this._job.jobMessage;
        vertex.videoProcessor = this._processorFactory(vertex.actionType);
        vertex.status = VertexStatus.Running;
        vertex.startTime = new Date();
        vertexRepo.save(vertex)
            .then(() => {
                vertexLogger.info('prepare for processing');
                return vertex.videoProcessor.prepare(jobMessage, vertex);
            })
            .then(() => {
                vertexLogger.info('start processing');
                return vertex.videoProcessor.process(vertex);
            })
            .then((output) => {
                vertexLogger.info(`vertex finished, output: ${output}`);
                this.onVertexFinished(vertex.id);
            })
            .catch((error) => {
                vertexLogger.error(error);
                this.onVertexError(vertex.id, error);
            });
    }

    private onVertexFinished(vertexId: string): void {
        const vertexRepo = this._databaseService.getVertexRepository();
        const vertexMap = vertexRepo.getVertexMap(this._job.id);
        const vertex = vertexMap[vertexId];
        vertex.status = VertexStatus.Finished;
        vertex.finishedTime = new Date();
        vertexRepo.save(vertex)
            .then(() => {
                if (vertex.downstreamVertexIds.length === 0) {
                    // this vertex is terminal vertex
                    this.events.emit(VertexManager.TERMINAL_VERTEX_FINISHED);
                } else {
                    // find downstream vertices and execute if its all upstream vertices is finished.
                    for (const vxId of vertex.downstreamVertexIds) {
                        const vx = vertexMap[vxId];
                        for (let i = 0; i < vx.upstreamVertexIds.length; i++) {
                            if (vx.upstreamVertexIds[i] === vertex.id) {
                                vx.upstreamVertexFinished[i] = true;
                                break;
                            }
                        }
                        if (this._job.status === JobStatus.Running && vx.upstreamVertexFinished.every(v => v)) {
                            this.executeVertex(vx);
                        }
                    }
                }
                // clean up videoProcessor
                return vertex.videoProcessor.dispose();
            })
            .catch((error) => {
                vertex.videoProcessor = null;
                this._vertexLoggerDict[vertexId].error(error);
            });
    }

    private onVertexError(vertexId: string, error: any): void {
        const vertexRepo = this._databaseService.getVertexRepository();
        vertexRepo.findOne({id: vertexId})
            .then((vertex: Vertex) => {
                vertex.status = VertexStatus.Error;
                error.vertexId = vertexId;
                error.errorType = 'ERR_VERTEX_FAIL';
                this.events.emit(VertexManager.EVENT_VERTEX_FAIL, error);
                return vertexRepo.save(vertex);
            })
            .catch((err) => {
                // save error
                this._sentry.capture(err);
                this._vertexLoggerDict[vertexId].error(err);
            });
    }
}