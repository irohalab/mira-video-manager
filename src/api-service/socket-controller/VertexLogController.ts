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

import { DatabaseService } from '../../services/DatabaseService';
import { ConfigManager } from '../../utils/ConfigManager';
import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { connectedSocket, controller, onMessage, payload } from 'inversify-socket-utils';
import { Socket } from 'socket.io';
import { verifySession } from '../SocketSessionUtils';
import { join } from 'path';
import { closeSocketWithError, isFileExists, readToEnd, tailing } from '../log-streaming-helper';
import { VertexStatus } from '../../domains/VertexStatus';

@injectable()
@controller('/vertex-log')
export class VertexLogController {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
    }

    @onMessage('log_stream')
    public async message(@connectedSocket() socket: Socket, @payload() msg: any): Promise<void> {
        const jobId = msg.jobId;
        const vertexId = msg.vertexId;
        if (!jobId || !vertexId) {
            closeSocketWithError(socket, 'no job id or vertex id');
            return;
        }
        if (!await verifySession(msg, this._databaseService)) {
            closeSocketWithError(socket, 'no valid session');
            return;
        }
        const vertexLogPath = join(this._configManager.jobLogPath(), jobId, `vertex-${vertexId}.json`);
        if (!await isFileExists(vertexLogPath)) {
            closeSocketWithError(socket, 'log file does not exist');
        }
        const vertex = await this._databaseService.getVertexRepository(true).findOne({ id: vertexId });
        if (!vertex) {
            closeSocketWithError(socket, 'vertex not exists');
        }
        if (vertex.status === VertexStatus.Pending || vertex.status === VertexStatus.Running) {
            tailing(vertexLogPath, socket, true);
        } else {
            readToEnd(vertexLogPath, socket);
        }
    }
}