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
import { Entity, Enum, JsonType, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class Vertex {
    @PrimaryKey()
    public id: string = randomUUID();

    @Property()
    public jobId: string;

    @Property({
        type: JsonType,
        columnType: 'jsonb'
    })
    public upstreamVertexFinished?: boolean[] = [];

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

    // not serialized
    public videoProcessor: VideoProcessor;
}