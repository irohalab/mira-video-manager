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

import { VideoProcessor } from './VideoProcessor';
import { JobMessage } from '../domains/JobMessage';
import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManager } from '../utils/ConfigManager';
import { FileManageService } from '../services/FileManageService';
import { TYPES_VM } from '../TYPES';
import { ExtractorInitiator } from './ExtractorFactory';
import { ExtractAction } from '../domains/ExtractAction';

import pino from 'pino';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { Vertex } from '../entity/Vertex';

const logger = pino();

@injectable()
export class LocalExtractProcessor implements VideoProcessor {
    private _logHandler: (logChunk: string, ch: 'stdout' | 'stderr') => void;
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES_VM.ExtractorFactory) private _extractorFactory: ExtractorInitiator,
                private _fileManager: FileManageService) {
    }
    public cancel(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public dispose(): Promise<void> {
        this._logHandler = null;
        return Promise.resolve(undefined);
    }

    public async prepare(jobMessage: JobMessage, vertex: Vertex): Promise<void> {
        const action = vertex.action as ExtractAction;
        action.videoFilePath = this._fileManager.getLocalPath(jobMessage.videoFile.filename, jobMessage.id);
        const outputFilename = action.outputFilename || vertex.id;
        vertex.outputPath = this._fileManager.getLocalPath(outputFilename, jobMessage.id);
        try {
            if (!await this._fileManager.checkExists(jobMessage.videoFile.filename, jobMessage.id)) {
                await this._fileManager.downloadFile(jobMessage.videoFile, jobMessage.downloadAppId, jobMessage.id);
            }
            action.otherFilePaths = [];
            for (const remoteFile of jobMessage.otherFiles) {
                action.otherFilePaths.push(this._fileManager.getLocalPath(remoteFile.filename, jobMessage.id));
                if (!await this._fileManager.checkExists(remoteFile.filename, jobMessage.id)) {
                    await this._fileManager.downloadFile(remoteFile, jobMessage.downloadAppId, jobMessage.id);
                }
            }
        } catch (err) {
            logger.error(err);
        }
    }

    public async process(vertex: Vertex): Promise<string> {
        const extractAction = vertex.action as ExtractAction;
        const extractor = this._extractorFactory(vertex);
        const cmd = await extractor.extractCMD();
        if (!cmd) {
            // if cmd is null, we only need to copy source file to our outputPath
            await this._fileManager.localCopy(extractAction.videoFilePath, vertex.outputPath);
        } else {
            await this.runCommand(cmd);
        }
        return vertex.outputPath;
    }

    public registerLogHandler(callback: (logChunk: string, ch: ("stdout" | "stderr")) => void): void {
        this._logHandler = callback;
    }

    private handleLog(logChunk: Buffer, ch: 'stdout' | 'stderr'): void {
        if (this._logHandler) {
            const decoder = new StringDecoder('utf8');
            this._logHandler(decoder.end(logChunk), ch);
        }
    }

    private runCommand(cmdArgs: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                // abort when output filename collision
                const child = spawn('ffmpeg', cmdArgs, {
                    stdio: 'pipe'
                });
                child.stdout.on('data', (data) => {
                    this.handleLog(data, 'stdout');
                });
                child.stderr.on('data', (data) => {
                    this.handleLog(data, 'stderr');
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        reject('ffmpeg exited with non 0 code');
                        return;
                    }
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
    }

}