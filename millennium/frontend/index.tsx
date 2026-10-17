import { definePlugin, DialogButton, Field, findClassModule, findModuleExport } from 'millennium';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { configureDownloads, downloadAll, subscribePending } from '../../shared/downloads';
import { BUTTON_STYLE, DownloadsClasses, isDownloadsClassModule, watchDownloadsHeader } from '../../shared/downloads-header';
import type { UpdateFile } from '../../shared/updates';
import { VERSION } from '../../shared/version';
import { installUpdate, subscribeUpdate } from './updater';

const DownloadIcon = () => (
	<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
		<path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3zM4 19h16v2H4z" />
	</svg>
);

const DownloadAllButton = ({ classes }: { classes: DownloadsClasses }) => {
	const [pending, setPending] = useState<number[]>([]);

	useEffect(() => subscribePending(setPending), []);

	const count = pending.length;

	return (
		<DialogButton
			className={classes.RemoveAllButton}
			style={BUTTON_STYLE}
			disabled={count === 0}
			onClick={() => downloadAll()}
		>
			{count > 0 ? `Download All (${count})` : 'All Up to Date'}
		</DialogButton>
	);
};

const UpdateButton = ({ classes }: { classes: DownloadsClasses }) => {
	const [update, setUpdate] = useState<UpdateFile | null>(null);
	const [status, setStatus] = useState<'idle' | 'installing' | 'failed'>('idle');

	useEffect(() => subscribeUpdate(setUpdate), []);

	if (!update) return null;

	const label =
		status === 'installing' ? 'Updating…' : status === 'failed' ? 'Update failed, retry' : `Update to ${update.version}`;

	return (
		<DialogButton
			className={classes.RemoveAllButton}
			style={BUTTON_STYLE}
			disabled={status === 'installing'}
			onClick={async () => {
				setStatus('installing');
				try {
					await installUpdate(update);
				} catch (err) {
					console.error('[download-all] Update failed', err);
					setStatus('failed');
				}
			}}
		>
			{label}
		</DialogButton>
	);
};

const HeaderButtons = ({ classes }: { classes: DownloadsClasses }) => (
	<>
		<UpdateButton classes={classes} />
		<DownloadAllButton classes={classes} />
	</>
);

export default definePlugin(() => {
	configureDownloads(findModuleExport);
	watchDownloadsHeader(
		() => findClassModule(isDownloadsClassModule) as DownloadsClasses | undefined,
		(container, classes) => createRoot(container).render(<HeaderButtons classes={classes} />),
	);

	return {
		title: 'Download All',
		icon: <DownloadIcon />,
		content: <Field label={`Download All ${VERSION}`} description="Adds a Download All button to the Downloads page header." />,
	};
});
