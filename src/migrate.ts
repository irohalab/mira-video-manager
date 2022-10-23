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
import 'reflect-metadata';

import { Container } from 'inversify';
import { ConfigManager } from './utils/ConfigManager';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManagerImpl } from './utils/ConfigManagerImpl';
import { MikroORM } from '@mikro-orm/core';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import * as util from 'util';
import { DatabaseService } from './services/DatabaseService';
import { DatabaseServiceImpl } from './services/DatabaseServiceImpl';
import { createInterface } from 'readline';
import { stdin, stdout } from 'node:process';

const container = new Container();
container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl);
container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseServiceImpl);

const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
const dbService= container.get<DatabaseService>(TYPES.DatabaseService);

function showHelpText() {
    console.log(`
            Usage: migrate.ts [options]
            Options:
                --generate -i    generate a migration file
                --init     -i    generate and complete init migration
                --upgrade  -u    upgrade to latest migration.
                --sync     -s    drop current schema and sync schema with current entities. to bypass prompt, combine with --silent
        `);
}

(async () => {
    const ormHelper = await MikroORM.init<PostgreSqlDriver>(configManager.databaseConfig());
    const migrator = ormHelper.getMigrator();
    const cmdArgs = process.argv.slice(2);
    let operation: string;
    let result: any;
    if (cmdArgs && cmdArgs.length >= 1) {
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
            case '--sync':
            case '-s':
                const rl = createInterface({
                    input: stdin,
                    output: stdout
                });
                let answer;
                if (cmdArgs.length === 2 && cmdArgs[1] === '--silent') {
                    answer = 'y';
                } else {
                    answer = await new Promise((resolve, reject) => {
                        rl.question('This will drop all tables and you will lose data, do you want to proceeed? (y/n)', (ans) => {
                            if (ans === 'y' || ans === 'n') {
                                resolve(ans);
                            } else {
                                reject('invalid answer, must be y or n');
                            }
                        });
                    });
                }
                if (answer === 'y') {
                    await dbService.start();
                    result = await dbService.initSchema();
                    console.log('schema synced!');
                    process.exit(0);
                    return;
                }
                break;
            default:
                showHelpText();
        }
    } else {
        showHelpText();
    }
    console.log(util.inspect(result, {depth: 2}));
    process.exit(0);
})();
