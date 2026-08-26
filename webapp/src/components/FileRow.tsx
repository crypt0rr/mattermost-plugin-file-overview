import React, {useState} from 'react';

import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import {displayUser, fileKind, formatFileDate, formatFileSize} from '../format';
import {t} from '../messages';
import type {FileOverviewItem} from '../types';

type Props = {
    file: FileOverviewItem;
    user?: UserProfile;
    onPreview: (file: FileOverviewItem) => void;
    onJump: (file: FileOverviewItem) => void;
    onCopy: (file: FileOverviewItem) => Promise<void>;
};

export default function FileRow({file, user, onPreview, onJump, onCopy}: Props) {
    const [copied, setCopied] = useState(false);
    const kind = fileKind(file.mime_type, file.extension);
    const canPreview = file.has_preview_image && kind === 'image';

    const handleNameClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!canPreview) {
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
        <article className='file-overview__row'>
            <div className={`file-overview__thumbnail file-overview__thumbnail--${kind}`}>
                {canPreview ? (
                    <button
                        className='file-overview__thumbnail-button'
                        type='button'
                        aria-label={t('preview', {name: file.name})}
                        onClick={() => onPreview(file)}
                    >
                        <img
                            src={Client4.getFileThumbnailUrl(file.id, 0)}
                            alt=''
                        />
                    </button>
                ) : (
                    <span aria-hidden='true'>{'📄'}</span>
                )}
            </div>
            <div className='file-overview__details'>
                <a
                    className='file-overview__name'
                    href={Client4.getFileUrl(file.id, 0)}
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
        </article>
    );
}
