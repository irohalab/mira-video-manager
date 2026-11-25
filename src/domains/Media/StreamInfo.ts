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

import { StreamDisposition } from './StreamDisposition';
import { MediaTags } from './MediaTags';

export type MediaStreamType = 'video' | 'audio' | 'subtitle' | 'attachment' | 'data';

export interface BaseStreamInfo {
    index: number;
    codec_type: MediaStreamType;
    codec_name?: string;
    codec_long_name?: string;
    profile?: string;
    codec_tag_string?: string;
    codec_tag?: string;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    time_base?: string;
    start_pts?: number;
    start_time?: string;
    duration_ts?: number;
    duration?: string;
    bit_rate?: string;
    nb_frames?: string;
    disposition?: StreamDisposition;
    tags?: MediaTags;
    [key: string]: any;
}

export interface VideoStreamInfo extends BaseStreamInfo {
    codec_type: 'video';
    codec_name: string;
    width: number;
    height: number;
    coded_width?: number;
    coded_height?: number;
    sample_aspect_ratio?: string;
    display_aspect_ratio?: string;
    pix_fmt?: string;
    level?: number;
    color_range?: string;
    color_space?: string;
    color_transfer?: string;
    color_primaries?: string;
    field_order?: string;
    bits_per_raw_sample?: string;
}

export interface AudioStreamInfo extends BaseStreamInfo {
    codec_type: 'audio';
    codec_name: string;
    sample_fmt?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    bits_per_sample?: number;
}

export interface SubtitleStreamInfo extends BaseStreamInfo {
    codec_type: 'subtitle';
    codec_name: string;
}

export interface OtherStreamInfo extends BaseStreamInfo {
    codec_type: 'attachment' | 'data';
}

export type StreamInfo =
    | VideoStreamInfo
    | AudioStreamInfo
    | SubtitleStreamInfo
    | OtherStreamInfo;
