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

import { ConfigManager } from "../utils/ConfigManager";
import { ConfirmChannel, connect, Connection } from 'amqplib';
import { inject, injectable } from 'inversify';
import { Buffer } from 'buffer';
import { MQMessage } from '../domains/MQMessage';
import { DatabaseService } from './DatabaseService';
import { Message } from '../entity/Message';
import { TYPES } from '../TYPES';
import pino from 'pino';
import { capture } from '../utils/sentry';

const CHECK_INTERVAL = 5000;
const logger = pino();

@injectable()
export class RabbitMQService {
    private _connection: Connection;
    private _channels = new Map<string, ConfirmChannel>();
    private _queues = new Map<string, string>();
    private _connected: boolean;

    constructor(@inject(TYPES.ConfigManager) private _configManager: ConfigManager,
                @inject(TYPES.DatabaseService) private _databaseService: DatabaseService) {
    }

    public publish(exchangeName: string, routingKey: string, message: any): Promise<boolean> {
        const channel = this._channels.get(exchangeName);
        return new Promise<boolean>((resolve, reject) => {
            channel.publish(
                exchangeName,
                routingKey,
                Buffer.from(JSON.stringify(message), 'utf-8'),
                {},
                (err, ok) => {
                    if (err !== null) {
                        // TODO: currently not reachable, need to figure out how to test this piece of code.
                        logger.warn('message nacked');
                        this.saveMessage(exchangeName, routingKey, message)
                            .then(() => {
                                logger.info('message saved, will be resent')
                            });
                        reject(err);
                    } else {
                        resolve(true);
                        logger.debug('message acked')
                    }
                });
        });
    }

    public async initPublisher(exchangeName: string, exchangeType: string): Promise<void> {
        if (!this._connection || !this._connected) {
            await this.connectAsync();
        }
        const channel = await this._connection.createConfirmChannel();
        this._channels.set(exchangeName, channel);
        await channel.assertExchange(exchangeName, exchangeType);
    }

    /**
     * initialize a consumer
     * @param exchangeName
     * @param exchangeType
     * @param queueName
     * @param bindingKey
     * @param prefetch, see Fair dispatch in the tutorial (https://www.rabbitmq.com/tutorials/tutorial-two-javascript.html)
     */
    public async initConsumer(exchangeName: string, exchangeType: string, queueName: string, bindingKey: string = '', prefetch = false): Promise<void> {
        if (!this._connection || !this._connected) {
            await this.connectAsync();
        }
        const channel = await this._connection.createConfirmChannel();
        this._channels.set(exchangeName, channel);
        await channel.assertExchange(exchangeName, exchangeType);
        const q = await channel.assertQueue(queueName);
        if (prefetch) {
            await channel.prefetch(1);
        }
        await channel.bindQueue(q.queue, exchangeName, bindingKey);
        this._queues.set(queueName, exchangeName);
    }

    private async connectAsync(): Promise<void> {
        this._connection = await connect(this._configManager.amqpServerUrl() || this._configManager.amqpConfig());
        this._connection.on('error', (error: any) => {
            if (this._connected) {
                capture(error);
                this.reconnect();
            }
        });
        this._connection.on('close', (error: any) => {
            if (this._connected && error) {
                capture(error);
                this.reconnect();
            }
        })
        this._connected = true;
        await this.resendMessageInFailedQueue();
    }

    private reconnect(): void {
        logger.warn('reconnect in 5 seconds');
        setTimeout(() => {
            this.connectAsync()
                .then(() => {
                    logger.info('reconnect successfully');
                })
                .catch((err) => {
                    capture(err);
                    logger.error(err);
                })
        }, 5000);
    };

    public async consume(queueName: string, onMessage: (msg: MQMessage) => Promise<boolean>): Promise<string> {
        const exchangeName = this._queues.get(queueName);
        const channel = this._channels.get(exchangeName);
        const result = await channel.consume(queueName, async (msg) => {
            if (msg) {
                const mqMsg = JSON.parse(msg.content.toString('utf-8')) as MQMessage;
                if (await onMessage(mqMsg)) {
                    channel.ack(msg);
                } else {
                    channel.nack(msg);
                }
            } else {
                // TODO: Handle the consumer cancel in this service
            }
        });
        return result.consumerTag;
    }

    private async saveMessage(exchange: string, routingKey: string, content: any): Promise<void> {
        const message = new Message();
        message.exchange = exchange;
        message.routingKey = routingKey;
        message.content = content;
        await this._databaseService.getMessageRepository().enqueueMessage(message);
    }

    private async resendMessageInFailedQueue(): Promise<void> {
        let result: boolean;
        let message: Message;
        while (result) {
            message = await this._databaseService.getMessageRepository().dequeueMessage();
            if (message) {
                try {
                    result = await this.publish(message.exchange, message.routingKey, message.content);
                } catch (err) {
                    result = false;
                    break;
                }
                if (!result) {
                    await this._databaseService.getMessageRepository().enqueueMessage(message);
                }
            }
        }
        setTimeout(this.resendMessageInFailedQueue.bind(this), CHECK_INTERVAL);
    }
}