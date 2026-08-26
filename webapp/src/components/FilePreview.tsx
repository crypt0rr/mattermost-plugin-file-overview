import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

import {Client4} from 'mattermost-redux/client';

import {t} from '../messages';
import type {FileOverviewItem} from '../types';

type Props = {
    file: FileOverviewItem;
    onClose: () => void;
};

export default function FilePreview({file, onClose}: Props) {
    const closeButton = useRef<HTMLButtonElement>(null);

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
                <img
                    src={Client4.getFilePreviewUrl(file.id, 0)}
                    alt={t('previewAlt', {name: file.name})}
                />
            </div>
        </div>,
        document.body,
    );
}
