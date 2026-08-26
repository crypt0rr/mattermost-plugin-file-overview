import type {Channel} from '@mattermost/types/channels';

export type FileOverviewItem = {
    id: string;
    post_id: string;
    channel_id: string;
    creator_id: string;
    create_at: number;
    name: string;
    extension: string;
    size: number;
    mime_type: string;
    has_preview_image: boolean;
};

export type ChannelFilesResponse = {
    items: FileOverviewItem[];
    page: number;
    per_page: number;
    has_more: boolean;
};

export type FileSort = 'create_at' | 'size';
export type SortDirection = 'asc' | 'desc';

export type FileOverviewSort = {
    sort: FileSort;
    direction: SortDirection;
};

export type ChannelSearchContext = Pick<Channel, 'id' | 'name' | 'team_id' | 'type'>;

export type NativeFileSearchResponse = {
    order?: string[];
    file_infos?: Record<string, {
        id: string;
        user_id?: string;
        creator_id?: string;
        post_id?: string;
        channel_id?: string;
        create_at: number;
        name: string;
        extension: string;
        size: number;
        mime_type?: string;
        has_preview_image?: boolean;
    }> | Map<string, {
        id: string;
        user_id?: string;
        creator_id?: string;
        post_id?: string;
        channel_id?: string;
        create_at: number;
        name: string;
        extension: string;
        size: number;
        mime_type?: string;
        has_preview_image?: boolean;
    }>;
    next_file_info_id?: string;
};
