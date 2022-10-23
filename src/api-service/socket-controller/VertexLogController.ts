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

import { LogControllerBase } from './LogControllerBase';
import { DatabaseService } from '../../services/DatabaseService';
import { ConfigManager } from '../../utils/ConfigManager';
import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { connectedSocket, controller, onMessage, payload } from 'inversify-socket-utils';
import { Socket } from 'socket.io';
import { verifySession } from '../SocketSessionUtils';
import { join } from 'path';

@injectable()
@controller('/vertex-log')
export class VertexLogController extends LogControllerBase {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
        super();
    }

    @onMessage('get_vertex_log')
    public async message(@connectedSocket() socket: Socket, @payload() msg: any): Promise<void> {
        const jobId = msg.jobId;
        const vertexId = msg.vertexId;
        if (!jobId || vertexId) {
            this.closeSocketWithError(socket, 'no job id or vertex id');
        }
        if (!await verifySession(msg, this._databaseService)) {
            this.closeSocketWithError(socket, 'no valid session');
        }
        const vertexLogPath = join(this._configManager.jobLogPath(), jobId, `vertex-${vertexId}.json`);
        if (!await this.isFileExists(vertexLogPath)) {
            this.closeSocketWithError(socket, 'log file does not exist');
        }
        this.tail(vertexLogPath, socket);
    }
}