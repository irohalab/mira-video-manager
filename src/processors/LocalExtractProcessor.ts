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

import { VideoProcessor } from './VideoProcessor';
import { JobMessage } from '../domains/JobMessage';
import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManager } from '../utils/ConfigManager';
import { FileManageService } from '../services/FileManageService';
import { TYPES_VM } from '../TYPES';
import { ExtractorInitiator } from './ExtractorFactory';
import { ExtractAction } from '../domains/ExtractAction';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { Vertex } from '../entity/Vertex';
import { ExtractSource } from '../domains/ExtractSource';
import { getStdLogger } from '../utils/Logger';

const logger = getStdLogger();

@injectable()
export class LocalExtractProcessor implements VideoProcessor {
    private _controller: AbortController;
    private _logHandler: (logChunk: string, ch: 'stdout' | 'stderr') => void;
    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES_VM.ExtractorFactory) private _extractorFactory: ExtractorInitiator,
                private _fileManager: FileManageService) {
    }
    public async cancel(): Promise<void> {
        if (this._controller) {
            this._controller.abort();
        }
        await this.dispose();
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
            if (jobMessage.otherFiles && jobMessage.otherFiles.length > 0) {
                for (const remoteFile of jobMessage.otherFiles) {
                    action.otherFilePaths.push(this._fileManager.getLocalPath(remoteFile.filename, jobMessage.id));
                    if (!await this._fileManager.checkExists(remoteFile.filename, jobMessage.id)) {
                        await this._fileManager.downloadFile(remoteFile, jobMessage.downloadAppId, jobMessage.id);
                    }
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
            if (extractAction.extractFrom !== ExtractSource.VideoFile) {
                if(!extractor.getInputPath()) {
                    throw new Error('inputPath of extractor is null when ExtractSource is not VideoFile');
                }
                await this._fileManager.localCopy(extractor.getInputPath(), vertex.outputPath);
            } else {
                await this._fileManager.localCopy(extractAction.videoFilePath, vertex.outputPath);
            }
        } else {
            await this.runCommand(cmd, vertex.outputPath);
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

    private runCommand(cmdArgs: string[], outputFilename): Promise<void> {
        const finalCmd = 'extract cmd: ffmpeg -n ' + cmdArgs.join(' ') + ' ' + outputFilename;
        this.handleLog(Buffer.from(finalCmd, 'utf-8'), 'stdout');
        logger.info(finalCmd);
        this._controller = new AbortController();
        return new Promise<void>((resolve, reject) => {
            try {
                // abort when output filename collision
                const child = spawn('ffmpeg',['-n', ...cmdArgs, outputFilename], {
                    signal: this._controller.signal,
                    stdio: 'pipe'
                });
                child.stdout.on('data', (data) => {
                    this.handleLog(data, 'stdout');
                });
                child.stderr.on('data', (data) => {
                    this.handleLog(data, 'stderr');
                });
                child.on('error', (error) => {
                    if (error && (error as any).type === 'AbortError') {
                        // ignore AbortError
                        return;
                    }
                    logger.warn(error);
                })
                child.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error('ffmpeg exited with non 0 code'));
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