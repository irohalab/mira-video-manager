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

import { inject, injectable } from 'inversify';
import { ConfigManager } from '../utils/ConfigManager';
import { URL } from 'url';
import { copyFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { createWriteStream } from 'fs';
import { finished } from 'stream/promises';
import axios from 'axios';
import { RemoteFile, Sentry, TYPES } from '@irohalab/mira-shared';
import { getStdLogger } from '../utils/Logger';

const logger = getStdLogger();

@injectable()
export class FileManageService {
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public getLocalPath(filename: string, messageId: string): string {
        return join(this._configManager.videoFileTempDir(), messageId, filename);
    }

    public async checkExists(filename: string, messageId: string): Promise<boolean> {
        try {
            const fileStats = await stat(this.getLocalPath(filename, messageId));
            return fileStats.isFile();
        } catch (err) {
            if (err.code === 'ENOENT') {
                return false
            } else {
                throw err;
            }
        }
    }

    public getFileUrlOrLocalPath(remoteFile: RemoteFile, appId: string): RemoteFile {
        const idHostMap = this._configManager.appIdHostMap();
        const host = idHostMap[appId];
        const convertedRemoteFile =  new RemoteFile();
        convertedRemoteFile.filename = remoteFile.filename;
        if (host) {
            const hostURLObj = new URL(host);
            if (hostURLObj.hostname === 'localhost') {
                convertedRemoteFile.fileLocalPath = remoteFile.fileLocalPath;
            } else {
                // replace part
                const fileURLObj = new URL(remoteFile.fileUri);
                fileURLObj.host = hostURLObj.host;
                fileURLObj.protocol = hostURLObj.protocol;
                fileURLObj.pathname = FileManageService.trimEndSlash(hostURLObj.pathname) + fileURLObj.pathname;
                convertedRemoteFile.fileUri = fileURLObj.toString();
            }
        } else {
            convertedRemoteFile.fileUri = remoteFile.fileUri;
        }
        return convertedRemoteFile;
    }

    public async downloadFile(remoteFile: RemoteFile, appId: string, messageId: string): Promise<string> {
        const convertedRemoteFile = this.getFileUrlOrLocalPath(remoteFile, appId);
        const destPath = this.getLocalPath(remoteFile.filename, messageId);
        // create folder if not exists
        try {
            await mkdir(dirname(destPath), { recursive: true });
        } catch (err) {
            this._sentry.capture(err);
            logger.warn(err);
        }
        if (convertedRemoteFile.fileLocalPath) {
            // COPY local file
            try {
                await copyFile(convertedRemoteFile.fileLocalPath, destPath);
            } catch (err) {
                this._sentry.capture(err);
                logger.warn(err);
            }
        } else {
            await FileManageService.getVideoViaHttp(convertedRemoteFile.fileUri, destPath);
        }

        return destPath;
    }

    public async cleanUpFiles(jobMessageId: string): Promise<void> {
        const tempDir = join(this._configManager.videoFileTempDir(), jobMessageId);
        try {
            const files = await readdir(tempDir);
            for (const file of files) {
                await unlink(join(tempDir, file));
            }
        } catch (err) {
            this._sentry.capture(err);
            logger.error(err);
        }
    }

    public async localRemove(filePath: string): Promise<boolean> {
        try {
            await unlink(filePath);
            return true;
        } catch (err) {
            this._sentry.capture(err);
            logger.error(err);
            return false;
        }
    }

    public async localCopy(src: string, dest: string): Promise<void> {
        try {
            await copyFile(src, dest);
        } catch (ex) {
            this._sentry.capture(ex);
            logger.error(ex);
        }
    }

    private static async getVideoViaHttp(sourceUrl: string, savePath: string): Promise<void> {
        const writer = createWriteStream(savePath);
        const response = await axios.get(sourceUrl, {
            responseType: 'stream'
        });
        response.data.pipe(writer);
        await finished(writer);
    }

    private static trimEndSlash(pathSeg: string) {
        return pathSeg.endsWith('/') ? pathSeg.substring(0, pathSeg.length - 1) : pathSeg;
    }
}