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

import { inject, injectable } from 'inversify';
import { TYPES } from '@irohalab/mira-shared';
import { ConfigManager } from '../utils/ConfigManager';
import {
    AbortMultipartUploadCommand,
    CompletedPart, CompleteMultipartUploadCommand,
    CreateBucketCommand,
    CreateMultipartUploadCommand, GetObjectCommand,
    ListBucketsCommand,
    PutObjectCommand,
    S3Client, UploadPartCommand
} from '@aws-sdk/client-s3';
import { mkdir, stat, unlink } from 'fs/promises';
import { basename, dirname } from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { getStdLogger } from '../utils/Logger';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const FIVE_GIGABYTES = 5 * 1024 * 1024 * 1024;
const MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks (AWS recommends parts between 5MB and 5GB)

const logger = getStdLogger();

@injectable()
export class S3Service {
    private s3Client: S3Client;

    constructor(@inject(TYPES.ConfigManager) private configManager: ConfigManager) {
        if (configManager.storageType() === 'S3') {
            this.s3Client = new S3Client(configManager.s3Config());
        }
    }

    private static parseS3Url(s3Url: string): { bucket: string, key: string } {
        const url = new URL(s3Url);
        const bucket = url.hostname;
        const encodedKey = url.pathname.startsWith("/")
            ? url.pathname.substring(1)
            : url.pathname;
        const key = decodeURIComponent(encodedKey);
        if (!bucket || !key) {
            throw new Error("Invalid S3 URL format (s3://).");
        }
        return { bucket, key };
    }

    private static async checkExits(filePath: string, isDirectory: boolean = false): Promise<boolean> {
        try {
            const statObj = await stat(filePath);
            if (isDirectory) {
                return statObj.isDirectory();
            } else {
                return statObj.isFile();
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                return false
            } else {
                throw err;
            }
        }
    }

    public async ensureBucket(): Promise<void> {
        if (this.configManager.storageType() !== 'S3') {
            return null;
        }
        const bucketName = this.configManager.s3Bucket();

        const result = await this.s3Client.send(new ListBucketsCommand());
        if (!result.Buckets.some(bucket => bucket.Name === bucketName)) {
            logger.info(`${bucketName} not found, creating...`);
            await this.s3Client.send(new CreateBucketCommand({Bucket: bucketName}));
            logger.info(`${bucketName} created!`);
        }
    }

    public async download(s3Url: string, destPath: string): Promise<void> {
        let s3Bucket: string;
        let s3Key: string;

        try {
            const parsedUrl = S3Service.parseS3Url(s3Url);
            s3Bucket = parsedUrl.bucket;
            s3Key = parsedUrl.key;
        } catch (error) {
            console.error("Invalid S3 URL:", error);
            throw error; // Re-throw the parsing error
        }

        console.log(`Attempting to download s3://${s3Bucket}/${s3Key} to ${destPath}`);

        try {
            const getObjectCommand = new GetObjectCommand({
                Bucket: s3Bucket,
                Key: s3Key,
            });

            const response = await this.s3Client.send(getObjectCommand);

            if (!response.Body || !(response.Body instanceof Readable)) {
                throw new Error("S3 object body is not a readable stream.");
            }

            const fileStream = createWriteStream(destPath);

            // Use pipeline to handle stream errors and backpressure correctly
            await pipeline(response.Body, fileStream);

            console.log(`Successfully downloaded s3://${s3Bucket}/${s3Key} to ${destPath}`);
        } catch (error) {
            console.error(
                `Failed to download s3://${s3Bucket}/${s3Key} to ${destPath}:`,
                error,
            );
            // Attempt to clean up partially downloaded file on error
            if (await S3Service.checkExits(destPath)) {
                try {
                    await unlink(destPath);
                    console.log(`Cleaned up partially downloaded file: ${destPath}`);
                } catch (cleanupError) {
                    console.error(`Failed to clean up partial file ${destPath}:`, cleanupError);
                }
            }
            throw error; // Re-throw the error to be handled by the caller
        }
    }

    public async upload(localFilePath: string): Promise<string> {
        if (this.configManager.storageType() !== 'S3') {
            return null;
        }
        const bucketName = this.configManager.s3Bucket();
        const s3Key = basename(localFilePath);

        try {
            const stats = await stat(localFilePath);
            const fileSizeInBytes = stats.size;

            if (fileSizeInBytes <= FIVE_GIGABYTES) {
                // For files 5GB or smaller, use PutObjectCommand
                logger.info(`Starting standard upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);
                const fileStream = createReadStream(localFilePath);
                const putObjectCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: fileStream,
                    ContentLength: fileSizeInBytes, // Important for progress tracking and some S3 features
                });

                await this.s3Client.send(putObjectCommand);
                logger.info(`Successfully uploaded ${localFilePath} to s3://${bucketName}/${s3Key}`);
                return `s3://${bucketName}/${s3Key}`;
            } else {
                // For files larger than 5GB, use multipart upload
                logger.info(`Starting multipart upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);

                const createMultipartUploadCommand = new CreateMultipartUploadCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                });
                const { UploadId } = await this.s3Client.send(createMultipartUploadCommand);

                if (!UploadId) {
                    throw new Error("Failed to create multipart upload.");
                }

                logger.info(`Multipart upload initiated. Upload ID: ${UploadId}`);

                const completedParts: CompletedPart[] = [];
                const fileStream = createReadStream(localFilePath, { highWaterMark: MULTIPART_CHUNK_SIZE });
                let partNumber = 1;
                let accumulatedBytes = 0;

                try {
                    for await (const chunk of fileStream) {
                        const uploadPartCommand = new UploadPartCommand({
                            Bucket: bucketName,
                            Key: s3Key,
                            UploadId,
                            PartNumber: partNumber,
                            Body: chunk,
                            ContentLength: chunk.length,
                        });

                        const { ETag } = await this.s3Client.send(uploadPartCommand);
                        if (!ETag) {
                            throw new Error(`Failed to upload part ${partNumber}. ETag is missing.`);
                        }

                        completedParts.push({ PartNumber: partNumber, ETag });
                        accumulatedBytes += chunk.length;
                        logger.info(`Uploaded part ${partNumber} (${(accumulatedBytes / fileSizeInBytes * 100).toFixed(2)}%)`);
                        partNumber++;
                    }

                    const completeMultipartUploadCommand = new CompleteMultipartUploadCommand({
                        Bucket: bucketName,
                        Key: s3Key,
                        UploadId,
                        MultipartUpload: {
                            Parts: completedParts,
                        },
                    });

                    await this.s3Client.send(completeMultipartUploadCommand);
                    logger.info(`Successfully completed multipart upload for ${localFilePath} to s3://${bucketName}/${s3Key}`);
                    return `s3://${bucketName}/${s3Key}`;

                } catch (uploadError) {
                    console.error("Error during multipart upload. Aborting...", uploadError);
                    const abortMultipartUploadCommand = new AbortMultipartUploadCommand({
                        Bucket: bucketName,
                        Key: s3Key,
                        UploadId,
                    });
                    await this.s3Client.send(abortMultipartUploadCommand);
                    logger.info("Multipart upload aborted.");
                    throw uploadError; // Re-throw the error after aborting
                }
            }
        } catch (error) {
            console.error(`Upload failed for ${localFilePath}:`, error);
            throw error; // Re-throw the error to be handled by the caller
        }
    }
}