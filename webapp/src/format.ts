import type {UserProfile} from '@mattermost/types/users';

export type FileKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'file';
export type FilePreviewKind = Exclude<FileKind, 'file'>;

const videoExtensions = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv']);
const audioExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac']);

export function formatFileSize(size: number): string {
    if (size < 1024) {
        return `${size} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = size / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && value >= 1024; index++) {
        value /= 1024;
        unit = units[index];
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

export function formatFileDate(createAt: number): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(createAt));
}

export function summarizePostMessage(message: string): string {
    const normalizedMessage = message.replace(/\s+/g, ' ').trim();
    const maxLength = 140;
    if (normalizedMessage.length <= maxLength) {
        return normalizedMessage;
    }
    return `${normalizedMessage.slice(0, maxLength - 1).trimEnd()}…`;
}

export function displayUser(user?: UserProfile, unknownUser = 'Unknown user'): string {
    if (!user) {
        return unknownUser;
    }
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return user.nickname || fullName || user.username || unknownUser;
}

export function fileKind(mimeType: string, extension: string): FileKind {
    const normalizedExtension = extension.toLowerCase().replace(/^\./, '');
    if (mimeType.startsWith('image/')) {
        return 'image';
    }
    if (mimeType === 'application/pdf' || normalizedExtension === 'pdf') {
        return 'pdf';
    }
    if (mimeType.startsWith('video/') || videoExtensions.has(normalizedExtension)) {
        return 'video';
    }
    if (mimeType.startsWith('audio/') || audioExtensions.has(normalizedExtension)) {
        return 'audio';
    }
    if (mimeType.startsWith('text/') || normalizedExtension === 'txt') {
        return 'text';
    }
    return 'file';
}

export function filePreviewKind(mimeType: string, extension: string, hasPreviewImage: boolean): FilePreviewKind | undefined {
    const kind = fileKind(mimeType, extension);
    if (kind === 'image') {
        return hasPreviewImage ? kind : undefined;
    }
    if (kind === 'pdf' || kind === 'video' || kind === 'audio' || kind === 'text') {
        return kind;
    }
    return undefined;
}
