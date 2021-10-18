/*
 * Copyright 2021 IROHA LAB
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

import { EntityRepository, Repository } from "typeorm";
import { Job } from "../entity/Job";
import { JobStatus } from '../domains/JobStatus';

@EntityRepository(Job)
export class JobRepository extends Repository<Job> {
    public async getUncleanedFinishedJobs(days: number): Promise<Job[]> {
        return await this.createQueryBuilder('job')
            .where('job.status = :status', {
                status: JobStatus.Finished
            })
            .andWhere('job.cleaned = :cleaned', { cleaned: false })
            .andWhere('job.finishedTime < :latestFinishedTime', {
                latestFinishedTime: new Date(Date.now() - (days * 24 * 3600 * 1000))
            })
            .getMany();
    }

    public async getUncleanedFailedJobs(days: number): Promise<Job[]> {
        return await this.createQueryBuilder('job')
            .where('job.status = :status', {
                status: JobStatus.UnrecoverableError
            })
            .andWhere('job.cleaned = :cleaned', { cleaned: false })
            .andWhere('job.startTime < :latestStartTime', {
                latestStartTime: new Date(Date.now() - (days * 24 * 3600 * 1000))
            })
            .getMany();
    }

    public async getUnfinishedJobs(maxTime: number): Promise<Job[]> {
        return await this.createQueryBuilder('job')
            .where('job.status = :status', {status: JobStatus.Running})
            .andWhere('job.startTime < :tolerantTime', {
                tolerantTime: new Date(Date.now() - (maxTime * 60 * 1000))
            })
            .getMany();
    }

    public async getPausedAndQueuedJobs(maxTime: number): Promise<Job[]> {
        return await this.createQueryBuilder('job')
            .where('job.status = :pausedStatus OR job.status = :queuedStatus', {
                pausedStatus: JobStatus.Pause,
                queuedStatus: JobStatus.Queueing
            })
            .andWhere('job.createTime < :tolerantTime', {
                tolerantTime: new Date(Date.now() - (maxTime * 60 * 1000))
            })
            .getMany();
    }
}