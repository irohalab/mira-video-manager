/*
 * Copyright 2021 IROHA LAB
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

import { Response as ExpressResponse } from 'express';
import { controller, httpGet, interfaces, requestParam, response } from 'inversify-express-utils';
import { inject } from 'inversify';
import { TYPES } from '../../TYPES';
import { ConfigManager } from '../../utils/ConfigManager';
import { join } from 'path';
import { stat } from 'fs/promises';

@controller('/video')
export class VideoController implements interfaces.Controller {
    private readonly _videoTempPath: string;
    private readonly _message404 = 'file not found';
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager) {
        this._videoTempPath = this._configManager.videoFileTempDir();
    }

    @httpGet('/output/:messageId/:filename')
    public async downloadOutputVideo(@requestParam('messageId') messageId: string,
                         @requestParam('filename') filename: string,
                         @response() res: ExpressResponse): Promise<void> {
        const fileLocalPath = join(this._videoTempPath, messageId, filename);
        console.log('fileLocalPath', fileLocalPath);
        try {
            const fsStatObj = await stat(fileLocalPath);
            if (!fsStatObj.isFile()) {
                res.status(404).json({'message': this._message404});
                return;
            }
            res.download(fileLocalPath, filename);
        } catch (e) {
            if (e.code === 'ENOENT') {
                res.status(404).json({'message': this._message404});
            }
        }
    }
}