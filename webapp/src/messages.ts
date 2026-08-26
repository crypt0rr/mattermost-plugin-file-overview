import {localizeMessage} from 'mattermost-redux/utils/i18n_utils';

export const messages = {
    title: 'Files',
    channelFiles: 'Files in this conversation',
    openFiles: 'Open file overview',
    refresh: 'Refresh files',
    search: 'Search',
    clearSearch: 'Clear search',
    filename: 'Filename',
    extension: 'Extension',
    extensionPlaceholder: 'e.g. pdf',
    sort: 'Sort',
    newest: 'Newest first',
    oldest: 'Oldest first',
    largest: 'Largest first',
    smallest: 'Smallest first',
    loading: 'Loading files…',
    staleData: 'Refreshing previously loaded files…',
    loadingMore: 'Loading more…',
    empty: 'No files have been shared in this conversation.',
    noSearchResults: 'No files match your search.',
    retry: 'Retry',
    loadMore: 'Load more',
    uploadedBy: 'Uploaded by',
    open: 'Open file',
    preview: 'Preview file',
    jump: 'Jump to post',
    copyLink: 'Copy link to post',
    copied: 'Copied',
    close: 'Close preview',
    unknownUser: 'Unknown user',
    permissionDenied: 'You no longer have permission to view files in this conversation.',
    extensionInvalid: 'Extension must contain only letters, numbers, plus signs, underscores, or hyphens.',
    searchUnavailable: 'Mattermost file search is disabled or unavailable. Browsing is still available.',
    searchParticipantsUnavailable: 'The conversation participants could not be loaded, so search is unavailable.',
    searchLimit: 'Mattermost returned its configured search limit. Clear the search to browse every file.',
    requestFailed: 'The file overview could not be loaded.',
    previewAlt: 'Preview of {name}',
} as const;

export const translations = Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [`file_overview.${key}`, value]),
);

export type MessageId = keyof typeof messages;

export function t(id: MessageId, values?: Record<string, string>): string {
    let message = localizeMessage({
        id: `file_overview.${id}`,
        defaultMessage: messages[id],
    });
    if (!values) {
        return message;
    }

    for (const [key, value] of Object.entries(values)) {
        message = message.replace(`{${key}}`, value);
    }
    return message;
}
