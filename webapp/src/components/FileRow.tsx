import React, {useState} from 'react';

import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import {displayUser, fileKind, filePreviewKind, formatFileDate, formatFileSize, summarizePostMessage} from '../format';
import {t} from '../messages';
import type {FileOverviewItem, FilePostContext} from '../types';
import {mattermostFileUrl} from '../urls';

const previewGlyphs = {
    image: '',
    video: '▶',
    audio: '♫',
    pdf: 'PDF',
    text: 'TXT',
} as const;

type Props = {
    file: FileOverviewItem;
    user?: UserProfile;
    onPreview: (file: FileOverviewItem) => void;
    onJump: (file: FileOverviewItem) => void;
    onCopy: (file: FileOverviewItem) => Promise<void>;
    postContext?: FilePostContext;
    postContextLoading?: boolean;
    postAuthor?: UserProfile;
    postAttachmentCount?: number;
    showPostContext?: boolean;
    groupedWithPrevious?: boolean;
};

export default function FileRow({
    file,
    user,
    onPreview,
    onJump,
    onCopy,
    postContext,
    postContextLoading = false,
    postAuthor,
    postAttachmentCount = 1,
    showPostContext = false,
    groupedWithPrevious = false,
}: Props) {
    const [copied, setCopied] = useState(false);
    const kind = fileKind(file.mime_type, file.extension);
    const previewKind = filePreviewKind(file.mime_type, file.extension, file.has_preview_image);
    const canPreview = previewKind !== undefined;
    const fileURL = mattermostFileUrl(file.id);
    const showContext = showPostContext && Boolean(file.post_id);
    const postMessage = postContext ? summarizePostMessage(postContext.message) || t('noMessageText') : '';

    const handleNameClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!previewKind) {
            return;
        }
        event.preventDefault();
        onPreview(file);
    };

    const copy = async () => {
        try {
            await onCopy(file);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <article className={`file-overview__row${groupedWithPrevious ? ' file-overview__row--same-post' : ''}`}>
            {showContext && (
                <div className='file-overview__post-context'>
                    <div className='file-overview__post-context-heading'>
                        <span className='file-overview__post-context-label'>{t('sharedInMessage')}</span>
                        {postAttachmentCount > 1 && (
                            <span className='file-overview__post-context-count'>
                                {t('attachmentCount', {count: String(postAttachmentCount)})}
                            </span>
                        )}
                    </div>
                    {postContextLoading && (
                        <p
                            className='file-overview__post-context-status'
                            role='status'
                        >{t('loadingMessageContext')}</p>
                    )}
                    {!postContextLoading && postContext && (
                        <button
                            className='file-overview__post-context-message'
                            type='button'
                            onClick={() => onJump(file)}
                            aria-label={`${t('jumpToMessage')}: ${postMessage}`}
                        >
                            <span className='file-overview__post-context-author'>
                                {displayUser(postAuthor, t('unknownUser'))}{': '}
                            </span>
                            <span className='file-overview__post-context-text'>{postMessage}</span>
                        </button>
                    )}
                    {!postContextLoading && !postContext && (
                        <p className='file-overview__post-context-status'>{t('messageContextUnavailable')}</p>
                    )}
                </div>
            )}
            <div className='file-overview__row-content'>
                <div className={`file-overview__thumbnail file-overview__thumbnail--${kind}`}>
                    {previewKind ? (
                        <button
                            className='file-overview__thumbnail-button'
                            type='button'
                            aria-label={t('preview', {name: file.name})}
                            onClick={() => onPreview(file)}
                        >
                            {previewKind === 'image' ? (
                                <img
                                    src={Client4.getFileThumbnailUrl(file.id, 0)}
                                    alt=''
                                />
                            ) : (
                                <span aria-hidden='true'>{previewGlyphs[previewKind]}</span>
                            )}
                        </button>
                    ) : (
                        <span aria-hidden='true'>{'📄'}</span>
                    )}
                </div>
                <div className='file-overview__details'>
                    <a
                        className='file-overview__name'
                        href={fileURL}
                        aria-label={`${canPreview ? t('preview') : t('open')}: ${file.name}`}
                        title={file.name}
                        onClick={handleNameClick}
                    >
                        {file.name}
                    </a>
                    <div className='file-overview__meta'>
                        <span>{t('uploadedBy')}{': '}{displayUser(user, t('unknownUser'))}</span>
                        <span aria-hidden='true'>{'·'}</span>
                        <time dateTime={new Date(file.create_at).toISOString()}>{formatFileDate(file.create_at)}</time>
                        <span aria-hidden='true'>{'·'}</span>
                        <span>{formatFileSize(file.size)}</span>
                    </div>
                    <div className='file-overview__actions'>
                        {canPreview && (
                            <button
                                type='button'
                                onClick={() => onPreview(file)}
                            >
                                {t('preview')}
                            </button>
                        )}
                        {!canPreview && (
                            <a
                                className='file-overview__action-link'
                                href={fileURL}
                                aria-label={`${t('open')}: ${file.name}`}
                            >
                                {t('open')}
                            </a>
                        )}
                        <button
                            type='button'
                            onClick={() => onJump(file)}
                            disabled={!file.post_id}
                        >
                            {t('jump')}
                        </button>
                        {file.post_id && (
                            <button
                                type='button'
                                onClick={copy}
                            >
                                {copied ? t('copied') : t('copyLink')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
