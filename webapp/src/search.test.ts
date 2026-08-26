import type {ChannelMembership} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import {
    buildChannelQualifier,
    buildSearchRequest,
    isFileSearchUnavailable,
    loadConversationParticipants,
    quoteLiteralSearch,
    searchConversationFiles,
    validateExtension,
} from './search';
import type {ChannelSearchContext} from './types';

const publicChannel: ChannelSearchContext = {
    id: 'channel-id',
    name: 'engineering',
    team_id: 'team-id',
    type: 'O',
};

function profile(id: string, username: string): UserProfile {
    return {id, username} as UserProfile;
}

test('builds team-qualified literal searches for public and private channels', () => {
    expect(buildSearchRequest(publicChannel, [], 'current', 'report "final" in:other', '.PDF')).toEqual({
        teamId: 'team-id',
        terms: '"report final in:other" in:~engineering ext:pdf',
    });
    expect(buildSearchRequest(publicChannel, [], 'current', '', '')).toEqual({
        teamId: 'team-id',
        terms: 'in:~engineering',
    });
    expect(buildChannelQualifier({...publicChannel, type: 'P'}, [], 'current')).toBe('in:~engineering');
    expect(quoteLiteralSearch('  ')).toBe('');
});

test('builds direct-message and group-message qualifiers from participants', () => {
    const current = profile('current', 'me');
    const other = profile('other', 'alice');
    const second = profile('second', 'zoe');

    expect(buildChannelQualifier({id: 'dm', name: '', team_id: '', type: 'D'}, [current, other], 'current')).toBe('in:@alice');
    expect(buildSearchRequest({id: 'gm', name: '', team_id: '', type: 'G'}, [second, current, other], 'current', '', 'doc')).toEqual({
        teamId: '',
        terms: 'in:@alice,me,zoe ext:doc',
    });
    expect(() => buildChannelQualifier({id: 'gm', name: '', team_id: '', type: 'G'}, [current, {...other, username: ''}], 'current')).toThrow();
    expect(() => buildChannelQualifier({id: 'dm', name: '', team_id: '', type: 'D'}, [current], 'current')).toThrow();
    expect(() => buildChannelQualifier({id: 'gm', name: '', team_id: '', type: 'G'}, [], 'current')).toThrow();
});

test('validates extensions before adding the native extension operator', () => {
    expect(validateExtension('')).toBe('');
    expect(validateExtension(' .tar ')).toBe('tar');
    expect(() => validateExtension('pdf?')).toThrow();
    expect(() => buildSearchRequest(publicChannel, [], 'current', '', 'bad.ext')).toThrow();
});

test('loads direct-message participants through Mattermost client APIs', async () => {
    const memberships = [{user_id: 'current'}, {user_id: 'other'}] as ChannelMembership[];
    const membersSpy = jest.spyOn(Client4, 'getChannelMembers').mockResolvedValue(memberships);
    const profilesSpy = jest.spyOn(Client4, 'getProfilesByIds').mockResolvedValue([profile('current', 'me'), profile('other', 'alice')]);

    await expect(loadConversationParticipants('dm')).resolves.toHaveLength(2);
    expect(membersSpy).toHaveBeenCalledWith('dm', 0, 200);
    expect(profilesSpy).toHaveBeenCalledWith(['current', 'other']);
});

test('returns an empty participant list without requesting profiles', async () => {
    const membersSpy = jest.spyOn(Client4, 'getChannelMembers').mockResolvedValue([]);
    const profilesSpy = jest.spyOn(Client4, 'getProfilesByIds');

    await expect(loadConversationParticipants('empty-dm')).resolves.toEqual([]);
    expect(membersSpy).toHaveBeenCalledWith('empty-dm', 0, 200);
    expect(profilesSpy).not.toHaveBeenCalled();
});

test('filters native search results to the active channel and deduplicates file IDs', async () => {
    const file = {
        id: 'file-1',
        user_id: 'u1',
        channel_id: 'channel-id',
        create_at: 100,
        update_at: 100,
        delete_at: 0,
        name: 'one.txt',
        extension: 'txt',
        size: 12,
        mime_type: 'text/plain',
        width: 0,
        height: 0,
        has_preview_image: false,
        archived: false,
    };
    const otherChannelFile = {...file, id: 'file-2', channel_id: 'other-channel'};
    const response = {
        order: ['file-1', 'file-1', 'file-2'],
        file_infos: new Map([
            ['file-1', file],
            ['file-2', otherChannelFile],
        ]),
        next_file_info_id: 'next-file',
        prev_file_info_id: '',
    } as unknown as Awaited<ReturnType<typeof Client4.searchFilesWithParams>>;
    const searchSpy = jest.spyOn(Client4, 'searchFilesWithParams').mockResolvedValue(response);

    await expect(searchConversationFiles({teamId: 'team-id', terms: '"one" in:~engineering'}, 'channel-id', 2)).resolves.toEqual({
        items: [{
            id: 'file-1',
            post_id: '',
            channel_id: 'channel-id',
            creator_id: 'u1',
            create_at: 100,
            name: 'one.txt',
            extension: 'txt',
            size: 12,
            mime_type: 'text/plain',
            has_preview_image: false,
        }],
        hasMore: true,
        limited: false,
    });
    expect(searchSpy).toHaveBeenCalledWith('team-id', {
        terms: '"one" in:~engineering',
        is_or_search: false,
        page: 2,
        per_page: 60,
    });
});

test('recognizes disabled native file search responses', () => {
    expect(isFileSearchUnavailable(null)).toBe(false);
    expect(isFileSearchUnavailable('not-an-error')).toBe(false);
    expect(isFileSearchUnavailable({statusCode: 501})).toBe(true);
    expect(isFileSearchUnavailable({status_code: 501})).toBe(true);
    expect(isFileSearchUnavailable({statusCode: 500})).toBe(false);
});

test('supports object-shaped native results and reports a configured result limit', async () => {
    const objectFile = {
        id: 'object-file',
        user_id: 'u2',
        creator_id: 'creator-2',
        channel_id: 'channel-id',
        create_at: 200,
        update_at: 200,
        delete_at: 0,
        name: 'object.bin',
        extension: 'bin',
        size: 3,
        mime_type: '',
        width: 0,
        height: 0,
        has_preview_image: false,
        archived: false,
    };
    const fallbackFile = {
        ...objectFile,
        id: 'fallback-file',
        creator_id: '',
        user_id: '',
        name: 'fallback.bin',
    };
    const response = {
        order: ['object-file', 'fallback-file', ...Array.from({length: 58}, (_, index) => `missing-${index}`)],
        file_infos: {'object-file': objectFile, 'fallback-file': fallbackFile},
        next_file_info_id: '',
        prev_file_info_id: '',
    } as unknown as Awaited<ReturnType<typeof Client4.searchFilesWithParams>>;
    jest.spyOn(Client4, 'searchFilesWithParams').mockResolvedValue(response);

    await expect(searchConversationFiles({teamId: '', terms: 'in:@alice'}, 'channel-id', 0)).resolves.toEqual({
        items: [{
            id: 'object-file',
            post_id: '',
            channel_id: 'channel-id',
            creator_id: 'creator-2',
            create_at: 200,
            name: 'object.bin',
            extension: 'bin',
            size: 3,
            mime_type: '',
            has_preview_image: false,
        }, {
            id: 'fallback-file',
            post_id: '',
            channel_id: 'channel-id',
            creator_id: '',
            create_at: 200,
            name: 'fallback.bin',
            extension: 'bin',
            size: 3,
            mime_type: '',
            has_preview_image: false,
        }],
        hasMore: false,
        limited: true,
    });

    jest.spyOn(Client4, 'searchFilesWithParams').mockResolvedValue({} as unknown as Awaited<ReturnType<typeof Client4.searchFilesWithParams>>);
    await expect(searchConversationFiles({teamId: '', terms: 'in:@alice'}, 'channel-id', 0)).resolves.toEqual({items: [], hasMore: false, limited: false});
});
