/*
 * Copyright 2026 IROHA LAB
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
import { S3Service } from '../services/S3Service';
import { ConfigManager } from '../utils/ConfigManager';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManagerImpl } from '../utils/ConfigManagerImpl';
import { join } from 'path';


const container = new Container();

container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManagerImpl);
container.bind<S3Service>(S3Service).toSelf();

const testFilePath = join(__dirname, '../../tests/gochuusa-cm.mkv');
const tempDestPath = join(__dirname, '../../temp/test/gochuusa-cm.mkv');

const s3Service = container.get<S3Service>(S3Service);

console.log(`upload: ${testFilePath}`);
s3Service.upload(testFilePath, 'video')
.then((result) => {
    console.log(`s3 path: ${result}`);
    return s3Service.download(result, tempDestPath);
})
.then(() => {
    console.log(`s3 path: ${tempDestPath} downloaded`);
})