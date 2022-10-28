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


import { injectable } from 'inversify';
import { DatabaseService } from '../services/DatabaseService';
import { JobRepository } from '../repository/JobRepository';
import { VideoProcessRuleRepository } from '../repository/VideoProcessRuleRepository';
import { FakeMessageRepository } from './FakeMessageRepository';
import { NotImplementException } from '@irohalab/mira-shared';
import { NextFunction, Request, Response } from 'express';
import { VertexRepository } from '../repository/VertexRepository';
import { FakeVertexRepository } from './FakeVertexRepository';
import { SqlEntityManager } from '@mikro-orm/postgresql';
import { Vertex } from '../entity/Vertex';
import { FakeJobRepository } from './FakeJobRepository';
import { Job } from '../entity/Job';
import { SessionRepository } from '../repository/SessionRepository';
import { FakeSessionRepository } from './FakeSessionRepository';
import { Session } from '../entity/Session';

@injectable()
export class FakeDatabaseService implements DatabaseService {

    private vertexRepo = new FakeVertexRepository({} as SqlEntityManager, Vertex);
    private jobRepo = new FakeJobRepository({} as SqlEntityManager, Job);
    private sessionRepo = new FakeSessionRepository({} as SqlEntityManager, Session);
    public getSessionRepository(useRequestContext?: boolean): SessionRepository {
        return this.sessionRepo;
    }
    public getJobRepository(): JobRepository {
        return this.jobRepo;
    }

    public getMessageRepository(): FakeMessageRepository {
        throw new NotImplementException();
    }

    public getVideoProcessRuleRepository(): VideoProcessRuleRepository {
        throw new NotImplementException();
    }

    public getVertexRepository(useRequestContext?: boolean): VertexRepository {
        return this.vertexRepo;
    }

    public start(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public stop(): Promise<void> {
        return Promise.resolve(undefined);
    }

    public requestContextMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
        return (req: Request, res: Response, next: NextFunction) => {
            next();
        };
    }

    public initSchema(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    public generateSchema(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    public syncSchema(): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public clearExpiredSession(): void {
        throw new Error('Method not implemented.');
    }
}