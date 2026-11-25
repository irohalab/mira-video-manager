/*
 * Copyright 2026 IROHA LAB
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
import { Vertex } from '../entity/Vertex';
import { ValidateAction } from '../domains/ValidateAction';
import { FileManageService } from '../services/FileManageService';
import { probeMedia } from '../utils/VideoProber';
import { MediaContainer } from '../utils/Runtime/MediaContainer';
import { VideoStream } from '../utils/Runtime/VideoStream';
import { AudioStream } from '../utils/Runtime/AudioStream';
import { injectable } from 'inversify';
import { access, rename } from 'fs/promises';

@injectable()
export class LocalVideoValidateProcessor implements VideoProcessor {
    private _controller: AbortController | null = null;
    private _logHandler: ((logChunk: string, ch: ('stdout' | 'stderr')) => void) | null = null;

    constructor(private _fileManager: FileManageService) {
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
        const action = vertex.action as ValidateAction;
        action.videoFilePath = this._fileManager.getLocalPath(jobMessage.videoFile.filename, jobMessage.id);
        const outputFilename = vertex.id + '.mp4';
        vertex.outputPath = this._fileManager.getLocalPath(outputFilename, jobMessage.id);
        return Promise.resolve(undefined);
    }

    public async process(vertex: Vertex): Promise<string> {
        const action = vertex.action as ValidateAction;
        const inputPath = await this.resolveInputPath(action, vertex);
        const probeResult = await probeMedia(inputPath);

        this.log(`format info of the media file ${inputPath}`, 'stdout');
        this.log(JSON.stringify(probeResult.format, null, 2), 'stdout');
        this.log(`streams info of the media file ${inputPath}`, 'stdout');
        for (const stream of probeResult.streams) {
            this.log(JSON.stringify(stream, null, 2), 'stdout');
        }

        const mediaContainerInfo = new MediaContainer(probeResult);
        const containerPlayable = mediaContainerInfo.isPlayable();
        const containerInfo = mediaContainerInfo.getContainerInfo();
        const defaultVideoInfo = mediaContainerInfo.getDefaultVideoStreamInfo();
        const defaultAudioInfo = mediaContainerInfo.getDefaultAudioStreamInfo();
        const videoTrack = new VideoStream(defaultVideoInfo);
        const audioTrack = new AudioStream(defaultAudioInfo);

        if (containerPlayable && !mediaContainerInfo.isStreamable()) {
            this.log('WARNING: MP4 moov atom is placed after mdat (not faststart)', 'stderr');
        }
        if (mediaContainerInfo.audioStreamCount() > 1) {
            this.log(`WARNING: found more than one audio streams (${mediaContainerInfo.audioStreamCount()})`, 'stderr');
        }
        if (mediaContainerInfo.subtitlesCount() > 0) {
            this.log(
                `WARNING: found ${mediaContainerInfo.subtitlesCount()} subtitle stream(s), the subtitle may not be able to show in player`,
                'stderr'
            );
        }

        const reasons: string[] = [];
        const compatibleParts: string[] = [];

        if (!containerPlayable) {
            const formatName = containerInfo?.format_name ?? 'unknown';
            const majorBrand = containerInfo?.tags?.major_brand?.trim() || 'n/a';
            reasons.push(`container format is not playable MP4 (format_name="${formatName}", major_brand="${majorBrand}")`);
        } else {
            compatibleParts.push('container=mp4(ok)');
        }

        if (!defaultVideoInfo) {
            reasons.push('no video stream found');
        } else if (!videoTrack.isPlayable()) {
            const profile = defaultVideoInfo.profile ?? 'n/a';
            const pixFmt = defaultVideoInfo.pix_fmt ?? 'n/a';
            const bitDepth = defaultVideoInfo.bits_per_raw_sample ?? 'n/a';
            reasons.push(
                `video stream #${defaultVideoInfo.index} is not playable ` +
                `(codec_name="${defaultVideoInfo.codec_name}", profile="${profile}", pix_fmt="${pixFmt}", ` +
                `bits_per_raw_sample="${bitDepth}"; expected h264 yuv420p 8-bit)`
            );
        } else {
            compatibleParts.push(`video#${defaultVideoInfo.index}=${defaultVideoInfo.codec_name}/${defaultVideoInfo.pix_fmt}(ok)`);
        }

        if (!defaultAudioInfo) {
            reasons.push('no audio stream found');
        } else if (!audioTrack.isPlayable()) {
            reasons.push(
                `audio stream #${defaultAudioInfo.index} is not playable (codec_name="${defaultAudioInfo.codec_name}"; expected aac)`
            );
        } else {
            compatibleParts.push(`audio#${defaultAudioInfo.index}=${defaultAudioInfo.codec_name}(ok)`);
        }

        if (reasons.length > 0) {
            for (const reason of reasons) {
                this.log(`VALIDATION ERROR: ${reason}`, 'stderr');
            }
            const compatibleSuffix = compatibleParts.length > 0 ? ` [compatible: ${compatibleParts.join(', ')}]` : '';
            throw new Error(`Video validation failed: ${reasons.join('; ')}${compatibleSuffix}`);
        }

        if (inputPath !== vertex.outputPath) {
            await rename(inputPath, vertex.outputPath);
        }
        return vertex.outputPath;
    }

    public registerLogHandler(callback: (logChunk: string, ch: ('stdout' | 'stderr')) => void): void {
        this._logHandler = callback;
    }

    private log(message: string, ch: 'stdout' | 'stderr'): void {
        if (this._logHandler) {
            this._logHandler(message, ch);
        }
    }

    private async resolveInputPath(action: ValidateAction, vertex: Vertex): Promise<string> {
        if (action && action.videoFilePath) {
            try {
                await access(action.videoFilePath);
                return action.videoFilePath;
            } catch {
                // Fall back to vertex.outputPath if a resumed run already renamed the file.
            }
        }
        return vertex.outputPath;
    }
}