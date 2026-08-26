/** @jest-environment jsdom */

import React from 'react';
import {createPortal} from 'react-dom';
import {useSelector} from 'react-redux';
import {act, create} from 'react-test-renderer';
import type {ReactTestInstance, ReactTestRenderer} from 'react-test-renderer';

import type {Channel} from '@mattermost/types/channels';
import type {Post} from '@mattermost/types/posts';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

jest.mock('react-redux', () => ({
    useSelector: jest.fn(),
}));
jest.mock('react-dom', () => ({
    createPortal: jest.fn((children: unknown) => children),
}));

jest.mock('mattermost-redux/client', () => ({
    Client4: {
        getFilePreviewUrl: jest.fn((id: string) => `/preview/${id}`),
        getFileThumbnailUrl: jest.fn((id: string) => `/thumbnail/${id}`),
        getFileUrl: jest.fn((id: string) => `/file/${id}`),
        getPostsByIds: jest.fn(),
        getProfilesByIds: jest.fn(),
        getUrl: jest.fn(() => 'https://mattermost.example'),
    },
}));
jest.mock('mattermost-redux/selectors/entities/channels', () => ({getCurrentChannel: jest.fn()}));
jest.mock('mattermost-redux/selectors/entities/teams', () => ({getCurrentTeam: jest.fn()}));
jest.mock('mattermost-redux/selectors/entities/users', () => ({getCurrentUserId: jest.fn()}));

jest.mock('../api', () => {
    class MockFileOverviewApiError extends Error {
        public readonly status: number;

        constructor(message: string, status: number) {
            super(message);
            this.status = status;
        }
    }

    return {
        FileOverviewApiError: MockFileOverviewApiError,
        getChannelFiles: jest.fn(),
    };
});

jest.mock('../search', () => ({
    buildSearchRequest: jest.fn(() => ({teamId: 'team-id', terms: '"report" in:~engineering'})),
    isFileSearchUnavailable: jest.fn(() => false),
    loadConversationParticipants: jest.fn().mockResolvedValue([]),
    searchConversationFiles: jest.fn(),
    validateExtension: jest.fn((extension: string) => extension.trim().replace(/^\./, '').toLowerCase()),
}));

import FileOverview from './FileOverview';
import FilePreview from './FilePreview';
import FileRow from './FileRow';

import {FileOverviewApiError, getChannelFiles} from '../api';
import {
    buildSearchRequest,
    isFileSearchUnavailable,
    loadConversationParticipants,
    searchConversationFiles,
    validateExtension,
} from '../search';
import type {ChannelFilesResponse, FileOverviewItem} from '../types';

const mockClient4 = Client4 as unknown as {
    getFilePreviewUrl: jest.Mock;
    getFileThumbnailUrl: jest.Mock;
    getFileUrl: jest.Mock;
    getPostsByIds: jest.Mock;
    getProfilesByIds: jest.Mock;
    getUrl: jest.Mock;
};

const getChannelFilesMock = getChannelFiles as jest.MockedFunction<typeof getChannelFiles>;
const buildSearchRequestMock = buildSearchRequest as jest.MockedFunction<typeof buildSearchRequest>;
const isFileSearchUnavailableMock = isFileSearchUnavailable as jest.MockedFunction<typeof isFileSearchUnavailable>;
const loadConversationParticipantsMock = loadConversationParticipants as jest.MockedFunction<typeof loadConversationParticipants>;
const searchConversationFilesMock = searchConversationFiles as jest.MockedFunction<typeof searchConversationFiles>;
const validateExtensionMock = validateExtension as jest.MockedFunction<typeof validateExtension>;
const getCurrentChannelMock = getCurrentChannel as unknown as jest.Mock;
const getCurrentTeamMock = getCurrentTeam as unknown as jest.Mock;

const baseChannel = {
    id: 'channel-id',
    name: 'engineering',
    display_name: 'Engineering',
    team_id: 'team-id',
    type: 'O',
} as Channel;

const alternateChannel = {
    ...baseChannel,
    id: 'alternate-channel-id',
    name: 'alternate',
    display_name: 'Alternate',
} as Channel;

const clipboard = {writeText: jest.fn().mockResolvedValue(undefined)};

function file(overrides: Partial<FileOverviewItem> = {}): FileOverviewItem {
    return {
        id: 'file-1',
        post_id: 'post-1',
        channel_id: baseChannel.id,
        creator_id: 'user-1',
        create_at: Date.UTC(2026, 0, 2, 3, 4),
        name: 'report.png',
        extension: 'png',
        size: 2048,
        mime_type: 'image/png',
        has_preview_image: true,
        ...overrides,
    };
}

function response(items: FileOverviewItem[] = [], overrides: Partial<ChannelFilesResponse> = {}): ChannelFilesResponse {
    return {
        items,
        page: 0,
        per_page: 50,
        has_more: false,
        ...overrides,
    };
}

function post(overrides: Partial<Post> = {}): Post {
    return {
        id: 'post-1',
        channel_id: baseChannel.id,
        user_id: 'user-1',
        create_at: 123,
        delete_at: 0,
        state: undefined,
        message: 'A useful message',
        ...overrides,
    } as Post;
}

function findButton(renderer: ReactTestRenderer, predicate: (button: ReactTestInstance) => boolean): ReactTestInstance {
    return findButtonIn(renderer.root, predicate);
}

function findButtonIn(node: ReactTestInstance, predicate: (button: ReactTestInstance) => boolean): ReactTestInstance {
    const button = node.findAllByType('button').find(predicate);
    if (!button) {
        throw new Error('Expected button was not rendered');
    }
    return button;
}

function nodeText(node: ReactTestInstance): string {
    return node.children.map((child) => (typeof child === 'string' ? child : nodeText(child))).join('');
}

function buttonText(button: ReactTestInstance): string {
    return nodeText(button);
}

async function renderOverview(channel: Channel = baseChannel, team?: Team): Promise<ReactTestRenderer> {
    let renderer!: ReactTestRenderer;
    await act(async () => {
        renderer = create(
            <FileOverview
                channel={channel}
                team={team}
            />,
        );
        await Promise.resolve();
    });
    return renderer;
}

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentChannelMock.mockReturnValue(undefined);
    getCurrentTeamMock.mockReturnValue(undefined);
    (useSelector as unknown as jest.Mock).mockImplementation((selector: unknown) => {
        if (selector === getCurrentChannel) {
            return getCurrentChannelMock();
        }
        if (selector === getCurrentTeam) {
            return getCurrentTeamMock();
        }
        if (selector === getCurrentUserId) {
            return 'current-user';
        }
        return undefined;
    });
    getChannelFilesMock.mockResolvedValue(response());
    isFileSearchUnavailableMock.mockReturnValue(false);
    mockClient4.getPostsByIds.mockResolvedValue([]);
    mockClient4.getProfilesByIds.mockResolvedValue([{id: 'user-1', username: 'alice'}]);
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: clipboard});
    document.execCommand = jest.fn().mockReturnValue(true);
});

test('renders metadata, image previews, copy links, stale refreshes, and load more', async () => {
    const image = file();
    const documentFile = file({
        id: 'file-2',
        post_id: '',
        create_at: Date.UTC(2026, 0, 3, 3, 4),
        name: 'notes.pdf',
        extension: 'pdf',
        mime_type: 'application/pdf',
        has_preview_image: false,
    });
    getChannelFilesMock.mockResolvedValueOnce(response([image, documentFile], {has_more: true}));
    mockClient4.getProfilesByIds.mockRejectedValueOnce(new Error('profile unavailable'));
    const renderer = await renderOverview(baseChannel, {name: 'engineering'} as Team);

    expect(renderer.root.findAllByType('article')).toHaveLength(2);
    expect(renderer.root.findByProps({className: 'file-overview__body'}).findByProps({className: 'file-overview__list'})).toBeDefined();
    expect(renderer.root.findAllByType('a')[0].props.href).toBe('https://mattermost.example/file/file-2');
    expect(renderer.root.findAllByProps({className: 'file-overview__action-link'})).toHaveLength(0);
    expect(renderer.root.findByProps({className: 'file-overview__list'}).props['aria-label']).toBe('Files in this conversation');
    expect(renderer.root.findAllByType('div').filter((node) => String(node.props.className).includes('file-overview__thumbnail--pdf'))).toHaveLength(1);

    const imageNameLink = renderer.root.findAllByProps({className: 'file-overview__name'}).find((link) => link.props.href === 'https://mattermost.example/file/file-1');
    if (!imageNameLink) {
        throw new Error('Expected the image filename link to be rendered');
    }
    const preventImageNavigation = jest.fn();
    await act(async () => {
        imageNameLink.props.onClick({preventDefault: preventImageNavigation});
        await Promise.resolve();
    });
    expect(preventImageNavigation).toHaveBeenCalled();
    expect(renderer.root.findAllByProps({role: 'dialog'})).toHaveLength(1);
    await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await Promise.resolve();
    });
    const documentNameLink = renderer.root.findAllByProps({className: 'file-overview__name'}).find((link) => link.props.href === 'https://mattermost.example/file/file-2');
    if (!documentNameLink) {
        throw new Error('Expected the document filename link to be rendered');
    }
    const preventDocumentNavigation = jest.fn();
    await act(async () => {
        documentNameLink.props.onClick({preventDefault: preventDocumentNavigation});
        await Promise.resolve();
    });
    expect(preventDocumentNavigation).toHaveBeenCalled();
    expect(renderer.root.findByType('iframe').props).toMatchObject({
        src: 'https://mattermost.example/file/file-2',
        title: 'Preview of notes.pdf',
    });
    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Close preview').props.onClick();
        await Promise.resolve();
    });
    const noPostRow = renderer.root.findAllByType(FileRow).find((row) => !row.props.file.post_id);
    if (!noPostRow) {
        throw new Error('Expected a file row without a containing post');
    }
    await act(async () => {
        await noPostRow.props.onCopy(documentFile);
    });
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType('button').filter((button) => buttonText(button) === 'Copy link to post')).toHaveLength(1);

    const copyButton = findButton(renderer, (button) => buttonText(button).includes('Copy link to post'));
    mockClient4.getUrl.mockReturnValueOnce('');
    await act(async () => {
        copyButton.props.onClick();
        await Promise.resolve();
    });
    expect(clipboard.writeText).toHaveBeenCalledWith('http://localhost:8065/engineering/pl/post-1');
    expect(renderer.root.findAllByType('button').some((button) => buttonText(button) === 'Copied')).toBe(true);

    const imageRow = renderer.root.findAllByType(FileRow).find((row) => row.props.file.id === image.id);
    if (!imageRow) {
        throw new Error('Expected the image row to be rendered');
    }
    const previewButton = findButtonIn(imageRow, (button) => button.props['aria-label'] === 'Preview file');
    await act(async () => {
        previewButton.props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({role: 'dialog'})).toHaveLength(1);
    expect(mockClient4.getFilePreviewUrl).toHaveBeenCalledWith('file-1', 0);
    expect(createPortal).toHaveBeenCalledWith(expect.anything(), document.body);

    await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({role: 'dialog'})).toHaveLength(0);

    const actionPreview = findButtonIn(imageRow, (button) => buttonText(button) === 'Preview file');
    await act(async () => {
        actionPreview.props.onClick();
        await Promise.resolve();
    });
    const closePreviewButton = findButton(renderer, (button) => button.props['aria-label'] === 'Close preview');
    await act(async () => {
        closePreviewButton.props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({role: 'dialog'})).toHaveLength(0);

    await act(async () => {
        actionPreview.props.onClick();
        await Promise.resolve();
    });
    const backdrop = renderer.root.findByProps({role: 'presentation'});
    backdrop.props.onMouseDown({target: {}, currentTarget: {}});
    await act(async () => {
        backdrop.props.onMouseDown({target: backdrop, currentTarget: backdrop});
        await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({role: 'dialog'})).toHaveLength(0);

    findButton(renderer, (button) => buttonText(button) === 'Jump to post').props.onClick();
    const originalLocation = window.location;
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {configurable: true, value: {assign}});
    renderer.root.findAllByType(FileRow)[0].props.onJump(image);
    expect(assign).toHaveBeenCalledWith('https://mattermost.example/engineering/pl/post-1');
    Object.defineProperty(window, 'location', {configurable: true, value: originalLocation});

    let resolveRefresh!: (value: ChannelFilesResponse) => void;
    getChannelFilesMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve;
    }));
    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Refresh files').props.onClick();
    });
    expect(renderer.root.findAllByProps({className: 'file-overview__stale'})).toHaveLength(1);
    await act(async () => {
        resolveRefresh(response([image], {has_more: true}));
        await Promise.resolve();
    });

    getChannelFilesMock.mockResolvedValueOnce(response([file({id: 'file-3', name: 'more.txt', mime_type: 'text/plain', extension: 'txt', create_at: Date.UTC(2026, 0, 4)})], {page: 1}));
    await act(async () => {
        findButton(renderer, (button) => button.props.className === 'file-overview__load-more').props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByType('article')).toHaveLength(2);

    const textLink = renderer.root.findAllByProps({className: 'file-overview__name'}).find((link) => link.props.href === 'https://mattermost.example/file/file-3');
    if (!textLink) {
        throw new Error('Expected the text filename link to be rendered');
    }
    const preventTextNavigation = jest.fn();
    await act(async () => {
        textLink.props.onClick({preventDefault: preventTextNavigation});
        await Promise.resolve();
    });
    expect(preventTextNavigation).toHaveBeenCalled();
    expect(renderer.root.findByType('iframe').props).toMatchObject({
        src: 'https://mattermost.example/file/file-3',
        sandbox: '',
    });
    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Close preview').props.onClick();
        await Promise.resolve();
    });

    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined});
    await act(async () => {
        findButton(renderer, (button) => buttonText(button).includes('Copy link to post')).props.onClick();
        await Promise.resolve();
    });
    expect(document.execCommand).toHaveBeenCalledWith('copy');

    await act(async () => {
        renderer.root.findByProps({id: 'file-overview-sort'}).props.onChange({target: {value: 'create_at:asc'}});
        await Promise.resolve();
    });
    expect(getChannelFilesMock).toHaveBeenCalledWith(baseChannel.id, 0, {sort: 'create_at', direction: 'asc'}, expect.anything());
});

test('shows message context and groups adjacent attachments from the same post', async () => {
    const firstAttachment = file({
        id: 'shared-a',
        post_id: 'shared-post',
        create_at: 3000,
        name: 'checklist.png',
    });
    const secondAttachment = file({
        id: 'shared-b',
        post_id: 'shared-post',
        create_at: 3000,
        name: 'checklist.txt',
        extension: 'txt',
        mime_type: 'text/plain',
        has_preview_image: false,
    });
    const separateAttachment = file({
        id: 'separate-file',
        post_id: 'separate-post',
        create_at: 2000,
        name: 'notes.bin',
        extension: 'bin',
        mime_type: 'application/octet-stream',
        has_preview_image: false,
    });
    getChannelFilesMock.mockResolvedValueOnce(response([firstAttachment, secondAttachment, separateAttachment]));
    mockClient4.getPostsByIds.mockResolvedValueOnce([
        post({
            id: 'shared-post',
            user_id: 'missing-post-author',
            create_at: 3000,
            message: '  Please review the final deployment checklist.  ',
        }),
        post({
            id: 'separate-post',
            user_id: 'user-1',
            create_at: 2000,
            message: '',
        }),
    ]);
    const renderer = await renderOverview();
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });

    expect(mockClient4.getPostsByIds).toHaveBeenCalledWith(['shared-post', 'separate-post']);
    expect(renderer.root.findAllByProps({className: 'file-overview__post-context'})).toHaveLength(2);
    expect(nodeText(renderer.root.findAllByProps({className: 'file-overview__post-context'})[0])).toContain('Please review the final deployment checklist.');
    expect(nodeText(renderer.root.findAllByProps({className: 'file-overview__post-context'})[0])).toContain('2 files in this message');
    expect(nodeText(renderer.root.findAllByProps({className: 'file-overview__post-context'})[1])).toContain('No message text');
    expect(nodeText(renderer.root.findAllByProps({className: 'file-overview__post-context'})[0])).toContain('Unknown user');
    expect(renderer.root.findAllByProps({className: 'file-overview__row file-overview__row--same-post'})).toHaveLength(1);
    expect(renderer.root.findAllByProps({className: 'file-overview__post-context-message'})).toHaveLength(2);
    expect(renderer.root.findAllByProps({className: 'file-overview__post-context-message'})[0].props['aria-label']).toContain('Jump to message');
    const originalLocation = window.location;
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {configurable: true, value: {assign}});
    renderer.root.findAllByProps({className: 'file-overview__post-context-message'})[0].props.onClick();
    expect(assign).toHaveBeenCalledWith('https://mattermost.example/pl/shared-post');
    Object.defineProperty(window, 'location', {configurable: true, value: originalLocation});
    renderer.unmount();
});

test('shows loading and unavailable states when message context cannot be resolved', async () => {
    let resolvePosts!: (posts: Post[]) => void;
    mockClient4.getPostsByIds.mockReturnValueOnce(new Promise((resolve) => {
        resolvePosts = resolve;
    }));
    getChannelFilesMock.mockResolvedValueOnce(response([file({post_id: 'pending-post'})]));
    const renderer = await renderOverview();
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(nodeText(renderer.root.findByProps({className: 'file-overview__post-context'}))).toContain('Loading message context');

    await act(async () => {
        resolvePosts([]);
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(nodeText(renderer.root.findByProps({className: 'file-overview__post-context'}))).toContain('Message context unavailable');
    renderer.unmount();

    mockClient4.getPostsByIds.mockRejectedValueOnce(new Error('post lookup failed'));
    getChannelFilesMock.mockResolvedValueOnce(response([file({id: 'rejected-context', post_id: 'rejected-post'})]));
    const rejectedRenderer = await renderOverview();
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(nodeText(rejectedRenderer.root.findByProps({className: 'file-overview__post-context'}))).toContain('Message context unavailable');
    rejectedRenderer.unmount();
});

test('ignores message context responses from a previous channel', async () => {
    let resolveOldContext!: (posts: Post[]) => void;
    let rejectAlternateContext!: (reason: unknown) => void;
    mockClient4.getPostsByIds.mockReturnValueOnce(new Promise((resolve) => {
        resolveOldContext = resolve;
    }));
    mockClient4.getPostsByIds.mockReturnValueOnce(new Promise((_, reject) => {
        rejectAlternateContext = reject;
    }));
    getChannelFilesMock.mockResolvedValueOnce(response([file({post_id: 'old-channel-post'})]));
    getChannelFilesMock.mockResolvedValueOnce(response([file({id: 'alternate-file', post_id: 'alternate-post', channel_id: alternateChannel.id})]));
    getChannelFilesMock.mockResolvedValueOnce(response());
    const renderer = await renderOverview();
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

    await act(async () => {
        renderer.update(<FileOverview channel={alternateChannel}/>);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    expect(mockClient4.getPostsByIds).toHaveBeenCalledTimes(2);

    await act(async () => {
        resolveOldContext([post({id: 'old-channel-post'})]);
        await Promise.resolve();
    });
    expect(nodeText(renderer.root.findByProps({className: 'file-overview__post-context'}))).toContain('Loading message context');

    await act(async () => {
        renderer.update(<FileOverview channel={baseChannel}/>);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    await act(async () => {
        rejectAlternateContext(new Error('stale post lookup failed'));
        await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({className: 'file-overview__post-context'})).toHaveLength(0);
    renderer.unmount();
});

test('shows initial loading, error, permission, and retry states', async () => {
    let resolveRequest!: (value: ChannelFilesResponse) => void;
    getChannelFilesMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveRequest = resolve;
    }));
    const renderer = await renderOverview();
    expect(renderer.root.findByProps({role: 'status'}).children.join('')).toContain('Loading files');
    await act(async () => {
        resolveRequest(response([file()]));
        await Promise.resolve();
    });
    renderer.unmount();

    getChannelFilesMock.mockRejectedValueOnce(new Error('network failure')).mockResolvedValueOnce(response([file()]));
    const errorRenderer = await renderOverview();
    expect(nodeText(errorRenderer.root.findByProps({role: 'alert'}))).toContain('network failure');
    await act(async () => {
        findButton(errorRenderer, (button) => buttonText(button) === 'Retry').props.onClick();
        await Promise.resolve();
    });
    expect(errorRenderer.root.findAllByType('article')).toHaveLength(1);
    errorRenderer.unmount();

    getChannelFilesMock.mockRejectedValueOnce(new FileOverviewApiError('forbidden', 403));
    const permissionRenderer = await renderOverview();
    expect(nodeText(permissionRenderer.root.findByProps({role: 'alert'}))).toContain('no longer have permission');
    permissionRenderer.unmount();

    getChannelFilesMock.mockRejectedValueOnce({unexpected: true});
    const genericRenderer = await renderOverview();
    expect(nodeText(genericRenderer.root.findByProps({role: 'alert'}))).toContain('could not be loaded');
    genericRenderer.unmount();
});

test('previews video and audio files without navigating away', async () => {
    const video = file({
        id: 'video-1',
        name: 'clip.mp4',
        extension: 'mp4',
        mime_type: 'video/mp4',
        has_preview_image: false,
        create_at: Date.UTC(2026, 1, 2, 3, 4),
    });
    const audio = file({
        id: 'audio-1',
        name: 'recording.mp3',
        extension: 'mp3',
        mime_type: 'audio/mpeg',
        has_preview_image: false,
        create_at: Date.UTC(2026, 0, 2, 3, 4),
    });
    getChannelFilesMock.mockResolvedValueOnce(response([video, audio]));
    const renderer = await renderOverview();

    const videoLink = renderer.root.findAllByProps({className: 'file-overview__name'}).find((link) => link.props.href === 'https://mattermost.example/file/video-1');
    if (!videoLink) {
        throw new Error('Expected the video filename link to be rendered');
    }
    const preventVideoNavigation = jest.fn();
    await act(async () => {
        videoLink.props.onClick({preventDefault: preventVideoNavigation});
        await Promise.resolve();
    });
    expect(preventVideoNavigation).toHaveBeenCalled();
    expect(renderer.root.findByType('video').props).toMatchObject({
        src: 'https://mattermost.example/file/video-1',
        controls: true,
        playsInline: true,
        preload: 'metadata',
    });
    expect(renderer.root.findAllByProps({role: 'dialog'})).toHaveLength(1);

    expect(findButton(renderer, (button) => buttonText(button) === 'Previous file').props.disabled).toBe(true);
    expect(findButton(renderer, (button) => buttonText(button) === 'Next file').props.disabled).toBe(false);
    await act(async () => {
        findButton(renderer, (button) => buttonText(button) === 'Previous file').props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByType('video')).toHaveLength(1);
    const mediaControlEvent = new Event('keydown') as KeyboardEvent;
    Object.defineProperty(mediaControlEvent, 'key', {value: 'ArrowRight'});
    Object.defineProperty(mediaControlEvent, 'target', {value: {tagName: 'VIDEO'}});
    document.dispatchEvent(mediaControlEvent);
    expect(renderer.root.findAllByType('video')).toHaveLength(1);

    await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'}));
        await Promise.resolve();
    });
    expect(renderer.root.findByType('audio').props.src).toBe('https://mattermost.example/file/audio-1');
    expect(findButton(renderer, (button) => buttonText(button) === 'Previous file').props.disabled).toBe(false);
    expect(findButton(renderer, (button) => buttonText(button) === 'Next file').props.disabled).toBe(true);
    await act(async () => {
        findButton(renderer, (button) => buttonText(button) === 'Next file').props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByType('audio')).toHaveLength(1);
    await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft'}));
        await Promise.resolve();
    });
    expect(renderer.root.findAllByType('video')).toHaveLength(1);

    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Close preview').props.onClick();
        await Promise.resolve();
    });

    const audioLink = renderer.root.findAllByProps({className: 'file-overview__name'}).find((link) => link.props.href === 'https://mattermost.example/file/audio-1');
    if (!audioLink) {
        throw new Error('Expected the audio filename link to be rendered');
    }
    const preventAudioNavigation = jest.fn();
    await act(async () => {
        audioLink.props.onClick({preventDefault: preventAudioNavigation});
        await Promise.resolve();
    });
    expect(preventAudioNavigation).toHaveBeenCalled();
    expect(renderer.root.findByType('audio').props).toMatchObject({
        src: 'https://mattermost.example/file/audio-1',
        controls: true,
        preload: 'metadata',
    });
    renderer.unmount();
});

test('keeps unsupported files in the viewer with an explicit open fallback', () => {
    const unsupported = file({
        id: 'archive-1',
        name: 'archive.zip',
        extension: 'zip',
        mime_type: 'application/zip',
        has_preview_image: false,
    });
    const renderer = create(
        <FilePreview
            file={unsupported}
            position={1}
            total={1}
            hasPrevious={false}
            hasNext={false}
            onPrevious={jest.fn()}
            onNext={jest.fn()}
            onClose={jest.fn()}
        />,
    );

    const fallback = renderer.root.findByProps({className: 'file-overview__preview-fallback'});
    expect(nodeText(fallback)).toContain('cannot be previewed');
    expect(fallback.findByType('a').props).toMatchObject({
        href: 'https://mattermost.example/file/archive-1',
    });
    renderer.unmount();
});

test('submits native search, handles disabled search, clears it, and changes sorting', async () => {
    getChannelFilesMock.mockResolvedValueOnce(response());
    searchConversationFilesMock.mockResolvedValueOnce({items: [file({name: 'report.pdf', extension: 'pdf'})], hasMore: false, limited: true});
    const renderer = await renderOverview();

    await act(async () => {
        renderer.root.findByProps({id: 'file-overview-query'}).props.onChange({target: {value: 'report'}});
        renderer.root.findByProps({id: 'file-overview-extension'}).props.onChange({target: {value: '.PDF'}});
    });
    await act(async () => {
        renderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
        await Promise.resolve();
    });
    expect(validateExtensionMock).toHaveBeenCalledWith('.PDF');
    expect(buildSearchRequestMock).toHaveBeenCalled();
    expect(searchConversationFilesMock).toHaveBeenCalledWith(expect.anything(), baseChannel.id, 0);
    expect(renderer.root.findByProps({className: 'file-overview__notice'}).children.join('')).toContain('configured search limit');

    await act(async () => {
        renderer.root.findByProps({className: 'file-overview__clear-search'}).props.onClick();
        await Promise.resolve();
    });
    expect(getChannelFilesMock).toHaveBeenCalled();

    await act(async () => {
        renderer.root.findByProps({id: 'file-overview-sort'}).props.onChange({target: {value: 'size:asc'}});
        await Promise.resolve();
    });
    expect(getChannelFilesMock).toHaveBeenCalledWith(baseChannel.id, 0, {sort: 'size', direction: 'asc'}, expect.anything());
    renderer.unmount();

    getChannelFilesMock.mockResolvedValueOnce(response());
    searchConversationFilesMock.mockRejectedValueOnce({statusCode: 501});
    isFileSearchUnavailableMock.mockReturnValue(true);
    const unavailableRenderer = await renderOverview();
    await act(async () => {
        unavailableRenderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
        await Promise.resolve();
    });
    expect(nodeText(unavailableRenderer.root.findByProps({role: 'alert'}))).toContain('file search is disabled');
    unavailableRenderer.unmount();
});

test('refreshes, sorts, retries, and paginates an active native search', async () => {
    getChannelFilesMock.mockResolvedValueOnce(response());
    searchConversationFilesMock.
        mockResolvedValueOnce({items: [file()], hasMore: true, limited: false}).
        mockResolvedValueOnce({items: [file({id: 'refresh-file'})], hasMore: true, limited: false}).
        mockResolvedValueOnce({items: [file({id: 'sort-file'})], hasMore: true, limited: false}).
        mockResolvedValueOnce({items: [file({id: 'page-file'})], hasMore: false, limited: false}).
        mockRejectedValueOnce(new Error('search failed')).
        mockResolvedValueOnce({items: [file({id: 'retry-file'})], hasMore: false, limited: false}).
        mockRejectedValueOnce(Object.create(null));
    const renderer = await renderOverview();

    await act(async () => {
        renderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
        await Promise.resolve();
    });
    expect(renderer.root.findAllByType('article')).toHaveLength(1);

    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Refresh files').props.onClick();
        await Promise.resolve();
    });
    await act(async () => {
        renderer.root.findByProps({id: 'file-overview-sort'}).props.onChange({target: {value: 'size:desc'}});
        await Promise.resolve();
    });
    await act(async () => {
        findButton(renderer, (button) => button.props.className === 'file-overview__load-more').props.onClick();
        await Promise.resolve();
    });

    await act(async () => {
        window.dispatchEvent(new Event('com.github.crypt0rr.file-overview:refresh'));
        await Promise.resolve();
    });
    expect(nodeText(renderer.root.findByProps({role: 'alert'}))).toContain('search failed');
    await act(async () => {
        findButton(renderer, (button) => buttonText(button) === 'Retry').props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByType('article')).toHaveLength(1);
    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Refresh files').props.onClick();
        await Promise.resolve();
    });
    expect(nodeText(renderer.root.findByProps({role: 'alert'}))).toContain('file search is disabled');
    renderer.unmount();
});

test('handles unavailable DM participants and invalid submit errors', async () => {
    loadConversationParticipantsMock.mockRejectedValueOnce(new Error('members unavailable'));
    getChannelFilesMock.mockResolvedValueOnce(response());
    const dmChannel = {...baseChannel, id: 'dm-channel-id', type: 'D'} as Channel;
    const renderer = await renderOverview(dmChannel);
    expect(nodeText(renderer.root.findByProps({className: 'file-overview__notice'}))).toContain('participants');
    await act(async () => {
        renderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
        await Promise.resolve();
    });
    expect(searchConversationFilesMock).not.toHaveBeenCalled();
    renderer.unmount();

    validateExtensionMock.mockImplementationOnce(() => {
        throw Object.create(null);
    });
    const invalidRenderer = await renderOverview();
    await act(async () => {
        invalidRenderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
        await Promise.resolve();
    });
    expect(nodeText(invalidRenderer.root.findByProps({role: 'alert'}))).toContain('file search is disabled');
    invalidRenderer.unmount();
});

test('loads DM participants and ignores stale search success and error responses', async () => {
    loadConversationParticipantsMock.mockResolvedValueOnce([{id: 'other', username: 'alice'} as UserProfile]);
    getChannelFilesMock.mockResolvedValueOnce(response());
    const dmChannel = {...baseChannel, id: 'dm-success-channel-id', type: 'D'} as Channel;
    const dmRenderer = await renderOverview(dmChannel);
    expect(findButton(dmRenderer, (button) => button.props.type === 'submit').props.disabled).toBe(false);
    dmRenderer.unmount();

    let resolveSearch!: (value: {items: FileOverviewItem[]; hasMore: boolean; limited: boolean}) => void;
    getChannelFilesMock.mockResolvedValueOnce(response());
    searchConversationFilesMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveSearch = resolve;
    }));
    const successRenderer = await renderOverview();
    await act(async () => {
        successRenderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
    });
    getChannelFilesMock.mockResolvedValueOnce(response([file({id: 'browse-after-clear'})]));
    await act(async () => {
        successRenderer.root.findByProps({className: 'file-overview__clear-search'}).props.onClick();
        await Promise.resolve();
    });
    resolveSearch({items: [file({id: 'stale-search'})], hasMore: false, limited: false});
    await act(async () => {
        await Promise.resolve();
    });
    expect(successRenderer.root.findAllByType('a')[0].children.join('')).toBe('report.png');
    expect(successRenderer.root.findAllByType('a').some((link) => link.children.join('') === 'stale-search')).toBe(false);
    successRenderer.unmount();

    let rejectSearch!: (reason: unknown) => void;
    searchConversationFilesMock.mockReturnValueOnce(new Promise((_, reject) => {
        rejectSearch = reject;
    }));
    const errorRenderer = await renderOverview();
    await act(async () => {
        errorRenderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
    });
    getChannelFilesMock.mockResolvedValueOnce(response());
    await act(async () => {
        errorRenderer.root.findByProps({className: 'file-overview__clear-search'}).props.onClick();
        await Promise.resolve();
    });
    rejectSearch(new Error('stale search error'));
    await act(async () => {
        await Promise.resolve();
    });
    expect(errorRenderer.root.findAllByProps({role: 'alert'})).toHaveLength(0);
    errorRenderer.unmount();
});

test('ignores aborted browse requests and supports jumping without a team prefix', async () => {
    getChannelFilesMock.mockResolvedValueOnce(response([file()]));
    const renderer = await renderOverview();
    getChannelFilesMock.mockRejectedValueOnce(Object.assign(new Error('request aborted'), {name: 'AbortError'}));

    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Refresh files').props.onClick();
        await Promise.resolve();
    });
    expect(renderer.root.findAllByProps({role: 'alert'})).toHaveLength(0);

    const originalLocation = window.location;
    const assign = jest.fn();
    Object.defineProperty(window, 'location', {configurable: true, value: {assign}});
    renderer.root.findAllByType(FileRow)[0].props.onJump(file());
    expect(assign).toHaveBeenCalledWith('https://mattermost.example/pl/post-1');
    Object.defineProperty(window, 'location', {configurable: true, value: originalLocation});
    renderer.unmount();
});

test('does not update state when direct-message participants resolve after unmount', async () => {
    let resolveParticipants!: (value: UserProfile[]) => void;
    loadConversationParticipantsMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveParticipants = resolve;
    }));
    const dmChannel = {...baseChannel, id: 'dm-resolve-after-unmount', type: 'D'} as Channel;
    const renderer = await renderOverview(dmChannel);
    await act(async () => {
        renderer.unmount();
    });

    await act(async () => {
        resolveParticipants([]);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
});

test('does not update state when direct-message participants reject after unmount', async () => {
    let rejectParticipants!: (reason: unknown) => void;
    loadConversationParticipantsMock.mockReturnValueOnce(new Promise((_, reject) => {
        rejectParticipants = reject;
    }));
    const dmChannel = {...baseChannel, id: 'dm-reject-after-unmount', type: 'D'} as Channel;
    const renderer = await renderOverview(dmChannel);
    await act(async () => {
        renderer.unmount();
    });

    await act(async () => {
        rejectParticipants(new Error('participants unavailable'));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
});

test('handles a component without an active channel', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
        renderer = create(<FileOverview/>);
        await Promise.resolve();
    });
    await act(async () => {
        findButton(renderer, (button) => button.props['aria-label'] === 'Refresh files').props.onClick();
        renderer.root.findByType('form').props.onSubmit({preventDefault: jest.fn()});
        await Promise.resolve();
    });
    expect(nodeText(renderer.root.findByProps({role: 'alert'}))).toContain('file search is disabled');
    expect(getChannelFilesMock).not.toHaveBeenCalled();
    renderer.unmount();
});

test('resolves the active channel and team from Redux when the RHS supplies no props', async () => {
    getCurrentChannelMock.mockReturnValue(baseChannel);
    getCurrentTeamMock.mockReturnValue({name: 'engineering'} as Team);
    getChannelFilesMock.mockResolvedValueOnce(response([file()]));

    let renderer!: ReactTestRenderer;
    await act(async () => {
        renderer = create(<FileOverview/>);
        await Promise.resolve();
    });

    expect(getChannelFilesMock).toHaveBeenCalledWith(baseChannel.id, 0, {sort: 'create_at', direction: 'desc'}, expect.anything());
    expect(renderer.root.findAllByType('p').some((paragraph) => nodeText(paragraph) === 'Engineering')).toBe(true);
    renderer.unmount();
});

test('handles a rejected copy action in a file row', async () => {
    const onCopy = jest.fn().mockRejectedValue(new Error('clipboard failed'));
    const renderer = create(
        <FileRow
            file={file({has_preview_image: false})}
            onPreview={jest.fn()}
            onJump={jest.fn()}
            onCopy={onCopy}
        />,
    );
    await act(async () => {
        findButton(renderer, (button) => buttonText(button) === 'Copy link to post').props.onClick();
        await Promise.resolve();
    });
    expect(onCopy).toHaveBeenCalled();
    expect(renderer.root.findAllByType('button').some((button) => buttonText(button) === 'Copied')).toBe(false);
    renderer.unmount();
});

test('resets the copied state after the feedback timeout', async () => {
    jest.useFakeTimers();
    try {
        const renderer = create(
            <FileRow
                file={file({has_preview_image: false})}
                onPreview={jest.fn()}
                onJump={jest.fn()}
                onCopy={jest.fn().mockResolvedValue(undefined)}
            />,
        );
        await act(async () => {
            const nameLink = renderer.root.findByProps({className: 'file-overview__name'});
            const preventNavigation = jest.fn();
            nameLink.props.onClick({preventDefault: preventNavigation});
            expect(preventNavigation).not.toHaveBeenCalled();
            findButton(renderer, (button) => buttonText(button).includes('Copy link to post')).props.onClick();
            await Promise.resolve();
        });
        expect(renderer.root.findAllByType('button').some((button) => buttonText(button) === 'Copied')).toBe(true);

        act(() => {
            jest.runOnlyPendingTimers();
        });
        expect(renderer.root.findAllByType('button').some((button) => buttonText(button) === 'Copy link to post')).toBe(true);
        renderer.unmount();
    } finally {
        jest.useRealTimers();
    }
});

test('ignores an out-of-order response after the channel changes', async () => {
    let resolveFirst!: (value: ChannelFilesResponse) => void;
    getChannelFilesMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
    })).mockResolvedValueOnce(response([file({id: 'alternate-file', channel_id: alternateChannel.id, name: 'alternate.txt'})]));

    let renderer!: ReactTestRenderer;
    await act(async () => {
        renderer = create(<FileOverview channel={baseChannel}/>);
    });
    await act(async () => {
        renderer.update(<FileOverview channel={alternateChannel}/>);
        await Promise.resolve();
    });
    await act(async () => {
        resolveFirst(response([file({id: 'stale-file', name: 'stale.txt'})]));
        await Promise.resolve();
    });

    expect(renderer.root.findAllByType('article')).toHaveLength(1);
    expect(renderer.root.findAllByType('a')[0].children.join('')).toBe('alternate.txt');
    renderer.unmount();
});
