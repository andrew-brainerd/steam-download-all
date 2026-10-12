import { ButtonItem, findModuleExport, PanelSection, PanelSectionRow, staticClasses } from '@decky/ui';
import { definePlugin, toaster } from '@decky/api';
import { useEffect, useState } from 'react';
import { FaDownload } from 'react-icons/fa';
import { configureDownloads, downloadAll, getAppName, subscribePending } from '../../shared/downloads';

function Content() {
	const [pending, setPending] = useState<number[]>([]);

	useEffect(() => subscribePending(setPending), []);

	const onClick = () => {
		const started = downloadAll();
		toaster.toast({ title: 'Download All', body: `Started ${started} update${started === 1 ? '' : 's'}` });
	};

	return (
		<PanelSection>
			<PanelSectionRow>
				<ButtonItem layout="below" disabled={pending.length === 0} onClick={onClick}>
					{pending.length > 0 ? `Download All (${pending.length})` : 'All Up to Date'}
				</ButtonItem>
			</PanelSectionRow>
			{pending.map((appid) => (
				<PanelSectionRow key={appid}>
					<div style={{ fontSize: '12px', opacity: 0.8 }}>{getAppName(appid)}</div>
				</PanelSectionRow>
			))}
		</PanelSection>
	);
}

export default definePlugin(() => {
	configureDownloads(findModuleExport);

	return {
		name: 'Download All',
		titleView: <div className={staticClasses.Title}>Download All</div>,
		content: <Content />,
		icon: <FaDownload />,
	};
});
