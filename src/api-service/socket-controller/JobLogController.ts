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

import { connectedSocket, controller, onMessage, payload } from 'inversify-socket-utils';
import { inject, injectable } from 'inversify';
import { Socket } from 'socket.io';
import { DatabaseService } from '../../services/DatabaseService';
import { TYPES } from '@irohalab/mira-shared';
import { verifySession } from '../SocketSessionUtils';
import { ConfigManager } from '../../utils/ConfigManager';
import { join } from 'path';
import { JobStatus } from '../../domains/JobStatus';
import { LogControllerBase } from './LogControllerBase';

@injectable()
@controller('/job-log')
export class JobLogController extends LogControllerBase {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
        super();
    }
    @onMessage('get_jm_log')
    public async message(@connectedSocket() socket: Socket, @payload() msg: any): Promise<void> {
        const jobId = msg.jobId;
        const jobLogPath = join(this._configManager.jobLogPath(), jobId);
        if (!jobId) {
            this.closeSocketWithError(socket, 'no job id');
        }
        if (!await verifySession(msg, this._databaseService)) {
            this.closeSocketWithError(socket, 'no valid session');
        }
        if (!await this.isFileExists(jobLogPath)) {
            this.closeSocketWithError(socket, 'log file does not exist');
        }
        const job = await this._databaseService.getJobRepository(true).findOne({ id: jobId });
        if (job.status === JobStatus.Queueing || job.status === JobStatus.Running) {
            this.tail(jobLogPath, socket);
        } else {
            this.readToEnd(jobLogPath, socket);
        }
    }
}