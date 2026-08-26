import {Client4} from 'mattermost-redux/client';

import {FileOverviewApiError, getChannelFiles} from './api';

test('requests paginated files through the authenticated plugin URL', async () => {
    jest.spyOn(Client4, 'getUrl').mockReturnValue('https://mattermost.example');
    jest.spyOn(Client4, 'getOptions').mockReturnValue({headers: {'X-Test': 'true'}});
    const response = {
        items: [],
        page: 2,
        per_page: 50,
        has_more: false,
    };
    const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => response,
    } as Response);
    global.fetch = fetchMock as typeof fetch;

    await expect(getChannelFiles('channel with spaces', 2, {sort: 'size', direction: 'asc'})).resolves.toEqual(response);
    expect(Client4.getOptions).toHaveBeenCalledWith({method: 'get'});
    expect(fetchMock).toHaveBeenCalledWith(
        'https://mattermost.example/plugins/com.github.crypt0rr.file-overview/api/v1/channels/channel%20with%20spaces/files?page=2&per_page=50&sort=size&direction=asc',
        expect.objectContaining({headers: {'X-Test': 'true'}}),
    );
});

test('returns a sanitized client error for a failed plugin request', async () => {
    jest.spyOn(Client4, 'getUrl').mockReturnValue('https://mattermost.example');
    jest.spyOn(Client4, 'getOptions').mockReturnValue({headers: {}});
    const fetchMock = jest.fn().mockResolvedValue({ok: false, status: 403} as Response);
    global.fetch = fetchMock as typeof fetch;

    await expect(getChannelFiles('channel-id', 0, {sort: 'create_at', direction: 'desc'})).rejects.toEqual(new FileOverviewApiError('File overview request failed', 403));
});
