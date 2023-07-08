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

import { Extractor, ExtractorLogger } from './Extractor';
import { Vertex } from '../../entity/Vertex';
import { ExtractAction } from '../../domains/ExtractAction';
import { ExtractSource } from '../../domains/ExtractSource';
import { ExtractTarget } from '../../domains/ExtractTarget';
import { basename, dirname, extname, join } from 'path';
import { AUDIO_FILE_EXT, SUBTITLE_EXT, VIDEO_FILE_EXT } from '../../domains/FilenameExtensionConstants';
import { spawn } from 'child_process';
import { mkdir, readdir } from 'fs/promises';
import { nanoid } from 'nanoid';
import pino from 'pino';

const DEFAULT_REGEX = /(?:\.sc\.|\.tc\.|简体|繁體)/;

const DEFAULT_EPS_REGEX = [
    /第(\d+)話/i,
    /第(\d+)话/i,
    /\[(\d+)(?:v\d)?(?:\s?END)?\]/i,
    /\s(\d{2,})\s/, /\s(\d+)$/i,
    /【(\d+)(?:v\d)?(?:\s?END)?】/i,
    /[.\s]Ep(?:\s)?(\d+)[.\s]/i,
    /第(\d+)回/i,
    /\.S\d{1,2}E(\d{1,2})\./i,
    /'第(\d+)集/i
];

const COMMAND_TIMEOUT = 5000;

/**
 * the hint must be a regex
 */
type ExtraData = { fileNameHint: string, archiveFileNameHint: string };

/**
 * Find a file from files that matches certain criteria
 * This extractor doesn't return command line string (extractCMD() will always return null),
 * it will update the vertex output path and set inputPath based on conditions.
 */
export class FileExtractor implements Extractor {
    public static Id = 'File';
    public action: ExtractAction;
    private inputPath: string;

    constructor(public vertex: Vertex, public logger: ExtractorLogger) {
        this.inputPath = null;
        this.action = this.vertex.action as ExtractAction;
    }
    public async extractCMD(): Promise<string[] | null> {
        // just do nothing
        if (this.action.extractFrom === ExtractSource.VideoFile && this.action.extractTarget === ExtractTarget.KeepContainer) {
            this.inputPath = this.action.videoFilePath;
            this.vertex.outputPath = this.inputPath;
            return null;
        }

        if (this.action.extractFrom === ExtractSource.Archive) {
            this.inputPath = await this.findFromArchive();
        } else {
            this.inputPath = this.findInputPath(this.action.otherFilePaths);
        }

        if (!this.inputPath) {
            throw new Error('FileExtractor cannot find a file that match any of the conditions');
        }
        this.vertex.outputPath = this.inputPath;
        return null;
    }

    public getInputPath(): string | null {
        return this.inputPath;
    }

    private findInputPath(fileList: string[]): string {
        // find from actions.otherFilePaths
        let inputPath = this.findFileByHint(fileList);

        // if not found by hint, try to find by type
        let fileExtName: string;
        if (!inputPath) {
            switch(this.action.extractTarget) {
                case ExtractTarget.AudioStream:
                    for (const filePath of this.action.otherFilePaths) {
                        fileExtName = extname(filePath);
                        if (AUDIO_FILE_EXT.includes(fileExtName)) {
                            inputPath = filePath;
                            break;
                        }
                    }
                    break;
                case ExtractTarget.Subtitle:
                    inputPath = this.findSubtitleFile(fileList);
                    break;
                case ExtractTarget.KeepContainer:
                    // in this case, KeepContainer means select video file
                    for (const filePath of fileList) {
                        fileExtName = extname(filePath);
                        if (VIDEO_FILE_EXT.includes(fileExtName)) {
                            inputPath = filePath;
                            break;
                        }
                    }
                    break;
                default:
                    throw new Error('ExtractTarget not supported: ' + this.action.extractTarget);
            }
        }
        return inputPath;
    }

    private findFileByHint(fileList: string[]): string {
        let fileNameHint: string;
        if (this.action.extraData) {
            const extraData = this.action.extraData as ExtraData;
            fileNameHint = extraData.fileNameHint;
        }

        let hintRegex: RegExp;
        if (fileNameHint) {
            hintRegex = new RegExp(fileNameHint, 'i');
            let resultPath = null;
            // for subtitle hintRegex, a named capture group must be used and
            // there must be a group named EPS_NO to capture the episode number in the filename.
            if (this.vertex.fileMapping && this.action.extractTarget === ExtractTarget.Subtitle) {
                const epsNo = this.vertex.fileMapping.episodeNo + '';
                for(const filePath of fileList) {
                    const m = filePath.match(hintRegex);
                    if (m && m.groups && m.groups.EPS_NO) {
                        const matchedNum = m.groups.EPS_NO;
                        if (matchedNum === epsNo.padStart(matchedNum.length, '0')) {
                            resultPath = filePath;
                            break;
                        }
                    }
                }
            }
            if (!resultPath) {
                for (const filePath of fileList) {
                    if (hintRegex.test(filePath)) {
                        resultPath = filePath;
                        break;
                    }
                }
            }
            return resultPath;
        }
        return null;
    }

    private findSubtitleFile(fileList: string[]): string {
        let fileExtName: string;
        let fileBaseName: string;
        let epsNo = null;
        if (this.vertex.fileMapping) {
            epsNo = this.vertex.fileMapping.episodeNo + '';
        }
        let inputPath = null;
        for (const filePath of fileList) {
            if (inputPath) {
                break;
            }
            fileExtName = extname(filePath);
            fileBaseName = basename(filePath);
            if (SUBTITLE_EXT.includes(fileExtName)) {
                if (epsNo !== null) {
                    for (const reg of DEFAULT_EPS_REGEX) {
                        const m = fileBaseName.match(reg);
                        if (m) {
                            const matchedNumber = m[1];
                            if (matchedNumber === epsNo.padStart(matchedNumber.length, '0')) {
                                inputPath = filePath;
                                break;
                            }
                        }
                    }
                } else {
                    inputPath = filePath;
                }
            }
        }
        return inputPath;
    }

    private async findFromArchive(): Promise<string> {
        let inputPath: string = null;
        let archiveFileNameHint: string;
        if (this.action.extraData) {
            const extraData = this.action.extraData as ExtraData;
            archiveFileNameHint = extraData.archiveFileNameHint;
        }
        let hintRegex: RegExp;
        let archiveFilePath: string;
        if (archiveFileNameHint) {
            hintRegex = new RegExp(archiveFileNameHint, 'i');
            for (const filePath of this.action.otherFilePaths) {
                if (hintRegex.test(filePath)) {
                    archiveFilePath = filePath;
                    break;
                }
            }
        }
        if (archiveFilePath) {
            // in case we need to use another archive extractor, we can add switch based on extension name.
            inputPath = await this.getInputPathByUnRar(archiveFilePath);
        }
        return inputPath;
    }

    private async getInputPathByUnRar(archiveFilePath): Promise<string> {
        const destPath = join(dirname(archiveFilePath), nanoid(5));
        try {
            await mkdir(destPath, {
                recursive: true,
            });
        } catch (ex) {
            this.logger(ex, 'error');
            return null;
        }

        await new Promise((resolve, reject) => {
            try {
                const child = spawn('unrar', ['e', archiveFilePath, destPath], {
                    timeout: COMMAND_TIMEOUT,
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        reject();
                        return;
                    }
                    resolve('');
                });
            } catch (exception) {
                reject(exception);
            }
        });
        try {
            const archiveFiles = await readdir(destPath);
            const contentFilesAbsPath: string[] = [];
            this.logger('archive content list:', 'info');
            for (const af of archiveFiles) {
                this.logger(af, 'info');
                contentFilesAbsPath.push(join(destPath, af));
            }
            return this.findInputPath(contentFilesAbsPath);
        } catch (ex) {
            this.logger(ex, 'error');
            return null;
        }
    }
}