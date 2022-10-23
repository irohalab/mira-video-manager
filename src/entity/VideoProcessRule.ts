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

import { Action } from "../domains/Action";
import { Entity, EntityRepositoryType, JsonType, PrimaryKey, Property } from '@mikro-orm/core';
import { VideoProcessRuleRepository } from '../repository/VideoProcessRuleRepository';
import { randomUUID } from 'crypto';
import { ActionMap } from '../domains/ActionMap';

@Entity({customRepository: () => VideoProcessRuleRepository})
export class VideoProcessRule {

    @PrimaryKey({type: 'uuid', defaultRaw: 'uuid_generate_v4()'})
    public id: string = randomUUID();

    @Property({
        nullable: true
    })
    public name: string;

    @Property({
        nullable: true
    })
    public bangumiId: string;

    @Property({
        nullable: true
    })
    public videoFileId: string;

    /**
     * An expression to determine a rule can apply to a certain download
     */
    @Property({
        nullable: true
    })
    public condition: string;

    @Property({
        type: JsonType,
        columnType: 'jsonb',
        nullable: false
    })
    public actions: ActionMap;

    @Property({
        columnType: 'integer'
    })
    public priority: number;

    [EntityRepositoryType]?: VideoProcessRuleRepository;
}
