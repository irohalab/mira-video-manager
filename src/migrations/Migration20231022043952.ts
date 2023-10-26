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

export class Migration20231022043952 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table "job" drop constraint if exists "job_status_check";');

    this.addSql('alter table "job" add column "metadata" jsonb null;');
    this.addSql('alter table "job" alter column "status" type text using ("status"::text);');
    this.addSql('alter table "job" add constraint "job_status_check" check ("status" in (\'Queueing\', \'Running\', \'MetaData\', \'Finished\', \'UnrecoverableError\', \'Pause\', \'Canceled\'));');
  }

  async down(): Promise<void> {
    this.addSql('alter table "job" drop constraint if exists "job_status_check";');

    this.addSql('alter table "job" alter column "status" type text using ("status"::text);');
    this.addSql('alter table "job" add constraint "job_status_check" check ("status" in (\'Queueing\', \'Running\', \'Finished\', \'UnrecoverableError\', \'Pause\', \'Canceled\'));');
    this.addSql('alter table "job" drop column "metadata";');
  }

}
