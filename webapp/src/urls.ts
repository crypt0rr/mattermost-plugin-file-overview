import {Client4} from 'mattermost-redux/client';

function configuredBaseURL(): URL {
    const configuredURL = Client4.getUrl();
    return new URL(configuredURL || window.location.origin, window.location.origin);
}

export function absoluteMattermostUrl(pathOrURL: string): string {
    if ((/^[a-z][a-z\d+.-]*:/i).test(pathOrURL)) {
        return pathOrURL;
    }

    const baseURL = configuredBaseURL();
    const basePath = baseURL.pathname.replace(/\/+$/, '');
    const path = pathOrURL.startsWith('/') ? pathOrURL : `/${pathOrURL}`;
    const pathWithBase = basePath && (path === basePath || path.startsWith(`${basePath}/`)) ? path : `${basePath}${path}`;
    return new URL(pathWithBase, baseURL.origin).toString();
}

export function mattermostFileUrl(fileId: string): string {
    return absoluteMattermostUrl(Client4.getFileUrl(fileId, 0));
}

export function mattermostFilePreviewUrl(fileId: string): string {
    return absoluteMattermostUrl(Client4.getFilePreviewUrl(fileId, 0));
}

export function mattermostPostPermalink(postId: string, teamName?: string): string {
    const teamPath = teamName ? `/${encodeURIComponent(teamName)}` : '';
    return absoluteMattermostUrl(`${teamPath}/pl/${encodeURIComponent(postId)}`);
}
