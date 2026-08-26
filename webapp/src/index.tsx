import manifest from 'manifest';
import React from 'react';
import type {Store} from 'redux';

import type {WebSocketMessage} from '@mattermost/client';
import type {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';

import type {PluginRegistry} from 'types/mattermost-webapp';

import FileOverview from './components/FileOverview';
import {t, translations} from './messages';

const refreshEventName = `${manifest.id}:refresh`;

function eventChannelID(message: WebSocketMessage<{channel_id?: string; post?: string}>): string {
    if (message.data?.channel_id) {
        return message.data.channel_id;
    }
    if (!message.data?.post) {
        return '';
    }
    try {
        const post = JSON.parse(message.data.post) as {channel_id?: string};
        return post.channel_id || '';
    } catch {
        return '';
    }
}

function FileIcon() {
    return (
        <svg
            className='file-overview__channel-header-icon'
            viewBox='0 0 24 24'
            aria-hidden='true'
            focusable='false'
        >
            <path d='M6.75 2.75h7.4l5.1 5.05v13.45H6.75V2.75Z'/>
            <path d='M14 2.75v5h5.25'/>
            <path d='M9.5 12h7M9.5 15.5h7M9.5 19H14'/>
        </svg>
    );
}

export class Plugin {
    public initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        registry.registerTranslations((locale) => (locale === 'en' ? translations : {}));

        const {toggleRHSPlugin} = registry.registerRightHandSidebarComponent(
            FileOverview,
            t('title'),
        );

        registry.registerChannelHeaderButtonAction(
            <FileIcon/>,
            () => store.dispatch(toggleRHSPlugin),
            t('channelFiles'),
            t('openFiles'),
        );

        const refreshForCurrentChannel = (message: WebSocketMessage<{channel_id?: string; post?: string}>) => {
            if (eventChannelID(message) === getCurrentChannelId(store.getState())) {
                window.dispatchEvent(new Event(refreshEventName));
            }
        };

        for (const event of ['posted', 'post_edited', 'post_deleted', 'file_added']) {
            registry.registerWebSocketEventHandler(event, refreshForCurrentChannel);
        }
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

export function registerPluginIfAvailable() {
    if (window.registerPlugin) {
        window.registerPlugin(manifest.id, new Plugin());
    }
}

registerPluginIfAvailable();

export default Plugin;
