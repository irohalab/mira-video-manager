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

import { ExtractTarget } from '../../domains/ExtractTarget';
import { Extractor } from './Extractor';
import { ExtractAction } from '../../domains/ExtractAction';
import { ExtractSource } from '../../domains/ExtractSource';
import { extname } from 'path';
import { AUDIO_FILE_EXT, SUBTITLE_EXT, VIDEO_FILE_EXT } from '../../domains/FilenameExtensionConstants';
import { getStreamsWithFfprobe } from '../../utils/VideoProber';

const DEFAULT_REGEX = /(?:\.sc\.|\.tc\.|简体|繁體)/;

/**
 * Default extractor prefer CN/TW subtitle, for audio track use default
 */
export class DefaultExtractor implements Extractor {
    public trackIdx: number;
    public inputPath: string;
    public streamsInfo: any[];
    constructor(public action: ExtractAction) {
        this.inputPath = null;
    }

    public async extractCMD(): Promise<string[]> {
        this.findInputAndOutputPath();
        if (this.action.extractTarget === ExtractTarget.KeepContainer
            || this.inputPath === this.action.outputPath) {
            return null;
        }
        await this.findAllStreams();
        await this.findTrackId();
        let result = ['-i', this.inputPath, '-map', `0:${this.trackIdx}`];
        const isCopy = this.action.extractTarget === ExtractTarget.AudioStream;
        if (isCopy) {
            result = result.concat(`-c:a`, 'copy');
        }
        return result;
    }

    private async findAllStreams(): Promise<void> {
        this.streamsInfo = await getStreamsWithFfprobe(this.inputPath);
    }

    private findFile(filePaths: string[], type: 'video' | 'audio' | 'subtitle'): string {
        const files = filePaths.filter(f => {
            const ext = extname(f);
            switch(type) {
                case 'video':
                    return VIDEO_FILE_EXT.includes(ext);
                case 'audio':
                    return AUDIO_FILE_EXT.includes(ext);
                case 'subtitle':
                    return SUBTITLE_EXT.includes(ext);
            }
        });
        if (files.length === 1) {
            return files[0];
        } else if (files.length > 1) {
            return files.find(f => {
                if (this.action.extractRegex) {
                    const regex = new RegExp(this.action.extractRegex);
                    return regex.test(f);
                } else {
                    return DEFAULT_REGEX.test(f);
                }
            });
        } else {
            return null;
        }
    }

    private async findTrackId(): Promise<number> {
        let codecType: string;
        switch (this.action.extractTarget) {
            case ExtractTarget.AudioStream:
                codecType = 'audio';
                break;
            case ExtractTarget.Subtitle:
                codecType = 'subtitle';
                break;
        }
        for (let i = 0; i < this.streamsInfo.length; i++) {
            const streamInfo = this.streamsInfo[i];
            const isDefault = streamInfo.disposition ? streamInfo.disposition.default === 1 : false;
            if (streamInfo.codec_type === codecType && isDefault) {
                this.trackIdx = i;
                return;
            }
        }
        this.trackIdx = -1;
    }

    private findInputAndOutputPath(): void {
        let extName: string;
        switch(this.action.extractTarget) {
            case ExtractTarget.KeepContainer:
                if (this.action.extractFrom === ExtractSource.OtherFiles) {
                    this.inputPath = this.findFile(this.action.otherFilePaths, 'video');
                }
                return;
            case ExtractTarget.AudioStream:
                extName = this.action.outputExtname || 'aac';
                if (this.action.extractFrom === ExtractSource.VideoFile) {
                    this.inputPath = this.action.videoFilePath;
                } else {
                    this.inputPath = this.findFile(this.action.otherFilePaths, 'audio');
                }
                break;
            case ExtractTarget.Subtitle:
                if (this.action.extractFrom === ExtractSource.OtherFiles) {
                    this.inputPath = this.findFile(this.action.otherFilePaths, 'subtitle');
                } else {
                    this.inputPath = this.action.videoFilePath;
                }
                extName = this.action.outputExtname || 'vtt';
                break;
        }
        this.action.outputPath = this.action.outputPath + '.' + extName;
    }
}