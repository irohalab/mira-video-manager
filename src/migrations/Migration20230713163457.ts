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

import { Migration } from '@mikro-orm/migrations';

export class Migration20230713163457 extends Migration {

  async up(): Promise<void> {
    this.addSql('drop table if exists "message" cascade;');

    this.addSql('alter table "vertex" drop constraint if exists "vertex_actionType_check";');

    this.addSql('alter table "vertex" alter column "actionType" type text using ("actionType"::text);');
    this.addSql('alter table "vertex" add constraint "vertex_actionType_check" check ("actionType" in (\'convert\', \'copy\', \'fragment\', \'merge\', \'extract\', \'validate\'));');
  }

  async down(): Promise<void> {
    this.addSql('create table "message" ("id" varchar not null default null, "exchange" varchar not null default null, "routingKey" varchar not null default null, "content" json not null default null, "enqueuedTime" timestamp not null default null, constraint "message_pkey" primary key ("id"));');

    this.addSql('alter table "vertex" drop constraint if exists "vertex_actionType_check";');

    this.addSql('alter table "vertex" alter column "actionType" type text using ("actionType"::text);');
    this.addSql('alter table "vertex" add constraint "vertex_actionType_check" check ("actionType" in (\'convert\', \'copy\', \'fragment\', \'merge\', \'extract\'));');
  }

}
