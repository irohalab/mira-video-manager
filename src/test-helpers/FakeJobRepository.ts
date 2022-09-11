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

export class FakeJobRepository extends JobRepository {
    // private _jobs = [];
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
}