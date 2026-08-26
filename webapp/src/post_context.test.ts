import type {Post} from '@mattermost/types/posts';

import {Client4} from 'mattermost-redux/client';

import {loadPostContexts} from './post_context';

jest.mock('mattermost-redux/client', () => ({
    Client4: {
        getPostsByIds: jest.fn(),
    },
}));

const getPostsByIdsMock = Client4.getPostsByIds as jest.MockedFunction<typeof Client4.getPostsByIds>;

function post(overrides: Partial<Post> = {}): Post {
    return {
        id: 'post-1',
        channel_id: 'channel-1',
        user_id: 'user-1',
        create_at: 123,
        delete_at: 0,
        state: undefined,
        message: 'A useful message',
        ...overrides,
    } as Post;
}

beforeEach(() => {
    jest.clearAllMocks();
});

test('does not call Mattermost when there are no post IDs', async () => {
    await expect(loadPostContexts([], 'channel-1')).resolves.toEqual({});
    expect(getPostsByIdsMock).not.toHaveBeenCalled();
});

test('keeps only active posts from the requested channel', async () => {
    getPostsByIdsMock.mockResolvedValue([
        post(),
        post({id: 'other-channel-post', channel_id: 'channel-2'}),
        post({id: 'deleted-post', state: 'DELETED'}),
        post({id: 'deleted-at-post', delete_at: 123}),
    ]);

    await expect(loadPostContexts(['post-1', 'other-channel-post', 'deleted-post', 'deleted-at-post'], 'channel-1')).resolves.toEqual({
        'post-1': {
            id: 'post-1',
            channel_id: 'channel-1',
            user_id: 'user-1',
            create_at: 123,
            message: 'A useful message',
        },
    });
    expect(getPostsByIdsMock).toHaveBeenCalledWith(['post-1', 'other-channel-post', 'deleted-post', 'deleted-at-post']);
});
