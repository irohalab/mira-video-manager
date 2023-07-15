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
import { Vertex } from '../entity/Vertex';
import { ValidateAction } from '../domains/ValidateAction';
import { FileManageService } from '../services/FileManageService';
import { getStreamsInfo } from '../utils/VideoProber';
import { MediaContainer } from '../utils/Runtime/MediaContainer';
import { VideoStream } from '../utils/Runtime/VideoStream';
import { AudioStream } from '../utils/Runtime/AudioStream';
import { injectable } from 'inversify';

@injectable()
export class LocalVideoValidateProcessor implements VideoProcessor {
    private _controller: AbortController;
    private _logHandler: (logChunk: string, ch: ('stdout' | 'stderr')) => void;

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

    public prepare(jobMessage: JobMessage, vertex: Vertex): Promise<void> {
        const action = vertex.action as ValidateAction;
        action.videoFilePath = this._fileManager.getLocalPath(jobMessage.videoFile.filename, jobMessage.id);
        vertex.outputPath = action.videoFilePath;
        return Promise.resolve(undefined);
    }

    public async process(vertex: Vertex): Promise<string> {
        const trackInfos = await getStreamsInfo(vertex.outputPath);
        if (this._logHandler) {
            this._logHandler('track info of the media file ' + vertex.outputPath, 'stdout');
            for (const track of trackInfos) {
                this._logHandler(JSON.stringify(track, null, 2), 'stdout');
            }
        }
        const mediaContainerInfo = new MediaContainer(trackInfos);
        if (!mediaContainerInfo.isPlayable()) {
            throw new Error('Container format is not playable');
        }
        const videoTrack = new VideoStream(mediaContainerInfo.getDefaultVideoStreamInfo());
        if (!videoTrack) {
            throw new Error('Video format is not playable');
        }
        const audioTrack = new AudioStream(mediaContainerInfo.getDefaultAudioStreamInfo());
        if (!audioTrack) {
            throw new Error('Audio format is not playable');
        }
        if (mediaContainerInfo.audioStreamCount() > 1) {
            this._logHandler('WARNING: found more than one audio streams', 'stderr');
        }
        if (mediaContainerInfo.subtitlesCount() > 0) {
            this._logHandler('WARNING: found one or more subtitle streams, the subtitle may not be able to show in player', 'stderr');
        }
        return vertex.outputPath;
    }

    public registerLogHandler(callback: (logChunk: string, ch: ("stdout" | "stderr")) => void): void {
        this._logHandler = callback;
    }
}