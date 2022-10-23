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

import { MQMessage } from '@irohalab/mira-shared';
import { v4 as uuid4 } from 'uuid';

export class CommandMessage implements MQMessage {
    public id: string;
    public version: string;
    public command: string;
    public jobId: string;

    constructor() {
        this.id = uuid4();
        this.version = '1.0';
    }

}

export const CMD_CANCEL  = 'cancel';
export const CMD_PAUSE = 'pause';
export const CMD_RESUME = 'resume';