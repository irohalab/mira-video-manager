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

import { FileManageService } from '../services/FileManageService';
import { inject, injectable } from 'inversify';
import pino from 'pino';
import { DatabaseService } from '../services/DatabaseService';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { VertexMap } from '../domains/VertexMap';
import { Vertex } from '../entity/Vertex';
import { IsVideoFileContainer } from '../utils/FileHelper';
import { spawn } from 'child_process';
import { getStreamsInfo } from '../utils/VideoProber';
import { MediaContainer } from '../utils/Runtime/MediaContainer';
import { VideoStream } from '../utils/Runtime/VideoStream';
import { basename, dirname, join } from 'path';
import { getAverageColor } from 'fast-average-color-node';
import { VideoOutputMetadata } from '../domains/VideoOutputMetadata';
import { JobMetadataHelper } from './JobMetadataHelper';

const COMMAND_TIMEOUT = 5000;

const SCALE_HEIGHT = 72;

@injectable()
export class JobMetadataHelperImpl implements JobMetadataHelper {

    constructor(@inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    /**
     * Generate thumbnail image and get dimension of all output videos.
     * @param vertexMap
     * @param jobLogger
     */
    public async processMetaData(vertexMap: VertexMap, jobLogger: pino.Logger): Promise<VideoOutputMetadata> {
        jobLogger.info('Start to process metadata');
        const videoVertex = Object.keys(vertexMap).map(vtxId => vertexMap[vtxId])
            .find((vertex: Vertex) => {
                return vertex.downstreamVertexIds.length === 0
                    && IsVideoFileContainer(vertex.outputPath);
            });
        if (!videoVertex) {
            throw new Error('No video output found!');
        }
        const metadata = new VideoOutputMetadata();
        try {
            const outputPath = videoVertex.outputPath;
            const trackInfos = await getStreamsInfo(outputPath);
            const container = new MediaContainer(trackInfos);
            const videoStream = new VideoStream(container.getDefaultVideoStreamInfo());
            const thumbnailPath = join(dirname(outputPath), `thumb-${basename(outputPath)}.png`);
            jobLogger.info(`Generating thumbnail of the video at 00:00:01.000, output is ${thumbnailPath}`);
            await this.runCommand('ffmpeg', ['-y','-ss', '00:00:01.000', '-i', outputPath, '-vframes','1', thumbnailPath]);
            jobLogger.info(`Thumbnail generated, getting dominant color of the thumbnail`);
            const dominantColor = await getAverageColor(thumbnailPath, {algorithm: 'dominant'});
            metadata.width = videoStream.getWidth();
            metadata.height = videoStream.getHeight();
            metadata.duration = container.getDuration() * 1000;
            metadata.dominantColorOfThumbnail = dominantColor.hex;
            metadata.thumbnailPath = thumbnailPath;
            jobLogger.info('Generating keyframes preview tile');
            await this.generatePreviewImage(outputPath, metadata, jobLogger);
        } catch (ex) {
            jobLogger.error(ex);
            this._sentry.capture(ex);
        }
        if (!metadata) {
            throw new Error('no metadata for this job, check the job logs for more information');
        }
        return metadata;
    }

    /**
     * generate preview image at keyframes.
     * @param videoPath
     * @param metaData
     * @param jobLogger
     */
    public async generatePreviewImage(videoPath: string, metaData: VideoOutputMetadata, jobLogger: pino.Logger): Promise<void> {
        metaData.tileSize = Math.ceil(Math.sqrt(metaData.duration / 5.0));
        metaData.frameSize = Math.round(SCALE_HEIGHT * (metaData.width/metaData.height));
        metaData.keyframeImagePath = join(dirname(videoPath), `keyframes-${basename(videoPath)}.png`);
        // generate tiles for key frames
        jobLogger.info(await this.runCommand('ffmpeg', ['-y', '-i', videoPath,
            '-vf',
            `select=isnan(prev_selected_t)+gte(t-prev_selected_t\\,5),scale=${metaData.frameSize}:${SCALE_HEIGHT},tile=${metaData.tileSize}x${metaData.tileSize}`,
            '-an', '-vsync', '0', metaData.keyframeImagePath
        ]));
    }

    private async runCommand(cmdExc: string, cmdArgs: string[]): Promise<any> {
        console.log(cmdExc + ' ' + cmdArgs.join(' '));
        return new Promise((resolve, reject) => {
            try {
                const child = spawn(cmdExc, cmdArgs, {
                    timeout: COMMAND_TIMEOUT,
                    stdio: 'pipe'
                });
                let output = '';
                let error = '';
                child.stdout.on('data', (data) => {
                    output += data;
                });
                child.stderr.on('data', (data) => {
                    error += data;
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        reject(error);
                        return;
                    }
                    resolve(output);
                });
            } catch (exception) {
                reject(exception);
            }
        });
    }
}