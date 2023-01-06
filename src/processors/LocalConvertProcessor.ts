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

import { VideoProcessor } from "./VideoProcessor";
import { extname } from "path";
import { ConfigManager } from "../utils/ConfigManager";
import { ConvertAction } from "../domains/ConvertAction";
import { ProfileFactoryInitiator } from "./profiles/ProfileFactory";
import { inject, injectable } from "inversify";
import { JobMessage } from '../domains/JobMessage';
import { spawn } from 'child_process';
import { FileManageService } from '../services/FileManageService';
import { StringDecoder } from 'string_decoder';
import pino from 'pino';
import { TYPES } from '@irohalab/mira-shared';
import { TYPES_VM } from '../TYPES';
import { ActionType } from '../domains/ActionType';
import { ExtractAction } from '../domains/ExtractAction';
import { ExtractTarget } from '../domains/ExtractTarget';
import { AUDIO_FILE_EXT, SUBTITLE_EXT, VIDEO_FILE_EXT } from '../domains/FilenameExtensionConstants';
import { Vertex } from '../entity/Vertex';
import { DatabaseService } from '../services/DatabaseService';
import { getStdLogger } from '../utils/Logger';

const logger = getStdLogger();
/**
 * Convert inputs to a single mp4 file with h264+aac encoding
 */
@injectable()
export class LocalConvertProcessor implements VideoProcessor {

    private _controller: AbortController;
    private _logHandler: (logChunk: string, ch: 'stdout' | 'stderr') => void;
    private upstreamVertices: Vertex[];

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES_VM.ProfileFactory) private _profileFactory: ProfileFactoryInitiator,
                private _fileManageService: FileManageService) {
    }

    public async prepare(jobMessage: JobMessage, vertex: Vertex): Promise<void> {
        const outputFilename = vertex.action.outputFilename || vertex.id + '.mp4';
        vertex.outputPath = this._fileManageService.getLocalPath(outputFilename, jobMessage.id);
        const verticesMap = await this._databaseService.getVertexRepository().getVertexMap(jobMessage.jobId);
        this.upstreamVertices = vertex.upstreamVertexIds.map(actionId => verticesMap[actionId]);
        return Promise.resolve();
    }

    public async process(vertex: Vertex): Promise<string> {
        const currentAction = vertex.action as ConvertAction;
        let videoFilePath = null;
        let subtitleFilePath = null;
        let audioFilePath = null;
        for (const upstreamVertex of this.upstreamVertices) {
            const vertexOutputPath = upstreamVertex.outputPath;
            switch (upstreamVertex.actionType) {
                case ActionType.Convert:
                    videoFilePath = vertexOutputPath;
                    break;
                case ActionType.Extract:
                    const extractAction = upstreamVertex.action as ExtractAction;
                    switch(extractAction.extractTarget) {
                        case ExtractTarget.KeepContainer:
                            const ext = extname(vertexOutputPath);
                            if (!videoFilePath && VIDEO_FILE_EXT.includes(ext)) {
                                videoFilePath = vertexOutputPath;
                            } else if (!audioFilePath && AUDIO_FILE_EXT.includes(ext)) {
                                audioFilePath = vertexOutputPath;
                            } else if (!subtitleFilePath && SUBTITLE_EXT.includes(ext)) {
                                subtitleFilePath = vertexOutputPath;
                            }
                            break;
                        case ExtractTarget.AudioStream:
                            audioFilePath = vertexOutputPath;
                            break;
                        case ExtractTarget.Subtitle:
                            subtitleFilePath = vertexOutputPath;
                            break;
                    }
                    break;
                case ActionType.Merge:
                    // TODO: support merge output
                    break;
                // fragment should the final output, should not be in upstream of convert action
            }
        }
        currentAction.videoFilePath = videoFilePath;
        currentAction.audioFilePath = audioFilePath;
        currentAction.subtitlePath = subtitleFilePath;

        const extra = { data: currentAction.profileExtraData } as any;
        if (subtitleFilePath) {
            extra.subtitleFile = subtitleFilePath;
        }
        const convertProfile = this._profileFactory(currentAction.profile, currentAction, extra);
        await this.runCommand(await convertProfile.getCommandArgs(), vertex.outputPath);
        return vertex.outputPath;
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
        const cmdFinal = 'ffmpeg -n ' + threadsLimit.join(' ') + (threadsLimit.length > 0 ? ' ' : '') + cmdArgs.join(' ') + ' ' + outputFilename;
        this.handleLog(Buffer.from(cmdFinal, 'utf-8'), 'stdout');
        console.log(cmdFinal);
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
                child.on('error', (error) => {
                    if (error && (error as any).type === 'AbortError') {
                        // ignore AbortError
                        return;
                    }
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