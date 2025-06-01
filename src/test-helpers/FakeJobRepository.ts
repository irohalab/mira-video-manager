/*
 * Copyright 2025 IROHA LAB
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

import { JobRepository } from '../repository/JobRepository';
import { Job } from '../entity/Job';
import { JobStatus } from '../domains/JobStatus';
import { NotImplementException } from '@irohalab/mira-shared';
import { FilterQuery, FindOneOptions } from '@mikro-orm/core';
import { Loaded } from '@mikro-orm/core/typings';
import { JobType } from '../domains/JobType';
import { readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { jobDataPath } from './helpers';
import { mkdirSync, statSync, writeFileSync } from 'fs';

let _jobs: any[] = [];
if (process.env.JOB_DATA_PERSIST === 'true') {
    try {
        const statObj = statSync(jobDataPath);
    } catch (err) {
        mkdirSync(dirname(jobDataPath), {recursive: true});
        writeFileSync(jobDataPath, '[]');
    }
}


async function getJobData(): Promise<Job[]> {
    if (process.env.JOB_DATA_PERSIST === 'true') {
        return JSON.parse(await readFile(jobDataPath, { encoding: 'utf8' }));
    } else {
        return _jobs;
    }
}

async function saveJobData(jobs: Job[]): Promise<void> {
    if (process.env.JOB_DATA_PERSIST === 'true') {
        await writeFile(jobDataPath, JSON.stringify(jobs, null, 2));
    } else {
        _jobs = jobs;
    }
}

export class FakeJobRepository extends JobRepository {

    public async getUncleanedFinishedJobs(days: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getUncleanedFailedJobs(days: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getUnfinishedJobs(maxTime: number): Promise<Job[]> {
        const tolerantTime = new Date(Date.now() - (maxTime * 60 * 1000));
        const jobs = await getJobData();
        return jobs.filter(job => job.status === JobStatus.Running && job.startTime < tolerantTime && job.jobMessage.jobType === JobType.NORMAL_JOB);
    }

    public async getPausedAndQueuedJobs(maxTime: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getJobsByStatus(status: JobStatus): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async findOne<P extends string = never>(where: FilterQuery<Job>, options?: FindOneOptions<Job, P>): Promise<Loaded<Job, P> | null> {
        const jobs = await getJobData();
        return Promise.resolve(jobs.find(job => {
            // tslint:disable-next-line:no-string-literal
            return Object.keys(where).every(key => {
                return job[key] === where[key];
            })
        }) as Loaded<Job, P>);
    }

    public async save(job: Job|Job[]): Promise<Job|Job[]> {
        const jobs = await getJobData();
        let incomingData: Job[];
        if (!Array.isArray(job)) {
            incomingData = [job];
        } else {
            incomingData = job;
        }
        const newIdx = [];
        for (let i = 0; i < incomingData.length; i++) {
            const idx = jobs.findIndex(j => incomingData[i].id === j.id);
            if (idx !== -1) {
                jobs[idx] = incomingData[i];
            } else {
                newIdx.push(i);
            }
        }
        for(const idx of newIdx) {
            jobs.push(incomingData[idx]);
        }
        await saveJobData(jobs);
        return job;
    }

    public reset(): void {
        _jobs = [];
    }
}