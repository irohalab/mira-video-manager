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

import { VideoProcessor } from "./VideoProcessor";
import { extname } from "path";
import { ConfigManager } from "../utils/ConfigManager";
import { Action } from "../domains/Action";
import { ConvertAction } from "../domains/ConvertAction";
import { ProfileFactoryInitiator } from "./profiles/ProfileFactory";
import { inject, injectable } from "inversify";
import { TYPES } from "../TYPES";
import { JobMessage } from '../domains/JobMessage';
import { spawn } from 'child_process';
import { FileManageService } from '../services/FileManageService';
import { StringDecoder } from 'string_decoder';
import pino from 'pino';

const logger = pino();

const VIDEO_FILE_EXT: string[] = ['.mp4', '.mkv', '.avi', 'rmvb', '.rm', '.mov', '.wmv', '.ts'];
const SUBTITLE_EXT: string[] = ['.ass', '.ssa', '.srt', '.sub', '.scc', '.vtt', '.smi', '.sbv'];

@injectable()
export class LocalConvertProcessor implements VideoProcessor {

    private _controller: AbortController;
    private _logHandler: (logChunk: string, ch: 'stdout' | 'stderr') => void;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.ProfileFactory) private _profileFactory: ProfileFactoryInitiator,
                private _fileManageService: FileManageService) {
    }

    public async prepare(jobMessage: JobMessage, action: ConvertAction): Promise<void> {
        const videoFilePath: string = this._fileManageService.getLocalPath(jobMessage.videoFile.filename, jobMessage.id);
        action.inputList = [videoFilePath];
        try {
            if (!await this._fileManageService.checkExists(jobMessage.videoFile.filename, jobMessage.id)) {
                await this._fileManageService.downloadFile(jobMessage.videoFile, jobMessage.downloadAppId, jobMessage.id);
            }
            for (const remoteFile of jobMessage.otherFiles) {
                action.inputList.push(this._fileManageService.getLocalPath(remoteFile.filename, jobMessage.id));
                if (!await this._fileManageService.checkExists(remoteFile.filename, jobMessage.id)) {
                    await this._fileManageService.downloadFile(remoteFile, jobMessage.downloadAppId, jobMessage.id);
                }
            }
        } catch (err) {
            logger.error(err);
        }
    }

    public async process(action: Action): Promise<string> {
        const currentAction = action as ConvertAction;
        let videoFilePath = null;
        let subtitleFilePath = null;

        if (action.lastOutput) {
            const lastOutputExtname = extname(action.lastOutput).toLowerCase();
            if (lastOutputExtname && VIDEO_FILE_EXT.indexOf(lastOutputExtname) !== -1) {
                videoFilePath = action.lastOutput;
            } else if (lastOutputExtname && SUBTITLE_EXT.indexOf(lastOutputExtname) !== -1) {
                subtitleFilePath = action.lastOutput;
            }
        }

        for (const inputPath of currentAction.inputList) {
            if (videoFilePath && subtitleFilePath) {
                break;
            }
            const extName = extname(inputPath).toLowerCase();
            if (!videoFilePath && VIDEO_FILE_EXT.indexOf(extName) !== -1) {
                videoFilePath = inputPath;
            } else if (!subtitleFilePath && SUBTITLE_EXT.indexOf(extName) !== -1) {
                subtitleFilePath = inputPath;
            }
        }
        const extra = { data: currentAction.profileExtraData } as any;
        if (subtitleFilePath) {
            extra.subtitleFile = subtitleFilePath;
        }
        const convertProfile = this._profileFactory(currentAction.profile, videoFilePath, action.index, extra);
        const outputFilename = convertProfile.getOutputFilename();
        await this.runCommand(await convertProfile.getCommandArgs(), outputFilename);
        return outputFilename;
    }

    public async cancel(): Promise<void> {
        if (this._controller) {
            this._controller.abort();
        }
        await this.dispose();
        return Promise.resolve(undefined);
    }

    private runCommand(cmdArgs: string[], outputFilename: string): Promise<void> {
        const maxThreads = this._configManager.maxThreadsToProcess();
        const threadsLimit = maxThreads > 0 ? ['-threads', `${maxThreads}`] : [];
        console.log('ffmpeg -n ' + threadsLimit.join(' ') + ' ' + cmdArgs.join(' ') + ' ' + outputFilename);
        this._controller = new AbortController();
        return new Promise<void>((resolve, reject) => {
            try {
                // abort when output filename collision
                const child = spawn('ffmpeg', ['-n', ...threadsLimit, ...cmdArgs, outputFilename], {
                    signal: this._controller.signal,
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

    private handleLog(logChunk: Buffer, ch: 'stdout' | 'stderr'): void {
        if (this._logHandler) {
            const decoder = new StringDecoder('utf8');
            this._logHandler(decoder.end(logChunk), ch);
        }
    }

    registerLogHandler(callback: (logChunk: string, ch: ("stdout" | "stderr")) => void): void {
        this._logHandler = callback;
    }

    dispose(): Promise<void> {
        this._logHandler = null;
        return Promise.resolve();
    }
}