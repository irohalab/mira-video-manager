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
    requestParam,
    response
} from 'inversify-express-utils';
import { Request, Response as ExpressResponse } from 'express';
import { DatabaseService } from '../../services/DatabaseService';
import { inject } from 'inversify';
import { JobStatus } from '../../domains/JobStatus';
import { RabbitMQService, TYPES, VIDEO_MANAGER_COMMAND, VIDEO_MANAGER_EXCHANGE } from '@irohalab/mira-shared';
import { CMD_CANCEL, CMD_PAUSE, CMD_RESUME, CommandMessage } from '../../domains/CommandMessage';
import { getStdLogger } from '../../utils/Logger';
import { BadRequestResult, InternalServerErrorResult } from 'inversify-express-utils/lib/results';

type Operation = {action: string};

const OP_PAUSE = 'pause';
const OP_CANCEL = 'cancel';
const OP_RESUME = 'resume';

const logger = getStdLogger();

@controller('/job')
export class JobController extends BaseHttpController implements interfaces.Controller {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.RabbitMQService) private _mqService: RabbitMQService) {
        super();
    }

    @httpGet('/')
    public async listJobs(@queryParam('status') jobStatus: string): Promise<IHttpActionResult> {
        const status = jobStatus as JobStatus;
        try {
            const jobs = await this._databaseService.getJobRepository().getJobsByStatus(status);
            return this.json({
                data: jobs,
                status: 0
            });
        } catch (ex) {
            logger.warn(ex);
            return new InternalServerErrorResult();
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
            return new InternalServerErrorResult();
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
            return new InternalServerErrorResult();
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
                break;
            case OP_CANCEL:
                cmd.command = CMD_CANCEL;
                break;
            case OP_RESUME:
                cmd.command = CMD_RESUME;
                break;
            default:
                return new BadRequestResult();
        }
        await this._mqService.publish(VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_COMMAND, cmd);
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
            return new InternalServerErrorResult();
        }

    }
}