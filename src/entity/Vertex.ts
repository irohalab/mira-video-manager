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

import { randomUUID } from 'crypto';
import { Action } from '../domains/Action';
import { VideoProcessor } from '../processors/VideoProcessor';
import { VertexStatus } from '../domains/VertexStatus';
import { DateTimeType, Entity, EntityRepositoryType, Enum, JsonType, PrimaryKey, Property } from '@mikro-orm/core';
import { VertexRepository } from '../repository/VertexRepository';
import { ActionType } from '../domains/ActionType';

@Entity({ customRepository: () => VertexRepository })
export class Vertex {

    @PrimaryKey()
    public id: string = randomUUID();

    @Property()
    public jobId: string;

    @Enum()
    public status: VertexStatus;

    @Property({
        type: JsonType,
        columnType: 'jsonb'
    })
    public upstreamVertexIds: string[] = [];

    @Property({
        type: JsonType,
        columnType: 'jsonb'
    })
    public downstreamVertexIds: string[] = [];

    @Property()
    public outputPath: string;

    @Property({
        type: JsonType,
        columnType: 'jsonb'
    })
    public action: Action;

    @Enum()
    public actionType: ActionType;

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


    // not serialized
    public videoProcessor: VideoProcessor;
    public upstreamVertexFinished?: boolean[] = [];

    [EntityRepositoryType]?: VertexRepository;
}