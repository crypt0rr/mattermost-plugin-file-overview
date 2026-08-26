import type {UserProfile} from '@mattermost/types/users';

import {
    displayUser,
    fileKind,
    filePreviewKind,
    formatFileDate,
    formatFileSize,
} from './format';

test('formats file sizes across byte units', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
});

test('uses a stable uploader fallback and identifies file kinds', () => {
    expect(displayUser()).toBe('Unknown user');
    expect(displayUser({id: 'u1', username: 'user', nickname: 'Display'} as UserProfile)).toBe('Display');
    expect(displayUser({id: 'u1', username: 'user', first_name: 'First', last_name: 'Last'} as UserProfile)).toBe('First Last');
    expect(displayUser({id: 'u1', username: 'user'} as UserProfile)).toBe('user');
    expect(displayUser({id: 'u1'} as UserProfile, 'Missing uploader')).toBe('Missing uploader');
    expect(fileKind('image/png', 'png')).toBe('image');
    expect(fileKind('application/octet-stream', 'pdf')).toBe('pdf');
    expect(fileKind('video/mp4', 'mp4')).toBe('video');
    expect(fileKind('audio/mpeg', 'mp3')).toBe('audio');
    expect(fileKind('application/octet-stream', '.mp4')).toBe('video');
    expect(fileKind('text/plain', 'txt')).toBe('text');
    expect(fileKind('application/octet-stream', 'bin')).toBe('file');
    expect(filePreviewKind('image/png', 'png', true)).toBe('image');
    expect(filePreviewKind('image/png', 'png', false)).toBeUndefined();
    expect(filePreviewKind('application/pdf', 'pdf', false)).toBe('pdf');
    expect(filePreviewKind('video/mp4', 'mp4', false)).toBe('video');
    expect(filePreviewKind('audio/mpeg', 'mp3', false)).toBe('audio');
    expect(filePreviewKind('text/plain', 'txt', false)).toBe('text');
    expect(filePreviewKind('application/octet-stream', 'bin', false)).toBeUndefined();
});

test('formats upload dates as localized date-time strings', () => {
    expect(formatFileDate(Date.UTC(2026, 0, 2, 3, 4))).toEqual(expect.any(String));
});
