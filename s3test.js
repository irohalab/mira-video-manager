/*
 * Copyright 2025 IROHA LAB
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

import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3"

const s3client = new S3Client({
    // specify endpoint with http://hostname:port
    endpoint: `http://127.0.0.1:8333`,
    // specify region since it is mandatory, but it will be ignored by seaweedfs
    region: `us-east-1`,
    // force path style for compatibility reasons
    forcePathStyle: true,
    // dual stack endpoint is not supported by seaweed
    useDualstackEndpoint: false,
    // checksum validation should be disabled, overwise `x-amz-checksum` will be injected directly into files
    responseChecksumValidation: `WHEN_REQUIRED`,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    // credentials is mandatory and s3 authorization should be enabled with `s3.configure`
    credentials: {
        accessKeyId: `admin`,
        secretAccessKey: `admin`,
    }
})

// List buckets example
const response = await s3client.send(new ListBucketsCommand({}))
console.log(response.Buckets)