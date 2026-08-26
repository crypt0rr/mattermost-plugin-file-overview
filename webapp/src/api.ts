import manifest from 'manifest';

import {Client4} from 'mattermost-redux/client';

import type {ChannelFilesResponse, FileOverviewSort} from './types';

export class FileOverviewApiError extends Error {
    public readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'FileOverviewApiError';
        this.status = status;
    }
}

function pluginBaseURL(): string {
    return `${Client4.getUrl()}/plugins/${manifest.id}`;
}

export async function getChannelFiles(
    channelId: string,
    page: number,
    sort: FileOverviewSort,
    signal?: AbortSignal,
): Promise<ChannelFilesResponse> {
    const params = new URLSearchParams({
        page: String(page),
        per_page: '50',
        sort: sort.sort,
        direction: sort.direction,
    });
    const response = await fetch(
        `${pluginBaseURL()}/api/v1/channels/${encodeURIComponent(channelId)}/files?${params.toString()}`,
        {...Client4.getOptions({method: 'get'}), signal},
    );

    if (!response.ok) {
        throw new FileOverviewApiError('File overview request failed', response.status);
    }
    return response.json() as Promise<ChannelFilesResponse>;
}
