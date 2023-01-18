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

import { Extractor } from './Extractor';
import { Vertex } from '../../entity/Vertex';
import { ExtractAction } from '../../domains/ExtractAction';
import { ExtractSource } from '../../domains/ExtractSource';
import { ExtractTarget } from '../../domains/ExtractTarget';
import { extname } from 'path';
import { AUDIO_FILE_EXT, SUBTITLE_EXT, VIDEO_FILE_EXT } from '../../domains/FilenameExtensionConstants';

const DEFAULT_REGEX = /(?:\.sc\.|\.tc\.|简体|繁體)/;

/**
 * the hint must be a regex
 */
type ExtraData = { fileNameHint: string, fileExtNameHint: string };

/**
 * Find a file from files that matches certain criteria
 * This extractor doesn't return command line string (extractCMD() will always return null),
 * it will update the vertex output path and set inputPath based on conditions.
 */
export class FileExtractor implements Extractor {
    public static Id = 'File';
    public action: ExtractAction;
    private inputPath: string;

    constructor(public vertex: Vertex) {
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

        // find from actions.otherFilePaths
        this.inputPath = this.findFileByHint();

        // if not found by hint, try to find by type
        let fileExtName: string;
        if (!this.inputPath) {
            switch(this.action.extractTarget) {
                case ExtractTarget.AudioStream:
                    for (const filePath of this.action.otherFilePaths) {
                        fileExtName = extname(filePath);
                        if (AUDIO_FILE_EXT.includes(fileExtName)) {
                            this.inputPath = filePath;
                            break;
                        }
                    }
                    break;
                case ExtractTarget.Subtitle:
                    for (const filePath of this.action.otherFilePaths) {
                        fileExtName = extname(filePath);
                        if (SUBTITLE_EXT.includes(fileExtName)) {
                            this.inputPath = filePath;
                            break;
                        }
                    }
                    break;
                case ExtractTarget.KeepContainer:
                    // in this case, KeepContainer means select video file
                    for (const filePath of this.action.otherFilePaths) {
                        fileExtName = extname(filePath);
                        if (VIDEO_FILE_EXT.includes(fileExtName)) {
                            this.inputPath = filePath;
                            break;
                        }
                    }
                    break;
                default:
                    throw new Error('ExtractTarget not supported: ' + this.action.extractTarget);
            }
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

    private findFileByHint(): string {
        let fileNameHint: string;
        let fileExtNameHint: string;
        if (this.action.extraData) {
            const extraData = this.action.extraData as ExtraData;
            fileNameHint = extraData.fileNameHint;
            fileExtNameHint= extraData.fileExtNameHint
        }

        let hintRegex: RegExp;
        if (fileNameHint) {
            hintRegex = new RegExp(fileNameHint);
            for (const filePath of this.action.otherFilePaths) {
                if (hintRegex.test(filePath)) {
                    return filePath;
                }
            }
        } else if (fileExtNameHint) {
            hintRegex = new RegExp(fileExtNameHint);
            for (const filePath of this.action.otherFilePaths) {
                if (hintRegex.test(filePath)) {
                    return filePath;
                }
            }
        }
        return null;
    }
}