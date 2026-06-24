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

import { inject, injectable } from 'inversify';
import {
    RabbitMQService,
    RemoteFile,
    Sentry,
    TYPES,
    VIDEO_MANAGER_EXCHANGE,
    VIDEO_MANAGER_GENERAL,
    VideoManagerMessage
} from '@irohalab/mira-shared';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { DatabaseService } from './DatabaseService';
import { ConfigManager } from '../utils/ConfigManager';
import { Job } from '../entity/Job';
import { JobType } from '../domains/JobType';
import { getStdLogger } from '../utils/Logger';

const logger = getStdLogger();

export interface ReconciliationResult {
    /** number of finished jobs that were re-notified */
    reconciled: number;
    /** number of finished jobs that were skipped (e.g. no output files) */
    skipped: number;
    /** jobIds/videoIds that were re-notified */
    jobs: Array<{ jobId: string, videoId: string, bangumiId: string }>;
}

/**
 * Re-publishes the VideoManagerMessage for already finished jobs so the download
 * manager re-runs its post-processing pipeline (which now publishes the
 * download_complete AMQP message). This is used to recover VideoFiles/Episodes
 * that never received the original completion notification (e.g. jobs that
 * finished while the legacy Albireo RPC endpoint was unavailable).
 *
 * The caller (UI) provides the specific video file ids to reconcile. Only jobs
 * that are Finished and not cleaned are eligible, because their output vertices
 * and files must still be available.
 */
@injectable()
export class JobReconciliationService {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService,
                @inject(TYPES.RabbitMQService) private _mqService: RabbitMQService,
                @inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.Sentry) private _sentry: Sentry) {
    }

    public async reconcileFinishedJobs(videoFileIds: string[]): Promise<ReconciliationResult> {
        const jobRepo = this._databaseService.getJobRepository(true);
        const vertexRepo = this._databaseService.getVertexRepository();
        const jobs = await jobRepo.getReconcilableFinishedJobs(videoFileIds);

        const result: ReconciliationResult = { reconciled: 0, skipped: 0, jobs: [] };

        // A video file may have more than one finished job (e.g. reprocessed).
        // Jobs are ordered by createTime DESC, so keep only the most recent job
        // per videoId to avoid publishing duplicate messages.
        const seenVideoIds = new Set<string>();

        for (const job of jobs) {
            try {
                const videoId = job.jobMessage.videoId;
                if (seenVideoIds.has(videoId)) {
                    continue;
                }
                seenVideoIds.add(videoId);
                const outputVertices = await vertexRepo.getOutputVertices(job.id);
                const outputPathList = outputVertices.map(vx => vx.outputPath).filter(p => !!p);
                if (outputPathList.length === 0 || !job.metadata) {
                    logger.warn(`Skip reconciliation for job ${job.id}: no output files or metadata`);
                    result.skipped++;
                    continue;
                }
                const msg = this.buildVideoManagerMessage(job, outputPathList);
                const published = await this._mqService.publish(VIDEO_MANAGER_EXCHANGE, VIDEO_MANAGER_GENERAL, msg);
                if (published) {
                    result.reconciled++;
                    result.jobs.push({ jobId: job.id, videoId: msg.videoId, bangumiId: msg.bangumiId });
                    logger.info(`Re-published VideoManagerMessage for job ${job.id}, videoId: ${msg.videoId}`);
                } else {
                    result.skipped++;
                    logger.warn(`Failed to publish VideoManagerMessage for job ${job.id}`);
                }
            } catch (ex) {
                result.skipped++;
                logger.error(ex);
                this._sentry.capture(ex);
            }
        }
        return result;
    }

    /**
     * Rebuilds the VideoManagerMessage from a finished job. File URIs are
     * reconstructed deterministically (no re-upload to S3), matching the URIs
     * produced by JobExecutor.notifyFinished.
     */
    private buildVideoManagerMessage(job: Job, outputPathList: string[]): VideoManagerMessage {
        const msg = new VideoManagerMessage();
        msg.id = randomUUID();
        msg.processedFiles = outputPathList.map((outputPath) => this.toRemoteFile(outputPath, job.jobMessageId));

        const thumbnailPath = this.toRemoteFile(job.metadata.thumbnailPath, job.jobMessageId);
        const keyframeImagePathList = (job.metadata.keyframeImagePathList || [])
            .map((p) => this.toRemoteFile(p, job.jobMessageId));

        msg.metadata = Object.assign({}, job.metadata, { thumbnailPath, keyframeImagePathList });
        msg.jobExecutorId = job.jobExecutorId;
        msg.bangumiId = job.jobMessage.bangumiId;
        msg.videoId = job.jobMessage.videoId;
        msg.downloadTaskId = job.jobMessage.downloadTaskId;
        msg.isProcessed = job.jobMessage.jobType === JobType.NORMAL_JOB;
        return msg;
    }

    private toRemoteFile(localPath: string, jobMessageId: string): RemoteFile {
        const remoteFile = new RemoteFile();
        remoteFile.filename = basename(localPath);
        remoteFile.fileLocalPath = localPath;
        if (this._configManager.storageType() === 'S3') {
            remoteFile.fileUri = `s3://${this._configManager.s3Bucket()}/${remoteFile.filename}`;
        } else {
            remoteFile.fileUri = this._configManager.getFileUrl(remoteFile.filename, jobMessageId);
        }
        return remoteFile;
    }
}
