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
import { DateTimeType, Entity, EntityRepositoryType, PrimaryKey, Property } from '@mikro-orm/core';
import { SessionRepository } from '../repository/SessionRepository';

@Entity({customRepository: () => SessionRepository})
export class Session {

    @PrimaryKey({type: 'uuid', defaultRaw: 'uuid_generate_v4()'})
    public id: string = randomUUID();

    @Property({
        type: DateTimeType,
        columnType: 'timestamp',
        nullable: false
    })
    public expire: Date;

    [EntityRepositoryType]?: SessionRepository;
}