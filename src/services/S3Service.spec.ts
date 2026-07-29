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

import test from 'ava';
import { S3Service } from './S3Service';

test('parseS3Url decodes the object key exactly once', (t) => {
    const filename = '[LoliHouse] Saijo no Osewa - 01 [WebRip 1080p HEVC-10bit AAC SRTx2].mkv';

    t.deepEqual(
        S3Service['parseS3Url'](`s3://internal-download-files/${filename}`),
        {bucket: 'internal-download-files', key: filename},
    );
    t.deepEqual(
        S3Service['parseS3Url']('s3://internal-download-files/series/%E6%97%A5%E6%9C%AC%E8%AA%9E.mkv'),
        {bucket: 'internal-download-files', key: 'series/\u65e5\u672c\u8a9e.mkv'},
    );
    t.deepEqual(
        S3Service['parseS3Url']('s3://internal-download-files/literal%2520text.mkv'),
        {bucket: 'internal-download-files', key: 'literal%20text.mkv'},
    );
});