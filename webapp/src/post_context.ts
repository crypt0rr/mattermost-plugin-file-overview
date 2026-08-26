import type {Post} from '@mattermost/types/posts';

import {Client4} from 'mattermost-redux/client';

import type {FilePostContext} from './types';

function isAvailablePost(post: Post, channelId: string): boolean {
    return post.channel_id === channelId && post.state !== 'DELETED' && post.delete_at === 0;
}

export async function loadPostContexts(postIds: string[], channelId: string): Promise<Record<string, FilePostContext>> {
    if (postIds.length === 0) {
        return {};
    }

    const posts = await Client4.getPostsByIds(postIds);
    return posts.reduce<Record<string, FilePostContext>>((contexts, post) => {
        if (isAvailablePost(post, channelId)) {
            contexts[post.id] = {
                id: post.id,
                channel_id: post.channel_id,
                user_id: post.user_id,
                create_at: post.create_at,
                message: post.message,
            };
        }
        return contexts;
    }, {});
}
