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

import { ContainerInfo } from '../../domains/Media/ContainerInfo';
import { MediaProbeResult } from '../../domains/Media/MediaProbeResult';
import { AudioStreamInfo, StreamInfo, VideoStreamInfo } from '../../domains/Media/StreamInfo';

const DISALLOWED_ISO_MAJOR_BRANDS = new Set(['qt', 'mjp2', 'm4a', 'm4b']);
const PLAYABLE_MP4_BRANDS = new Set([
    'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6',
    'mp41', 'mp42', 'avc1', 'dash', 'cmfc', 'cmf2', 'm4v'
]);

function isPlayableMp4Format(format: ContainerInfo | null): boolean {
    if (!format || !format.format_name) {
        return false;
    }
    const formatNames = format.format_name.split(',').map(f => f.trim().toLowerCase());
    if (!formatNames.includes('mp4')) {
        return false;
    }
    const rawMajorBrand = format.tags?.major_brand;
    const majorBrand = rawMajorBrand ? rawMajorBrand.trim().toLowerCase() : '';
    if (majorBrand && DISALLOWED_ISO_MAJOR_BRANDS.has(majorBrand)) {
        return false;
    }
    if (majorBrand && PLAYABLE_MP4_BRANDS.has(majorBrand)) {
        return true;
    }
    const compatibleBrands = (format.tags?.compatible_brands || '').toLowerCase();
    for (const brand of PLAYABLE_MP4_BRANDS) {
        if (compatibleBrands.includes(brand)) {
            return true;
        }
    }
    return !majorBrand;
}

function getVideoStreams(streams: StreamInfo[]): VideoStreamInfo[] {
    return streams.filter(
        (s): s is VideoStreamInfo => s.codec_type === 'video' && !s.disposition?.attached_pic
    );
}

export class MediaContainer {
    private _format: ContainerInfo | null;
    private _streams: StreamInfo[];

    constructor(probeResult: MediaProbeResult) {
        this._format = probeResult?.format || null;
        this._streams = probeResult?.streams || [];
    }

    public isPlayable(): boolean {
        return isPlayableMp4Format(this._format);
    }

    public subtitlesCount(): number {
        return this._streams.filter(info => info.codec_type === 'subtitle').length;
    }

    public videoStreamCount(): number {
        return getVideoStreams(this._streams).length;
    }

    public audioStreamCount(): number {
        return this._streams.filter(info => info.codec_type === 'audio').length;
    }

    public isStreamable(): boolean {
        return Boolean(this._format && this.isPlayable() && this._format.isStreamable);
    }

    public getContainerInfo(): ContainerInfo | null {
        return this._format;
    }

    public getDefaultVideoStreamInfo(): VideoStreamInfo | null {
        const videoTracks = getVideoStreams(this._streams);
        if (videoTracks.length === 0) {
            return null;
        }
        if (videoTracks.length === 1) {
            return videoTracks[0];
        }
        return videoTracks.find(info => info.disposition?.default === 1) || videoTracks[0];
    }

    public getDefaultAudioStreamInfo(): AudioStreamInfo | null {
        const audioTracks = this._streams.filter(
            (info): info is AudioStreamInfo => info.codec_type === 'audio'
        );
        if (audioTracks.length === 0) {
            return null;
        }
        if (audioTracks.length === 1) {
            return audioTracks[0];
        }
        return audioTracks.find(info => info.disposition?.default === 1) || audioTracks[0];
    }

    /**
     * return duration of media, unit is second
     */
    public getDuration(): number {
        if (this._format?.duration) {
            return parseFloat(this._format.duration);
        }
        const defaultVideo = this.getDefaultVideoStreamInfo();
        if (defaultVideo?.duration) {
            return parseFloat(defaultVideo.duration);
        }
        return 0;
    }
}