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

import { Container } from 'inversify';
import { ConfigManager } from './utils/ConfigManager';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import * as util from 'util';

const container = new Container();
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl);

const configManager = container.get<ConfigManager>(TYPES.ConfigManager);

function showHelpText() {
    console.log(`
            Usage: migrate.ts [options]
            Options:
                --generate -i    generate a migration file
                --init     -i    generate and complete init migration
                --upgrade  -u    upgrade to latest migration.
        `);
}

(async () => {
    const ormHelper = await MikroORM.init<PostgreSqlDriver>(configManager.databaseConfig());
    const migrator = ormHelper.getMigrator();
    const cmdArgs = process.argv.slice(2);
    let operation: string;
    let result: any;
    if (cmdArgs && cmdArgs.length === 1) {
        operation = cmdArgs[0];
        switch (operation) {
            case '--generate':
            case '-g':
                result = await migrator.createMigration();
                break;
            case '--init':
            case '-i':
                result = await migrator.createInitialMigration();
                break;
            case '--upgrade':
            case '-u':
                result = await migrator.up();
                break;
            default:
                showHelpText();
        }
    } else {
        showHelpText();
    }
    console.log(util.inspect(result, {depth: 2}));

})();
