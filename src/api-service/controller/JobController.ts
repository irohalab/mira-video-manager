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

import { controller, httpGet, interfaces, queryParam } from 'inversify-express-utils';
import { DatabaseService } from '../../services/DatabaseService';
import { inject } from 'inversify';
import { JobStatus } from '../../domains/JobStatus';
import { Job } from '../../entity/Job';
import { ResponseWrapper, TYPES } from '@irohalab/mira-shared';

@controller('/job')
export class JobController implements interfaces.Controller {
    constructor(@inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    @httpGet('/')
    public async listJobs(@queryParam('status') jobStatus: string): Promise<ResponseWrapper<Job[]>> {
        const status = jobStatus as JobStatus;
        const jobs = await this._databaseService.getJobRepository().find(
            {
                where: { status },
                order: {
                    createTime: 'DESC'
                }
            }
        );
        return {
            data: jobs,
            status: 0
        };
    }
}