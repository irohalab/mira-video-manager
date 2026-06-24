/*
 * Copyright 2026 IROHA LAB
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

import {
    BaseHttpController,
    controller,
    httpGet,
    httpPost,
    httpPut,
    IHttpActionResult,
    interfaces,
    queryParam,
    request,
    requestBody,
    requestParam,
    response
} from 'inversify-express-utils';
import { Request, Response as ExpressResponse } from 'express';
import { DatabaseService } from '../../services/DatabaseService';
import { inject } from 'inversify';
import { JobStatus } from '../../domains/JobStatus';
import {
    JsonResultFactory,
    RabbitMQService,
    TYPES
} from '@irohalab/mira-shared';
import { CMD_CANCEL, CMD_PAUSE, CMD_RESUME, CommandMessage } from '../../domains/CommandMessage';
import { getStdLogger } from '../../utils/Logger';
import { Job } from '../../entity/Job';
import { VIDEO_MANAGER_COMMAND_EXCHANGE } from '../../TYPES';
import { JobReconciliationService } from '../../services/JobReconciliationService';

type Operation = {action: string};

const OP_PAUSE = 'pause';
const OP_CANCEL = 'cancel';
const OP_RESUME = 'resume';

const logger = getStdLogger();

@controller('/job')
export class JobController extends BaseHttpController implements interfaces.Controller {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.RabbitMQService) private _mqService: RabbitMQService,
                private _reconciliationService: JobReconciliationService) {
        super();
    }

    @httpGet('/')
    public async listJobs(@queryParam('status') jobStatus: string, @queryParam('bangumiId') bangumiId: string): Promise<IHttpActionResult> {
        const status = jobStatus as JobStatus | 'all';
        let jobs: Partial<Job>[];
        try {
            jobs = await this._databaseService.getJobRepository(true).listJobs(status, bangumiId);
            return this.json({
                data: jobs,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            return JsonResultFactory(500);
        }
    }

    /**
     * Reconcile finished jobs whose completion notification was never delivered
     * to the streaming platform (e.g. jobs finished while the legacy RPC endpoint
     * was unavailable). Re-publishes the VideoManagerMessage so the download
     * manager re-runs its pipeline and emits the download_complete message.
     *
     * The request body must provide the `videoFileIds` to reconcile (the UI knows
     * which video files are still pending), so only the matching finished jobs are
     * replayed.
     */
    @httpPost('/reconcile')
    public async reconcileFinishedJobs(@requestBody() body: { videoFileIds: string[] }): Promise<IHttpActionResult> {
        const videoFileIds = body && Array.isArray(body.videoFileIds)
            ? body.videoFileIds.filter(id => typeof id === 'string' && id.length > 0)
            : [];
        if (videoFileIds.length === 0) {
            return JsonResultFactory(400, { message: 'videoFileIds is required and must be a non-empty array', status: 1 });
        }
        try {
            const result = await this._reconciliationService.reconcileFinishedJobs(videoFileIds);
            return this.json({
                data: result,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            return JsonResultFactory(500);
        }
    }

    @httpGet('/:jobId')
    public async getJob(@requestParam('jobId') jobId: string): Promise<IHttpActionResult> {
        try {
            const job = await this._databaseService.getJobRepository().findOne({id: jobId});
            return this.json({
                data: job,
                status: job ? 0 : 1
            });
        } catch (ex) {
            logger.warn(ex);
            return JsonResultFactory(500);
        }
    }

    @httpGet('/:jobId/vertex')
    public async getVerticesByJobId(@requestParam('jobId') jobId: string): Promise<IHttpActionResult> {
        try {
            const vertices = await this._databaseService.getVertexRepository().find({ jobId });
            return this.json({
                data: vertices,
                status: 0
            });
        } catch (ex) {
            return JsonResultFactory(500);
        }
    }

    @httpPut('/:jobId/op')
    public async jobOperation(@request() req: Request, @response() res: ExpressResponse): Promise<IHttpActionResult> {
        const jobId = req.params.jobId;
        const op = req.body as Operation;
        const cmd = new CommandMessage();
        cmd.jobId = jobId;
        switch (op.action) {
            case OP_PAUSE:
                cmd.command = CMD_PAUSE;
                return this.json({message: 'action unsupported', status: 1});
            case OP_CANCEL:
                cmd.command = CMD_CANCEL;
                break;
            case OP_RESUME:
                cmd.command = CMD_RESUME;
                break;
            default:
                return JsonResultFactory(400);
        }
        await this._mqService.publish(VIDEO_MANAGER_COMMAND_EXCHANGE, '', cmd);
        return this.json({message: 'action sent', status: 0});
    }

    @httpPost('/session')
    public async createSocketIOSession(): Promise<IHttpActionResult> {
        try {
            const repo = this._databaseService.getSessionRepository();
            const sessionId = await repo.newSession();
            return this.json({
                data: sessionId,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            return JsonResultFactory(500);
        }

    }
}