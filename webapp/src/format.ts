import type {UserProfile} from '@mattermost/types/users';

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

export function displayUser(user?: UserProfile, unknownUser = 'Unknown user'): string {
    if (!user) {
        return unknownUser;
    }
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return user.nickname || fullName || user.username || unknownUser;
}

export function fileKind(mimeType: string, extension: string): string {
    if (mimeType.startsWith('image/')) {
        return 'image';
    }
    if (mimeType === 'application/pdf' || extension.toLowerCase() === 'pdf') {
        return 'pdf';
    }
    if (mimeType.startsWith('video/')) {
        return 'video';
    }
    if (mimeType.startsWith('audio/')) {
        return 'audio';
    }
    return 'file';
}
