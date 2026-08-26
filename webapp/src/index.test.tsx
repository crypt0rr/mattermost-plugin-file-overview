/** @jest-environment jsdom */

import type {ReactElement} from 'react';
import {create} from 'react-test-renderer';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';

import type {PluginRegistry} from 'types/mattermost-webapp';

import {Plugin, registerPluginIfAvailable} from './index';

jest.mock('mattermost-redux/selectors/entities/common', () => ({getCurrentChannelId: jest.fn()}));
jest.mock('mattermost-redux/selectors/entities/channels', () => ({getCurrentChannel: jest.fn()}));
jest.mock('mattermost-redux/selectors/entities/teams', () => ({getCurrentTeam: jest.fn()}));
jest.mock('mattermost-redux/selectors/entities/users', () => ({getCurrentUserId: jest.fn()}));

test('registers the channel-header button, RHS component, translations, and refresh events', () => {
    const toggleRHSPlugin = {type: 'TOGGLE_FILE_OVERVIEW'};
    const registry = {
        registerTranslations: jest.fn(),
        registerRightHandSidebarComponent: jest.fn().mockReturnValue({toggleRHSPlugin}),
        registerChannelHeaderButtonAction: jest.fn(),
        registerWebSocketEventHandler: jest.fn(),
    } as unknown as PluginRegistry;
    const dispatch = jest.fn();
    const getState = jest.fn().mockReturnValue({});
    const store = {dispatch, getState} as unknown as Store<GlobalState>;

    new Plugin().initialize(registry, store);

    expect(registry.registerTranslations).toHaveBeenCalled();
    expect(registry.registerRightHandSidebarComponent).toHaveBeenCalled();
    expect(registry.registerChannelHeaderButtonAction).toHaveBeenCalled();
    expect(registry.registerWebSocketEventHandler).toHaveBeenCalledTimes(4);

    const headerIconRenderer = create((registry.registerChannelHeaderButtonAction as jest.Mock).mock.calls[0][0] as ReactElement);
    expect(headerIconRenderer.root.findByType('svg').props.className).toBe('file-overview__channel-header-icon');
    expect(headerIconRenderer.root.findByType('svg').props['aria-hidden']).toBe('true');
    expect(headerIconRenderer.root.findAllByType('path')).toHaveLength(3);

    const getTranslations = (registry.registerTranslations as jest.Mock).mock.calls[0][0] as (locale: string) => Record<string, string>;
    expect(getTranslations('en')['file_overview.title']).toBe('Files');
    expect(getTranslations('nl')).toEqual({});

    const headerAction = (registry.registerChannelHeaderButtonAction as jest.Mock).mock.calls[0][1] as () => void;
    headerAction();
    expect(dispatch).toHaveBeenCalledWith(toggleRHSPlugin);

    (getCurrentChannelId as unknown as jest.Mock).mockReturnValue('channel-id');
    const dispatchEvent = jest.spyOn(window, 'dispatchEvent');
    const websocketHandler = (registry.registerWebSocketEventHandler as jest.Mock).mock.calls[0][1] as (message: unknown) => void;
    websocketHandler({data: {channel_id: 'channel-id'}});
    websocketHandler({data: {post: JSON.stringify({channel_id: 'channel-id'})}});
    websocketHandler({data: {post: JSON.stringify({})}});
    websocketHandler({data: {post: 'not-json'}});
    websocketHandler({data: {channel_id: 'other-channel'}});
    websocketHandler({data: {}});
    expect(dispatchEvent).toHaveBeenCalledTimes(2);

    const registerPlugin = jest.fn();
    const originalRegisterPlugin = window.registerPlugin;
    window.registerPlugin = registerPlugin;
    registerPluginIfAvailable();
    expect(registerPlugin).toHaveBeenCalledWith('com.github.crypt0rr.file-overview', expect.any(Plugin));
    window.registerPlugin = originalRegisterPlugin;
});
