import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

import type {UserProfile} from '@mattermost/types/users';

import {displayUser, filePreviewKind, formatFileDate, formatFileSize} from '../format';
import {t} from '../messages';
import type {FileOverviewItem} from '../types';
import {mattermostFilePreviewUrl, mattermostFileUrl} from '../urls';

type Props = {
    file: FileOverviewItem;
    user?: UserProfile;
    position: number;
    total: number;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onClose: () => void;
};

export default function FilePreview({file, user, position, total, hasPrevious, hasNext, onPrevious, onNext, onClose}: Props) {
    const closeButton = useRef<HTMLButtonElement>(null);
    const kind = filePreviewKind(file.mime_type, file.extension, file.has_preview_image);
    const fileURL = mattermostFileUrl(file.id);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        closeButton.current?.focus();
        return () => {
            previousFocus?.focus();
        };
    }, [onClose]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            const target = event.target as HTMLElement | null;
            if (target?.tagName === 'VIDEO' || target?.tagName === 'AUDIO') {
                return;
            }
            if (event.key === 'ArrowLeft' && hasPrevious) {
                event.preventDefault();
                onPrevious();
            } else if (event.key === 'ArrowRight' && hasNext) {
                event.preventDefault();
                onNext();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [hasNext, hasPrevious, onClose, onNext, onPrevious]);

    return createPortal(
        <div
            className='file-overview__preview-backdrop'
            role='presentation'
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className='file-overview__preview'
                role='dialog'
                aria-modal='true'
                aria-labelledby='file-overview-preview-title'
            >
                <div className='file-overview__preview-header'>
                    <div className='file-overview__preview-heading'>
                        <h2 id='file-overview-preview-title'>{file.name}</h2>
                        <p>{t('uploadedBy')}{': '}{displayUser(user, t('unknownUser'))}{' · '}{formatFileDate(file.create_at)}{' · '}{formatFileSize(file.size)}</p>
                        {total > 1 && <p>{t('previewPosition', {current: String(position), total: String(total)})}</p>}
                    </div>
                    <button
                        ref={closeButton}
                        className='file-overview__preview-close'
                        type='button'
                        aria-label={t('close')}
                        onClick={onClose}
                    >
                        {'×'}
                    </button>
                </div>
                <div className='file-overview__preview-content'>
                    {kind === 'image' && (
                        <img
                            src={mattermostFilePreviewUrl(file.id)}
                            alt={t('previewAlt', {name: file.name})}
                        />
                    )}
                    {kind === 'video' && (
                        <video
                            className='file-overview__preview-video'
                            src={fileURL}
                            controls={true}
                            playsInline={true}
                            preload='metadata'
                            aria-label={t('previewAlt', {name: file.name})}
                        />
                    )}
                    {kind === 'audio' && (
                        <audio
                            className='file-overview__preview-audio'
                            src={fileURL}
                            controls={true}
                            preload='metadata'
                            aria-label={t('previewAlt', {name: file.name})}
                        />
                    )}
                    {kind === 'pdf' && (
                        <iframe
                            className='file-overview__preview-document'
                            src={fileURL}
                            title={t('previewAlt', {name: file.name})}
                        />
                    )}
                    {kind === 'text' && (
                        <iframe
                            className='file-overview__preview-document'
                            src={fileURL}
                            title={t('previewAlt', {name: file.name})}
                            sandbox=''
                        />
                    )}
                    {!kind && (
                        <div className='file-overview__preview-fallback'>
                            <p>{t('previewUnavailable')}</p>
                            <a
                                href={fileURL}
                            >{t('open')}</a>
                        </div>
                    )}
                </div>
                {(kind === 'pdf' || kind === 'text') && (
                    <div className='file-overview__preview-actions'>
                        <a
                            href={fileURL}
                        >{t('open')}</a>
                    </div>
                )}
                {total > 1 && (
                    <nav
                        className='file-overview__preview-navigation'
                        aria-label={t('previewNavigation')}
                    >
                        <button
                            type='button'
                            onClick={onPrevious}
                            disabled={!hasPrevious}
                        >{t('previous')}</button>
                        <button
                            type='button'
                            onClick={onNext}
                            disabled={!hasNext}
                        >{t('next')}</button>
                    </nav>
                )}
            </div>
        </div>,
        document.body,
    );
}
