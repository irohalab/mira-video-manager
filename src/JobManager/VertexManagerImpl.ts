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
import { getFileLogger, LOG_END_FLAG } from '../utils/Logger';
import { join } from 'path';
import { EVENT_VERTEX_FAIL, TERMINAL_VERTEX_FINISHED, VERTEX_MANAGER_LOG, VertexManager } from './VertexManager';
import { VertexMap } from '../domains/VertexMap';
import { TaskQueue } from '../domains/TaskQueue';
import { clearTimeout } from 'timers';
import { VertexRepository } from '../repository/VertexRepository';

const CHECK_QUEUE_INTERVAL = 500;

@injectable()
export class VertexManagerImpl implements VertexManager {
    public events = new EventEmitter();
    private _logPath: string;
    private _vertexLoggerDict: {[vxId: string]: pino.Logger} = {};
    private _job: Job;
    private _pendingExecutingVertexQueue = new TaskQueue<string>();
    private _checkQueueTimer: NodeJS.Timeout;

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
                this.addVertexToQueue(vertexId);
            }
        });
        await this.checkAndExecuteVertexFromQueue();
    }

    public async stop(): Promise<void> {
        clearTimeout(this._checkQueueTimer);
        if (this._job) {
            await this.cancelVertices();
        }
    }

    /**
     * A utility method which creates all vertices of a job base on action map.
     * The job is passed from argument because this method usually called before start() method
     * @param job
     */
    public async createAllVertices(job: Job): Promise<void> {
        const vertexRepo = this._databaseService.getVertexRepository();
        const actionIdToVertexIdMap: {[idx: string]: string} = {};
        const vertices = Object.keys(job.actionMap).map((actionId: string) => {
            const action = job.actionMap[actionId];
            const vertex = new Vertex();
            vertex.jobId = job.id;
            vertex.action = action;
            vertex.actionType = action.type;
            vertex.status = VertexStatus.Pending;
            actionIdToVertexIdMap[action.id] = vertex.id;
            return vertex;
        });

        vertices.forEach((vertex: Vertex) => {
            if (vertex.action.upstreamActionIds.length > 0) {
                vertex.action.upstreamActionIds.forEach((actionId: string) => {
                    vertex.upstreamVertexIds.push(actionIdToVertexIdMap[actionId]);
                });
            }
            if (vertex.action.downstreamIds.length > 0) {
                vertex.action.downstreamIds.forEach((actionId: string) => {
                    vertex.downstreamVertexIds.push(actionIdToVertexIdMap[actionId]);
                });
            }
        });
        await vertexRepo.save(vertices);
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

    private addVertexToQueue(vertexId: string): void {
        this._pendingExecutingVertexQueue.add(vertexId);
    }

    private async checkAndExecuteVertexFromQueue(): Promise<void> {
        const vxQueueNode = this._pendingExecutingVertexQueue.peek();
        if (vxQueueNode) {
            const vertexId = vxQueueNode.value;
            const vertexRepo = this._databaseService.getVertexRepository();
            try {
                const vertexMap = await vertexRepo.getVertexMap(this._job.id);
                const vertex = vertexMap[vertexId];
                const allUpstreamFinished = vertex.upstreamVertexIds
                    .map(upVxId => vertexMap[upVxId])
                    .every(vx => vx.status === VertexStatus.Finished);
                if (allUpstreamFinished) {
                    this._pendingExecutingVertexQueue.poll();
                    this.executeVertex(vertex);
                }
            } catch (err) {
                this.events.emit(VERTEX_MANAGER_LOG, {level: 'error', message: err});
                this._sentry.capture(err);
            }
        }

        this._checkQueueTimer = setTimeout(async () => {
            if (this._job.status === JobStatus.Running) {
                await this.checkAndExecuteVertexFromQueue();
            }
        }, CHECK_QUEUE_INTERVAL);
    }

    private executeVertex(vertex: Vertex): void {
        if (vertex.status === VertexStatus.Finished) {
            this.onVertexFinished(vertex.id);
            return;
        }
        this.events.emit(VERTEX_MANAGER_LOG, { level: 'info', message: 'start executing vertex ( ' + vertex.id + ' )' });
        const vertexLogger = this._vertexLoggerDict[vertex.id];
        const vertexRepo = this._databaseService.getVertexRepository();
        vertex.videoProcessor = this._processorFactory(vertex.actionType);
        vertex.videoProcessor.registerLogHandler((logChunk, ch) => {
            if (ch === 'stderr') {
                vertexLogger.error(logChunk);
            } else {
                vertexLogger.info(logChunk);
            }
        });
        vertex.status = VertexStatus.Running;
        vertex.startTime = new Date();
        vertexRepo.save(vertex)
            .then(() => {
                return this.executeVertexAsync(vertex, vertexLogger, vertexRepo);
            });
    }

    private async executeVertexAsync(vertex: Vertex, vertexLogger: pino.Logger, vertexRepo: VertexRepository): Promise<void> {
        const jobMessage = this._job.jobMessage;
        try {
            vertexLogger.info('prepare for processing');
            await vertex.videoProcessor.prepare(jobMessage, vertex);
            vertexLogger.info('start processing');
            vertex.outputPath = await vertex.videoProcessor.process(vertex);
            vertexLogger.info(`vertex finished, output: ${vertex.outputPath}`);
            await vertexRepo.save(vertex);
            await vertex.videoProcessor.dispose();
            this.onVertexFinished(vertex.id);
        } catch (error) {
            vertexLogger.error(error);
            this.onVertexError(vertex.id, error);
            await vertex.videoProcessor.dispose();
        } finally {
            vertex.videoProcessor = null;
        }
    }

    private onVertexFinished(vertexId: string): void {
        const vertexRepo = this._databaseService.getVertexRepository();
        vertexRepo.getVertexMap(this._job.id)
            .then((vertexMap: VertexMap) => {
                const vertex = vertexMap[vertexId];
                vertex.status = VertexStatus.Finished;
                vertex.finishedTime = new Date();
                vertexRepo.save(vertex)
                    .then(() => {
                        if (vertex.downstreamVertexIds.length === 0) {
                            // this vertex is terminal vertex
                            this.events.emit(TERMINAL_VERTEX_FINISHED);
                        } else {
                            // find downstream vertices and execute them if all their upstream vertices are finished.
                            for (const vxId of vertex.downstreamVertexIds) {
                                this.addVertexToQueue(vxId);
                            }
                        }
                        this._vertexLoggerDict[vertexId].info(`vertex finalized`);
                        this._vertexLoggerDict[vertexId].info(LOG_END_FLAG);
                    })
                    .catch((error) => {
                        this._vertexLoggerDict[vertexId].info(error);
                        this.onVertexError(vertexId, error);
                    });
            });
    }

    private onVertexError(vertexId: string, error: any): void {
        const vertexRepo = this._databaseService.getVertexRepository();
        vertexRepo.findOne({id: vertexId})
            .then((vertex: Vertex) => {
                error.vertexId = vertexId;
                error.errorType = 'ERR_VERTEX_FAIL';
                vertex.status = VertexStatus.Error;
                vertex.error = error;
                this.events.emit(EVENT_VERTEX_FAIL, error);
                return vertexRepo.save(vertex);
            })
            .then(() => {
                this._vertexLoggerDict[vertexId].info(LOG_END_FLAG);
            })
            .catch((err) => {
                // save error
                this._sentry.capture(err);
                this._vertexLoggerDict[vertexId].error(err);
                this._vertexLoggerDict[vertexId].info(LOG_END_FLAG);
            });
    }
}