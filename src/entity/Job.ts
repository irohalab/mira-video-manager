/*
 * Copyright 2021 IROHA LAB
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

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { JobStatus } from "../domains/JobStatus";
import { JobMessage } from '../domains/JobMessage';
import { JobState } from '../domains/JobState';

@Entity()
export class Job {
    @PrimaryGeneratedColumn('uuid')
    public id: string;

    @Column()
    public jobMessageId: string;

    @Column({
        type: 'jsonb'
    })
    public jobMessage: JobMessage;

    /**
     * index of current action to be or being executed from actions array.
     */
    @Column()
    public progress: number;

    @Column({
        type: 'jsonb'
    })
    public stateHistory: JobState[];

    @Column({
        type: 'enum',
        enum: JobStatus,
        default: JobStatus.Queueing
    })
    public status: JobStatus

    @Column()
    public jobExecutorId: string;

    @Column({
        type: 'timestamp'
    })
    public createTime: Date;

    @Column({
        type: 'timestamp'
    })
    public startTime: Date;

    @Column({
        type: 'timestamp'
    })
    public finishedTime: Date;
}
