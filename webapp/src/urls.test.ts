/** @jest-environment jsdom */

import {Client4} from 'mattermost-redux/client';

import {absoluteMattermostUrl, mattermostFilePreviewUrl, mattermostFileUrl, mattermostPostPermalink} from './urls';

jest.mock('mattermost-redux/client', () => ({
    Client4: {
        getFileUrl: jest.fn(),
        getFilePreviewUrl: jest.fn(),
        getUrl: jest.fn(),
    },
}));

const mockClient4 = Client4 as unknown as {
    getFileUrl: jest.Mock;
    getFilePreviewUrl: jest.Mock;
    getUrl: jest.Mock;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockClient4.getUrl.mockReturnValue('https://mattermost.example');
    mockClient4.getFileUrl.mockReturnValue('/api/v4/files/file-1');
    mockClient4.getFilePreviewUrl.mockReturnValue('/api/v4/files/file-1/preview');
});

test('builds absolute file and post URLs from the configured server URL', () => {
    expect(mattermostFileUrl('file-1')).toBe('https://mattermost.example/api/v4/files/file-1');
    expect(mattermostFilePreviewUrl('file-1')).toBe('https://mattermost.example/api/v4/files/file-1/preview');
    expect(mattermostPostPermalink('post/1', 'ocd-nl')).toBe('https://mattermost.example/ocd-nl/pl/post%2F1');
    expect(absoluteMattermostUrl('api/v4/health')).toBe('https://mattermost.example/api/v4/health');
});

test('uses the current browser origin when the client URL is empty', () => {
    mockClient4.getUrl.mockReturnValue('');

    expect(mattermostPostPermalink('post-1', 'ocd-nl')).toBe('http://localhost:8065/ocd-nl/pl/post-1');
});

test('preserves a Mattermost base path and already absolute URLs', () => {
    mockClient4.getUrl.mockReturnValue('/mattermost/');
    mockClient4.getFileUrl.mockReturnValue('/mattermost/api/v4/files/file-1');

    expect(absoluteMattermostUrl('/team/channels/general')).toBe('http://localhost:8065/mattermost/team/channels/general');
    expect(absoluteMattermostUrl('https://files.example/file-1')).toBe('https://files.example/file-1');
    expect(mattermostPostPermalink('post-1')).toBe('http://localhost:8065/mattermost/pl/post-1');
    expect(mattermostFileUrl('file-1')).toBe('http://localhost:8065/mattermost/api/v4/files/file-1');
});
