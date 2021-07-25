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
import { Action } from "../domains/Action";

@Entity()
export class VideoProcessRule {

    @PrimaryGeneratedColumn('uuid')
    public id: string;

    @Column({
        nullable: true
    })
    public bangumiId: string;

    @Column({
        nullable: true
    })
    public videoFileId: string;

    /**
     * An expression to determine a rule can apply to a certain download
     */
    @Column({
        nullable: true
    })
    public condition: string;

    @Column()
    public actions: Action[];

    @Column()
    public priority: number;
}
