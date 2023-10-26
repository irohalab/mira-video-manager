/*
 * Copyright 2023 IROHA LAB
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

import { JobStatus } from "../domains/JobStatus";
import { JobMessage } from '../domains/JobMessage';
import {
    DateTimeType,
    Entity,
    EntityRepositoryType,
    Enum,
    JsonType,
    PrimaryKey,
    Property
} from "@mikro-orm/core";
import { JobRepository } from '../repository/JobRepository';
import { randomUUID } from 'crypto';
import { ActionMap } from '../domains/ActionMap';
import { VideoOutputMetadata } from '../domains/VideoOutputMetadata';

@Entity({customRepository: () => JobRepository})
export class Job {

    @PrimaryKey({type: 'uuid', defaultRaw: 'uuid_generate_v4()'})
    public id: string = randomUUID();

    @Property()
    public jobMessageId: string;

    @Property({
        type: JsonType,
        columnType: 'jsonb'
    })
    public jobMessage: JobMessage;

    @Property({
        type: JsonType,
        columnType: 'jsonb'
    })
    public actionMap: ActionMap;

    @Enum(() => JobStatus)
    public status: JobStatus = JobStatus.Queueing;

    @Property({
        nullable: true
    })
    public jobExecutorId: string;

    @Property({
        type: DateTimeType,
        columnType: 'timestamp'
    })
    public createTime: Date;

    @Property({
        type: DateTimeType,
        columnType: 'timestamp',
        nullable: true
    })
    public startTime: Date;

    @Property({
        type: DateTimeType,
        columnType: 'timestamp',
        nullable: true
    })
    public finishedTime: Date;

    @Property({
        type: JsonType,
        columnType: 'jsonb',
        nullable: true
    })
    public metadata: VideoOutputMetadata;

    @Property()
    public cleaned: boolean = false;

    [EntityRepositoryType]?: JobRepository;
}
