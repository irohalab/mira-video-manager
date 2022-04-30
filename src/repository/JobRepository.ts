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

import { Job } from "../entity/Job";
import { JobStatus } from '../domains/JobStatus';
import { BaseEntityRepository } from '@irohalab/mira-shared/repository/BaseEntityRepository';

export class JobRepository extends BaseEntityRepository<Job> {
    public async getUncleanedFinishedJobs(days: number): Promise<Job[]> {
        const latestFinishedTime = new Date(Date.now() - (days * 24 * 3600 * 1000));
        return await this.find({
            $and: [
                {status: JobStatus.Finished},
                {cleaned: false},
                {finishedTime: {$lt: latestFinishedTime}}
            ]
        });
    }

    public async getUncleanedFailedJobs(days: number): Promise<Job[]> {
        const latestStartTime = new Date(Date.now() - (days * 24 * 3600 * 1000));
        return await this.find({
            $and: [
                {status: JobStatus.UnrecoverableError},
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
                {startTime: {$lt: tolerantTime}}
            ]
        });
    }

    public async getPausedAndQueuedJobs(maxTime: number): Promise<Job[]> {
        const tolerantTime = new Date(Date.now() - (maxTime * 60 * 1000));
        return await this.find({
            $and: [
                {
                    $or: [
                        {status: JobStatus.Pause},
                        {status: JobStatus.Queueing}
                    ]
                },
                {createTime: {$lt: tolerantTime}}
            ]
        });
    }

    public async getJobsByStatus(status: JobStatus): Promise<Job[]> {
        return await this.find({status}, {
            orderBy: {
                createTime: 'DESC'
            }
        })
    }
}