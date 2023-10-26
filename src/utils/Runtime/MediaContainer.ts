/*
 * Copyright 2023 IROHA LAB
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


import { ContainerInfo } from '../../domains/MediaInfo/ContainerInfo';
import { TrackInfo } from '../../domains/MediaInfo/TrackInfo';
import { VideoInfo } from '../../domains/MediaInfo/VideoInfo';
import { AudioInfo } from '../../domains/MediaInfo/AudioInfo';

export class MediaContainer {
    constructor(private _trackInfos: TrackInfo[]) {
    }
    public isPlayable():boolean {
        return this.getContainerInfo().Format === 'MPEG-4';
    }
    public subtitlesCount(): number {
        return this._trackInfos.filter(info => info['@type'] === 'Text').length;
    }

    public videoStreamCount(): number {
        return this._trackInfos.filter(info => info['@type'] === 'Video').length;
    }

    public audioStreamCount(): number {
        return this._trackInfos.filter(info => info['@type'] === 'Audio').length;
    }

    public isStreamable(): boolean {
        return this.getContainerInfo().IsStreamable === "Yes";
    }

    public getContainerInfo(): ContainerInfo {
        return this._trackInfos.find(info => info['@type'] === 'General') as ContainerInfo;
    }

    public getDefaultVideoStreamInfo(): VideoInfo {
        const videoTracks = this._trackInfos.filter(info => info['@type'] === 'Video');
        if (videoTracks.length === 1) {
            return videoTracks[0] as VideoInfo;
        } else if (videoTracks.length > 1){
            let defaultVideoTrack = videoTracks.find(info => (info as VideoInfo).Default) as VideoInfo;
            if (!defaultVideoTrack) {
                defaultVideoTrack = videoTracks[0] as VideoInfo;
            }
            return defaultVideoTrack;
        } else {
            return null;
        }
    }

    public getDefaultAudioStreamInfo(): AudioInfo {
        const audioTracks = this._trackInfos.filter(info => info['@type'] === 'Audio');
        if (audioTracks.length === 1) {
            return audioTracks[0] as AudioInfo;
        } else if (audioTracks.length > 1) {
            let defaultAudioTracks = audioTracks.find(info => (info as AudioInfo).Default) as AudioInfo;
            if (!defaultAudioTracks) {
                defaultAudioTracks = audioTracks[0] as AudioInfo;
            }
            return defaultAudioTracks;
        } else {
            return null;
        }
    }

    /**
     * return duration of media, unit is second
     */
    public getDuration(): number {
        return parseFloat(this.getContainerInfo().Duration);
    }
}