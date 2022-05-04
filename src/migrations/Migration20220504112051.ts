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

import { Migration } from '@mikro-orm/migrations';

export class Migration20220504112051 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table "video_process_rule" ("id" varchar(255) not null, "name" varchar(255) null, "bangumiId" varchar(255) null, "videoFileId" varchar(255) null, "condition" varchar(255) null, "actions" jsonb not null, "priority" integer not null);');
    this.addSql('alter table "video_process_rule" add constraint "video_process_rule_pkey" primary key ("id");');

    this.addSql('create table "job" ("id" varchar(255) not null, "jobMessageId" varchar(255) not null, "jobMessage" jsonb not null, "progress" int not null, "stateHistory" jsonb not null, "status" smallint not null, "jobExecutorId" varchar(255) null, "createTime" timestamp not null, "startTime" timestamp null, "finishedTime" timestamp null, "cleaned" boolean not null);');
    this.addSql('alter table "job" add constraint "job_pkey" primary key ("id");');
  }

}
