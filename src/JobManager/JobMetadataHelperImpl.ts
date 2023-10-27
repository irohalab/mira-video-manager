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

import { inject, injectable } from 'inversify';
import pino from 'pino';
import { Sentry, TYPES } from '@irohalab/mira-shared';
import { VertexMap } from '../domains/VertexMap';
import { Vertex } from '../entity/Vertex';
import { IsVideoFileContainer } from '../utils/FileHelper';
import { spawn } from 'child_process';
import { getStreamsInfo } from '../utils/VideoProber';
import { MediaContainer } from '../utils/Runtime/MediaContainer';
import { VideoStream } from '../utils/Runtime/VideoStream';
import { basename, dirname, extname, join } from 'path';
import { getAverageColor } from 'fast-average-color-node';
import { VideoOutputMetadata } from '../domains/VideoOutputMetadata';
import { JobMetadataHelper } from './JobMetadataHelper';
import { readdir } from 'fs/promises';

const COMMAND_TIMEOUT = 5000;

const TILE_SIZE = 10; // fixed tile size to avoid large image
const SCALE_HEIGHT = 120;
const FRAMES_INTERVAL = 5000; // milliseconds
const MAX_PIC_WIDTH = 16256; // this is based on formula ((Width * 8) + 1024)*(Height + 128) < INT_MAX.

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
            await this.runCommand('ffmpeg', ['-y','-ss', '00:00:01.000', '-i', outputPath, '-vframes','1', thumbnailPath], jobLogger);
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
        metaData.tileSize = TILE_SIZE;
        metaData.frameHeight = SCALE_HEIGHT;
        metaData.frameWidth = Math.round(SCALE_HEIGHT * (metaData.width/metaData.height));
        // unlikely we need to calculate this as tileSize will be a small value
        // if (metaData.tileSize * metaData.frameWidth > MAX_PIC_WIDTH) {
        //     metaData.tileSize = Math.floor(MAX_PIC_WIDTH / metaData.frameWidth);
        // }
        const imageDirPath = dirname(videoPath);
        const imageFilenameBase = `keyframes-${basename(videoPath, extname(videoPath))}`;
        const keyframeImagePath = join(imageDirPath, `${imageFilenameBase}-%3d.jpg`);
        // generate tiles for key frames every 1 second
        await this.runCommand('ffmpeg', ['-y', '-i', videoPath,
            '-vf',
            `select=isnan(prev_selected_t)+gte(t-prev_selected_t\\,2),scale=${metaData.frameWidth}:${metaData.frameHeight},tile=${metaData.tileSize}x${metaData.tileSize}`,
            '-an', '-vsync', '0', keyframeImagePath
        ], jobLogger);

        const filenameList = await readdir(imageDirPath);
        metaData.keyframeImagePathList = filenameList.filter(f => f.endsWith('.png') && f.startsWith(imageFilenameBase)).map(f => join(imageDirPath, f));
    }

    private async runCommand(cmdExc: string, cmdArgs: string[], logger: pino.Logger): Promise<any> {
        console.log(cmdExc + ' ' + cmdArgs.join(' '));
        return new Promise((resolve, reject) => {
            try {
                const child = spawn(cmdExc, cmdArgs, {
                    timeout: COMMAND_TIMEOUT,
                    stdio: 'pipe'
                });
                child.stdout.on('data', (data) => {
                    logger.info(data);
                });
                child.stderr.on('data', (data) => {
                    logger.error(data);
                });
                child.on('close', (code) => {
                    if (code !== 0) {
                        reject();
                        return;
                    }
                    resolve(undefined);
                });
            } catch (exception) {
                reject(exception);
            }
        });
    }
}