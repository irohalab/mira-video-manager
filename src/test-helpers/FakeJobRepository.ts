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

import { JobRepository } from '../repository/JobRepository';
import { Job } from '../entity/Job';
import { JobStatus } from '../domains/JobStatus';
import { NotImplementException } from '@irohalab/mira-shared';
import { FilterQuery, FindOneOptions } from '@mikro-orm/core';
import { Loaded } from '@mikro-orm/core/typings';

let _jobs = [];

export class FakeJobRepository extends JobRepository {

    public async getUncleanedFinishedJobs(days: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getUncleanedFailedJobs(days: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getUnfinishedJobs(maxTime: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getPausedAndQueuedJobs(maxTime: number): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async getJobsByStatus(status: JobStatus): Promise<Job[]> {
        throw new NotImplementException();
    }

    public async findOne<P extends string = never>(where: FilterQuery<Job>, options?: FindOneOptions<Job, P>): Promise<Loaded<Job, P> | null> {
        return Promise.resolve(_jobs.find(job => {
            // tslint:disable-next-line:no-string-literal
            return job.id === where['id'];
        }));
    }

    public async save(job: Job|Job[]): Promise<Job|Job[]> {
        let incomingData: Job[];
        if (!Array.isArray(job)) {
            incomingData = [job];
        } else {
            incomingData = job;
        }
        const newIdx = [];
        for (let i = 0; i < incomingData.length; i++) {
            const idx = _jobs.findIndex(j => incomingData[i].id === j.id);
            if (idx !== -1) {
                _jobs[idx] = incomingData[i];
            } else {
                newIdx.push(i);
            }
        }
        for(const idx of newIdx) {
            _jobs.push(incomingData[idx]);
        }
        return job;
    }

    public reset(): void {
        _jobs = [];
    }
}