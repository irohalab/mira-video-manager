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
import 'reflect-metadata';
import { S3Service } from './S3Service';
import { FakeConfigManager } from '../test-helpers/FakeConfigManager';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { PutObjectCommand } from '@aws-sdk/client-s3';

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

test('getContentType resolves MIME types for video, subtitle, image, and unknown extensions', (t) => {
    t.is(S3Service.getContentType('/tmp/output.mp4'), 'video/mp4');
    t.is(S3Service.getContentType('/tmp/source.MKV'), 'video/x-matroska');
    t.is(S3Service.getContentType('/tmp/zh-Hans.vtt'), 'text/vtt; charset=utf-8');
    t.is(S3Service.getContentType('/tmp/ja.ass'), 'text/x-ssa');
    t.is(S3Service.getContentType('/tmp/en.srt'), 'application/x-subrip');
    t.is(S3Service.getContentType('/tmp/kr.smi'), 'application/x-sami');
    t.is(S3Service.getContentType('/tmp/thumb.png'), 'image/png');
    t.is(S3Service.getContentType('/tmp/keyframes-001.jpg'), 'image/jpeg');
    t.is(S3Service.getContentType('/tmp/font.ttf'), 'font/ttf');
    t.is(S3Service.getContentType('/tmp/track.sup'), 'application/octet-stream');
});

test('upload sets ContentType and target bucket for video, subtitle, and image files', async (t) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mira-s3-spec-'));
    try {
        const vttPath = join(tempDir, 'sub.zh.vtt');
        const mp4Path = join(tempDir, 'video.mp4');
        const pngPath = join(tempDir, 'thumb.png');
        await writeFile(vttPath, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n你好\n', 'utf-8');
        await writeFile(mp4Path, Buffer.from([0x00, 0x00, 0x00, 0x18]));
        await writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

        const config = new FakeConfigManager();
        config.storageType = () => 'S3';
        config.s3Config = () => ({ region: 'us-east-1', credentials: { accessKeyId: 'k', secretAccessKey: 's' } });
        config.s3publicConfig = () => ({ videoBucket: 'public-videos', imageBucket: 'public-images' });

        const sentCommands: PutObjectCommand[] = [];
        const s3Service = new S3Service(config);
        (s3Service as any).s3Client = {
            send: async (cmd: PutObjectCommand) => {
                sentCommands.push(cmd);
                return {};
            }
        };

        const subUri = await s3Service.upload(vttPath, 'subtitle');
        const vidUri = await s3Service.upload(mp4Path, 'video');
        const imgUri = await s3Service.upload(pngPath, 'image');

        t.is(subUri, 's3://public-videos/sub.zh.vtt');
        t.is(vidUri, 's3://public-videos/video.mp4');
        t.is(imgUri, 's3://public-images/thumb.png');

        t.is(sentCommands[0].input.Bucket, 'public-videos');
        t.is(sentCommands[0].input.ContentType, 'text/vtt; charset=utf-8');
        t.is(sentCommands[1].input.Bucket, 'public-videos');
        t.is(sentCommands[1].input.ContentType, 'video/mp4');
        t.is(sentCommands[2].input.Bucket, 'public-images');
        t.is(sentCommands[2].input.ContentType, 'image/png');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});