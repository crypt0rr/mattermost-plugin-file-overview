import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

import {fileKind} from '../format';
import {t} from '../messages';
import type {FileOverviewItem} from '../types';
import {mattermostFilePreviewUrl, mattermostFileUrl} from '../urls';

type Props = {
    file: FileOverviewItem;
    onClose: () => void;
};

export default function FilePreview({file, onClose}: Props) {
    const closeButton = useRef<HTMLButtonElement>(null);
    const kind = fileKind(file.mime_type, file.extension);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        closeButton.current?.focus();
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus();
        };
    }, [onClose]);

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
                aria-label={t('previewAlt', {name: file.name})}
            >
                <button
                    ref={closeButton}
                    className='file-overview__preview-close'
                    type='button'
                    aria-label={t('close')}
                    onClick={onClose}
                >
                    {'×'}
                </button>
                {kind === 'image' && (
                    <img
                        src={mattermostFilePreviewUrl(file.id)}
                        alt={t('previewAlt', {name: file.name})}
                    />
                )}
                {kind === 'video' && (
                    <video
                        className='file-overview__preview-video'
                        src={mattermostFileUrl(file.id)}
                        controls={true}
                        playsInline={true}
                        preload='metadata'
                        aria-label={t('previewAlt', {name: file.name})}
                    />
                )}
                {kind === 'audio' && (
                    <audio
                        className='file-overview__preview-audio'
                        src={mattermostFileUrl(file.id)}
                        controls={true}
                        preload='metadata'
                        aria-label={t('previewAlt', {name: file.name})}
                    />
                )}
            </div>
        </div>,
        document.body,
    );
}
