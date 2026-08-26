import manifest from 'manifest';
import type {FormEvent} from 'react';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useSelector} from 'react-redux';

import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeam} from 'mattermost-redux/selectors/entities/teams';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import FilePreview from './FilePreview';
import FileRow from './FileRow';

import {getChannelFiles} from '../api';
import {t} from '../messages';
import {loadPostContexts} from '../post_context';
import {
    buildSearchRequest,
    isFileSearchUnavailable,
    loadConversationParticipants,
    searchConversationFiles,
    validateExtension,
} from '../search';
import type {FileOverviewItem, FileOverviewSort, FilePostContext} from '../types';
import {mattermostPostPermalink} from '../urls';

import '../file_overview.scss';

type Props = {
    team?: Team;
    channel?: Channel;
};

type SearchState = {
    query: string;
    extension: string;
};

const defaultSort: FileOverviewSort = {sort: 'create_at', direction: 'desc'};
const refreshEventName = `${manifest.id}:refresh`;

function sortItems(items: FileOverviewItem[], sort: FileOverviewSort): FileOverviewItem[] {
    return [...items].sort((left, right) => {
        const leftValue = sort.sort === 'size' ? left.size : left.create_at;
        const rightValue = sort.sort === 'size' ? right.size : right.create_at;
        if (leftValue === rightValue) {
            return left.id.localeCompare(right.id);
        }
        const result = leftValue - rightValue;
        return sort.direction === 'asc' ? result : -result;
    });
}

function isPermissionDenied(error: unknown): boolean {
    const candidate = Object(error) as {status?: unknown; statusCode?: unknown; status_code?: unknown};
    const statuses = [candidate.status, candidate.statusCode, candidate.status_code];
    return statuses.includes(401) || statuses.includes(403);
}

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return t('requestFailed');
}

export default function FileOverview({team: teamProp, channel: channelProp}: Props) {
    const selectedChannel = useSelector(getCurrentChannel);
    const selectedTeam = useSelector(getCurrentTeam);
    const currentUserId = useSelector(getCurrentUserId);
    const channel = channelProp || selectedChannel;
    const team = teamProp || selectedTeam;
    const [files, setFiles] = useState<FileOverviewItem[]>([]);
    const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
    const [postContexts, setPostContexts] = useState<Record<string, FilePostContext | null>>({});
    const [participants, setParticipants] = useState<UserProfile[]>([]);
    const [sort, setSort] = useState<FileOverviewSort>(defaultSort);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [searchError, setSearchError] = useState('');
    const [searchLimitWarning, setSearchLimitWarning] = useState(false);
    const [accessDenied, setAccessDenied] = useState(false);
    const [participantsLoading, setParticipantsLoading] = useState(false);
    const [participantsError, setParticipantsError] = useState(false);
    const [queryInput, setQueryInput] = useState('');
    const [extensionInput, setExtensionInput] = useState('');
    const [activeSearch, setActiveSearch] = useState<SearchState | null>(null);
    const [previewFile, setPreviewFile] = useState<FileOverviewItem>();
    const [refreshToken, setRefreshToken] = useState(0);
    const handledRefreshToken = useRef(0);
    const requestSerial = useRef(0);
    const abortController = useRef<AbortController>();
    const requestedProfiles = useRef(new Set<string>());
    const postContextInFlight = useRef(new Set<string>());
    const postContextGeneration = useRef(0);

    const channelId = channel?.id || '';
    const channelName = channel?.display_name || channel?.name || t('channelFiles');
    const invalidatePostContexts = useCallback(() => {
        postContextGeneration.current += 1;
        postContextInFlight.current.clear();
        setPostContexts({});
    }, []);

    const clearSensitiveState = useCallback(() => {
        requestSerial.current += 1;
        abortController.current?.abort();
        abortController.current = undefined;
        invalidatePostContexts();
        setFiles([]);
        setPage(0);
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        setPreviewFile(undefined);
    }, [invalidatePostContexts]);

    const handlePermissionDenied = useCallback(() => {
        clearSensitiveState();
        setAccessDenied(true);
        setError('');
        setSearchError('');
        setSearchLimitWarning(false);
    }, [clearSensitiveState]);

    const loadBrowse = useCallback(async (nextPage: number, append: boolean) => {
        if (!channelId) {
            return;
        }
        if (!append) {
            invalidatePostContexts();
        }
        abortController.current?.abort();
        const controller = new AbortController();
        abortController.current = controller;
        const serial = ++requestSerial.current;
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setAccessDenied(false);
            setError('');
        }
        try {
            const response = await getChannelFiles(channelId, nextPage, sort, controller.signal);
            if (serial !== requestSerial.current) {
                return;
            }
            setFiles((current) => (append ? [...current, ...response.items] : response.items));
            setPage(response.page);
            setHasMore(response.has_more);
        } catch (loadError) {
            if (serial === requestSerial.current && (loadError as {name?: string}).name !== 'AbortError') {
                if (isPermissionDenied(loadError)) {
                    handlePermissionDenied();
                } else {
                    setError(errorMessage(loadError));
                }
            }
        } finally {
            if (serial === requestSerial.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [channelId, handlePermissionDenied, invalidatePostContexts, sort]);

    const loadSearch = useCallback(async (nextPage: number, append: boolean, request: SearchState) => {
        if (!channel || participantsError) {
            return;
        }
        if (!append) {
            invalidatePostContexts();
        }
        const serial = ++requestSerial.current;
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setAccessDenied(false);
            setSearchError('');
            setSearchLimitWarning(false);
            setError('');
        }
        try {
            const nativeRequest = buildSearchRequest(channel, participants, currentUserId, request.query, request.extension);
            const response = await searchConversationFiles(nativeRequest, channel.id, nextPage);
            if (serial !== requestSerial.current) {
                return;
            }
            setFiles((current) => (append ? [...current, ...response.items] : response.items));
            setPage(nextPage);
            setHasMore(response.hasMore);
            setSearchLimitWarning(response.limited);
        } catch (searchLoadError) {
            if (serial !== requestSerial.current) {
                return;
            }
            if (isPermissionDenied(searchLoadError)) {
                handlePermissionDenied();
            } else if (isFileSearchUnavailable(searchLoadError)) {
                setSearchError(t('searchUnavailable'));
            } else if (searchLoadError instanceof Error) {
                setSearchError(searchLoadError.message);
            } else {
                setSearchError(t('searchUnavailable'));
            }
        } finally {
            if (serial === requestSerial.current) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [channel, currentUserId, handlePermissionDenied, invalidatePostContexts, participants, participantsError]);

    useEffect(() => {
        setQueryInput('');
        setExtensionInput('');
        setActiveSearch(null);
        setSearchError('');
        setSearchLimitWarning(false);
        setAccessDenied(false);
        clearSensitiveState();
    }, [channelId, clearSensitiveState]);

    useEffect(() => {
        if (!channelId || activeSearch) {
            return undefined;
        }
        loadBrowse(0, false);
        return () => {
            abortController.current?.abort();
        };
    }, [activeSearch, channelId, loadBrowse]);

    useEffect(() => {
        if (refreshToken === 0 || refreshToken === handledRefreshToken.current) {
            return;
        }
        handledRefreshToken.current = refreshToken;
        if (activeSearch) {
            loadSearch(0, false, activeSearch);
        } else {
            loadBrowse(0, false);
        }
    }, [activeSearch, loadBrowse, loadSearch, refreshToken]);

    useEffect(() => {
        let mounted = true;
        if (!channel || (channel.type !== 'D' && channel.type !== 'G')) {
            setParticipants([]);
            setParticipantsError(false);
            setParticipantsLoading(false);
            return () => {
                mounted = false;
            };
        }
        setParticipantsLoading(true);
        setParticipantsError(false);
        loadConversationParticipants(channel.id).
            then((loadedParticipants) => {
                if (mounted) {
                    setParticipants(loadedParticipants);
                }
            }).
            catch(() => {
                if (mounted) {
                    setParticipantsError(true);
                }
            }).
            finally(() => {
                if (mounted) {
                    setParticipantsLoading(false);
                }
            });
        return () => {
            mounted = false;
        };
    }, [channel]);

    useEffect(() => {
        const profileIds = [
            ...files.map((file) => file.creator_id),
            ...Object.values(postContexts).
                filter((context): context is FilePostContext => Boolean(context)).
                map((context) => context.user_id),
        ];
        const creatorIds = [...new Set(profileIds.filter(Boolean))];
        const missingIds = creatorIds.filter((id) => !profiles[id] && !requestedProfiles.current.has(id));
        if (missingIds.length === 0) {
            return undefined;
        }
        missingIds.forEach((id) => requestedProfiles.current.add(id));
        Client4.getProfilesByIds(missingIds).
            then((loadedProfiles) => {
                setProfiles((current) => loadedProfiles.reduce<Record<string, UserProfile>>((next, profile) => ({...next, [profile.id]: profile}), current));
            }).
            catch(() => {
                // A missing or deleted uploader is rendered as "Unknown user".
            });
        return undefined;
    }, [files, postContexts, profiles]);

    useEffect(() => {
        if (!channelId || files.some((file) => file.channel_id !== channelId)) {
            return undefined;
        }

        const postIds = [...new Set(files.map((file) => file.post_id).filter(Boolean))];
        const missingPostIds = postIds.filter((postId) => !Object.prototype.hasOwnProperty.call(postContexts, postId) && !postContextInFlight.current.has(postId));
        if (missingPostIds.length === 0) {
            return undefined;
        }

        missingPostIds.forEach((postId) => postContextInFlight.current.add(postId));
        const generation = postContextGeneration.current;
        loadPostContexts(missingPostIds, channelId).
            then((loadedContexts) => {
                if (generation !== postContextGeneration.current) {
                    return;
                }
                setPostContexts((current) => missingPostIds.reduce<Record<string, FilePostContext | null>>((next, postId) => {
                    next[postId] = loadedContexts[postId] || null;
                    return next;
                }, {...current}));
            }).
            catch(() => {
                if (generation !== postContextGeneration.current) {
                    return;
                }
                setPostContexts((current) => missingPostIds.reduce<Record<string, FilePostContext | null>>((next, postId) => {
                    next[postId] = null;
                    return next;
                }, {...current}));
            }).
            finally(() => {
                if (generation === postContextGeneration.current) {
                    missingPostIds.forEach((postId) => postContextInFlight.current.delete(postId));
                }
            });

        return undefined;
    }, [channelId, files, postContexts]);

    useEffect(() => {
        const refresh = () => setRefreshToken((current) => current + 1);
        window.addEventListener(refreshEventName, refresh);
        return () => window.removeEventListener(refreshEventName, refresh);
    }, []);

    const visibleFiles = useMemo(() => sortItems(files, sort), [files, sort]);
    const extensionSuggestions = useMemo(() => [...new Set(files.map((file) => file.extension).filter(Boolean))].sort(), [files]);
    const postAttachmentCounts = useMemo(() => files.reduce<Record<string, number>>((counts, file) => {
        if (file.post_id) {
            counts[file.post_id] = (counts[file.post_id] || 0) + 1;
        }
        return counts;
    }, {}), [files]);
    const previewIndex = previewFile ? visibleFiles.findIndex((file) => file.id === previewFile.id) : -1;

    const submitSearch = async (event: FormEvent) => {
        event.preventDefault();
        setSearchError('');
        try {
            const extension = validateExtension(extensionInput);
            const request = {query: queryInput.trim(), extension};
            if (!channel) {
                throw new Error(t('searchUnavailable'));
            }
            buildSearchRequest(channel, participants, currentUserId, request.query, request.extension);
            setActiveSearch(request);
            await loadSearch(0, false, request);
        } catch (searchSubmitError) {
            setSearchError(searchSubmitError instanceof Error ? searchSubmitError.message : t('searchUnavailable'));
        }
    };

    const clearSearch = () => {
        setActiveSearch(null);
        setQueryInput('');
        setExtensionInput('');
        setSearchError('');
        setSearchLimitWarning(false);
    };

    const changeSort = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const [nextSort, nextDirection] = event.target.value.split(':') as [FileOverviewSort['sort'], FileOverviewSort['direction']];
        setSort({sort: nextSort, direction: nextDirection});
        setPage(0);
        setHasMore(false);
        if (activeSearch) {
            loadSearch(0, false, activeSearch);
        }
    };

    const copyPostLink = async (file: FileOverviewItem) => {
        if (!file.post_id) {
            return;
        }
        const url = mattermostPostPermalink(file.post_id, team?.name);
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            return;
        }
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', 'true');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
    };

    const jumpToPost = (file: FileOverviewItem) => {
        if (!file.post_id) {
            return;
        }
        window.location.assign(mattermostPostPermalink(file.post_id, team?.name));
    };

    const closePreview = useCallback(() => setPreviewFile(undefined), []);

    const previousPreview = useCallback(() => {
        if (previewIndex > 0) {
            setPreviewFile(visibleFiles[previewIndex - 1]);
        }
    }, [previewIndex, visibleFiles]);

    const nextPreview = useCallback(() => {
        if (previewIndex >= 0 && previewIndex < visibleFiles.length - 1) {
            setPreviewFile(visibleFiles[previewIndex + 1]);
        }
    }, [previewIndex, visibleFiles]);

    const openPreview = useCallback((file: FileOverviewItem) => setPreviewFile(file), []);

    const canSearch = !accessDenied && !participantsLoading && !participantsError && Boolean(channel);
    const initialLoading = loading && files.length === 0;

    const refreshFiles = () => {
        if (activeSearch) {
            loadSearch(0, false, activeSearch);
            return;
        }
        loadBrowse(0, false);
    };

    const submitForm = (event: FormEvent) => {
        submitSearch(event);
    };

    const retry = () => {
        if (activeSearch) {
            loadSearch(0, false, activeSearch);
            return;
        }
        loadBrowse(0, false);
    };

    const loadMoreFiles = () => {
        if (activeSearch) {
            loadSearch(page + 1, true, activeSearch);
            return;
        }
        loadBrowse(page + 1, true);
    };

    return (
        <div className='file-overview'>
            <div className='file-overview__heading'>
                <div>
                    <h2>{t('title')}</h2>
                    <p>{channelName}</p>
                </div>
                <button
                    type='button'
                    className='file-overview__icon-button'
                    onClick={refreshFiles}
                    aria-label={t('refresh')}
                >
                    {'↻'}
                </button>
            </div>

            <form
                className='file-overview__search'
                onSubmit={submitForm}
            >
                <label htmlFor='file-overview-query'>{t('filename')}</label>
                <div className='file-overview__search-row'>
                    <input
                        id='file-overview-query'
                        type='search'
                        value={queryInput}
                        onChange={(event) => setQueryInput(event.target.value)}
                        placeholder={t('filename')}
                        disabled={!canSearch}
                    />
                    <button
                        type='submit'
                        disabled={!canSearch || loading}
                    >{t('search')}</button>
                </div>
                <label htmlFor='file-overview-extension'>{t('extension')}</label>
                <input
                    id='file-overview-extension'
                    type='text'
                    value={extensionInput}
                    onChange={(event) => setExtensionInput(event.target.value)}
                    placeholder={t('extensionPlaceholder')}
                    list='file-overview-extension-suggestions'
                    disabled={!canSearch}
                />
                <datalist id='file-overview-extension-suggestions'>
                    {extensionSuggestions.map((extension) => (
                        <option
                            key={extension}
                            value={extension}
                        />
                    ))}
                </datalist>
                {activeSearch && (
                    <button
                        type='button'
                        className='file-overview__clear-search'
                        onClick={clearSearch}
                    >
                        {t('clearSearch')}
                    </button>
                )}
            </form>

            <div className='file-overview__sort'>
                <label htmlFor='file-overview-sort'>{t('sort')}</label>
                <select
                    id='file-overview-sort'
                    value={`${sort.sort}:${sort.direction}`}
                    onChange={changeSort}
                    disabled={accessDenied}
                >
                    <option value='create_at:desc'>{t('newest')}</option>
                    <option value='create_at:asc'>{t('oldest')}</option>
                    <option value='size:desc'>{t('largest')}</option>
                    <option value='size:asc'>{t('smallest')}</option>
                </select>
            </div>

            <div className='file-overview__body'>
                {accessDenied && (
                    <div
                        className='file-overview__access-denied'
                        role='alert'
                    >
                        <p>{t('permissionDenied')}</p>
                        <button
                            type='button'
                            onClick={retry}
                        >{t('retry')}</button>
                    </div>
                )}
                {!accessDenied && participantsError && (
                    <p className='file-overview__notice'>{t('searchParticipantsUnavailable')}</p>
                )}
                {!accessDenied && searchError && (
                    <div
                        className='file-overview__error'
                        role='alert'
                    >
                        <p>{searchError}</p>
                        <button
                            type='button'
                            onClick={retry}
                        >{t('retry')}</button>
                    </div>
                )}
                {!accessDenied && searchLimitWarning && <p className='file-overview__notice'>{t('searchLimit')}</p>}
                {!accessDenied && error && (
                    <div
                        className='file-overview__error'
                        role='alert'
                    >
                        <p>{error}</p>
                        <button
                            type='button'
                            onClick={retry}
                        >{t('retry')}</button>
                    </div>
                )}

                {!accessDenied && initialLoading && (
                    <div
                        className='file-overview__loading'
                        role='status'
                    >{t('loading')}</div>
                )}
                {!accessDenied && loading && files.length > 0 && (
                    <p
                        className='file-overview__stale'
                        role='status'
                    >{t('staleData')}</p>
                )}
                {!accessDenied && !loading && visibleFiles.length === 0 && !error && !searchError && (
                    <p className='file-overview__empty'>{activeSearch ? t('noSearchResults') : t('empty')}</p>
                )}
                {!accessDenied && visibleFiles.length > 0 && (
                    <div
                        className='file-overview__list'
                        aria-label={t('channelFiles')}
                    >
                        {visibleFiles.map((file, index) => {
                            const previousFile = visibleFiles[index - 1];
                            const groupedWithPrevious = Boolean(file.post_id && previousFile?.post_id === file.post_id);
                            const hasPostContext = Boolean(file.post_id && Object.prototype.hasOwnProperty.call(postContexts, file.post_id));
                            const postContext = file.post_id && hasPostContext ? postContexts[file.post_id] || undefined : undefined;
                            return (
                                <FileRow
                                    key={file.id}
                                    file={file}
                                    user={profiles[file.creator_id]}
                                    onPreview={openPreview}
                                    onJump={jumpToPost}
                                    onCopy={copyPostLink}
                                    postContext={postContext}
                                    postContextLoading={Boolean(file.post_id && !hasPostContext)}
                                    postAuthor={postContext ? profiles[postContext.user_id] : undefined}
                                    postAttachmentCount={file.post_id ? postAttachmentCounts[file.post_id] : undefined}
                                    showPostContext={!groupedWithPrevious}
                                    groupedWithPrevious={groupedWithPrevious}
                                />
                            );
                        })}
                    </div>
                )}
                {!accessDenied && hasMore && !loading && (
                    <button
                        className='file-overview__load-more'
                        type='button'
                        disabled={loadingMore}
                        onClick={loadMoreFiles}
                    >
                        {loadingMore ? t('loadingMore') : t('loadMore')}
                    </button>
                )}
            </div>
            {!accessDenied && previewFile && previewIndex >= 0 && (
                <FilePreview
                    file={previewFile}
                    user={profiles[previewFile.creator_id]}
                    position={previewIndex + 1}
                    total={visibleFiles.length}
                    hasPrevious={previewIndex > 0}
                    hasNext={previewIndex < visibleFiles.length - 1}
                    onPrevious={previousPreview}
                    onNext={nextPreview}
                    onClose={closePreview}
                />
            )}
        </div>
    );
}
