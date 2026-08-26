import type {ChannelMembership} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import {t} from './messages';
import type {ChannelSearchContext, FileOverviewItem, NativeFileSearchResponse} from './types';

export const nativeSearchPageSize = 60;

export type SearchRequest = {
    teamId: string;
    terms: string;
};

export type SearchResult = {
    items: FileOverviewItem[];
    hasMore: boolean;
    limited: boolean;
};

export async function loadConversationParticipants(channelId: string): Promise<UserProfile[]> {
    const memberships = await Client4.getChannelMembers(channelId, 0, 200) as ChannelMembership[];
    const userIds = memberships.map((membership) => membership.user_id);
    if (userIds.length === 0) {
        return [];
    }
    return Client4.getProfilesByIds(userIds);
}

export function validateExtension(extension: string): string {
    const normalized = extension.trim().replace(/^\./, '').toLowerCase();
    if (normalized === '') {
        return '';
    }
    if (!(/^[a-z0-9][a-z0-9+_-]{0,15}$/).test(normalized)) {
        throw new Error(t('extensionInvalid'));
    }
    return normalized;
}

export function quoteLiteralSearch(query: string): string {
    const normalized = query.trim().replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized ? `"${normalized}"` : '';
}

export function buildSearchRequest(
    channel: ChannelSearchContext,
    participants: UserProfile[],
    currentUserId: string,
    query: string,
    extension: string,
): SearchRequest {
    const qualifier = buildChannelQualifier(channel, participants, currentUserId);
    const literalQuery = quoteLiteralSearch(query);
    const normalizedExtension = validateExtension(extension);
    const terms = [literalQuery, qualifier, normalizedExtension ? `ext:${normalizedExtension}` : ''].
        filter(Boolean).
        join(' ');

    return {
        teamId: channel.type === 'O' || channel.type === 'P' ? channel.team_id : '',
        terms,
    };
}

export function buildChannelQualifier(
    channel: ChannelSearchContext,
    participants: UserProfile[],
    currentUserId: string,
): string {
    if (channel.type === 'O' || channel.type === 'P') {
        return `in:~${channel.name}`;
    }

    const usernames = participants.
        filter((participant) => participant.username).
        sort((left, right) => left.username.localeCompare(right.username)).
        map((participant) => participant.username);

    if (channel.type === 'D') {
        const otherUser = participants.find((participant) => participant.id !== currentUserId);
        if (!otherUser || !otherUser.username) {
            throw new Error(t('searchParticipantsUnavailable'));
        }
        return `in:@${otherUser.username}`;
    }

    if (channel.type === 'G' && usernames.length === participants.length && usernames.length > 0) {
        return `in:@${usernames.join(',')}`;
    }

    throw new Error(t('searchParticipantsUnavailable'));
}

export async function searchConversationFiles(
    request: SearchRequest,
    channelId: string,
    page: number,
): Promise<SearchResult> {
    const response = await Client4.searchFilesWithParams(request.teamId, {
        terms: request.terms,
        is_or_search: false,
        page,
        per_page: nativeSearchPageSize,
    }) as unknown as NativeFileSearchResponse;

    const seen = new Set<string>();
    const items: FileOverviewItem[] = [];
    const order = response.order || [];
    const fileInfos = response.file_infos || {};
    for (const fileID of order) {
        if (seen.has(fileID)) {
            continue;
        }
        const fileInfo = fileInfos instanceof Map ? fileInfos.get(fileID) : fileInfos[fileID];
        if (!fileInfo || fileInfo.channel_id !== channelId) {
            continue;
        }
        seen.add(fileID);
        items.push({
            id: fileInfo.id,
            post_id: fileInfo.post_id || '',
            channel_id: fileInfo.channel_id,
            creator_id: fileInfo.creator_id || fileInfo.user_id || '',
            create_at: fileInfo.create_at,
            name: fileInfo.name,
            extension: fileInfo.extension,
            size: fileInfo.size,
            mime_type: fileInfo.mime_type || '',
            has_preview_image: Boolean(fileInfo.has_preview_image),
        });
    }

    const hasMore = Boolean(response.next_file_info_id);
    return {
        items,
        hasMore,
        limited: !hasMore && order.length >= nativeSearchPageSize,
    };
}

export function isFileSearchUnavailable(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const candidate = error as {statusCode?: number; status_code?: number};
    return candidate.statusCode === 501 || candidate.status_code === 501;
}
