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
import { VideoProcessRuleRepository } from '../repository/VideoProcessRuleRepository';
import { BaseDatabaseService } from '@irohalab/mira-shared';
import { VertexRepository } from '../repository/VertexRepository';
import { SessionRepository } from '../repository/SessionRepository';

export interface DatabaseService extends BaseDatabaseService {
    getJobRepository(useRequestContext?: boolean): JobRepository;
    getVideoProcessRuleRepository(useRequestContext?: boolean): VideoProcessRuleRepository;
    getVertexRepository(useRequestContext?: boolean): VertexRepository;
    getSessionRepository(useRequestContext?: boolean): SessionRepository;
    initSchema(): Promise<void>;
    clearExpiredSession(): void;
}