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

import { Job } from "../entity/Job";
import { JobStatus } from '../domains/JobStatus';
import { BaseEntityRepository } from '@irohalab/mira-shared/repository/BaseEntityRepository';
import { JobType } from '../domains/JobType';
import { EntityManager } from '@mikro-orm/postgresql';
import { FilterQuery, FindOptions } from '@mikro-orm/core';

export class JobRepository extends BaseEntityRepository<Job> {
    public async getExpiredJobsByStatusOfCurrentExecutor(jobExecutorId: string, status: JobStatus, expire: number): Promise<Job[]> {
        const latestStartTime = new Date(Date.now() - expire);
        return await this.find({
            $and: [
                {status},
                {cleaned: false},
                {startTime: {$lt: latestStartTime}}
            ]
        });
    }

    public async getUnfinishedJobs(maxTime: number): Promise<Job[]> {
        const tolerantTime = new Date(Date.now() - (maxTime * 60 * 1000));
        return await this.find({
            $and: [
                {status: JobStatus.Running},
                {startTime: {$lt: tolerantTime}},
                {jobMessage: {jobType: JobType.NORMAL_JOB}}
            ]
        });
    }

    public async getCurrentJobExecutorRunningJob(jobExecutorId: string, jobId: string): Promise<Job> {
        return await this.findOne({ jobExecutorId, id: jobId, status: JobStatus.Running});
    }

    public async listJobs(status: string, bangumiId?: string): Promise<Partial<Job>[]> {
        const filterQuery: FilterQuery<Job> = {};
        const findOptions: FindOptions<Job, never, "id" | "jobMessage" | "status" | "createTime" | "startTime" | "finishedTime", never> = {
            orderBy: {
                createTime: 'DESC'
            },
            fields: ['id', 'jobMessage', 'status', 'createTime', 'startTime', 'finishedTime']
        };
        if (bangumiId) {
            filterQuery.jobMessage = { bangumiId };
        }
        if (status === 'Running') {
            filterQuery.$or = [{status: JobStatus.Running}, {status: JobStatus.MetaData}];
        } else if (status === 'all') {
            findOptions.limit = 30;
        } else {
            filterQuery.status = status as JobStatus;
        }
        return await this.find(filterQuery, findOptions);
    }

    public remove(job: Job | Job[]): EntityManager {
        return this.em.remove(job);
    }

    public async removeAndFlush(job: Job | Job[]): Promise<void> {
        await this.remove(job).flush();
    }
}