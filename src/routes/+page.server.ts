import { readData } from '$lib/server/storage';
import { pullDataFromRemote } from '$lib/server/remoteSync';

export const load = async ({ fetch, url }) => {
	const localData = await readData();

	return {
		appData: await pullDataFromRemote(localData, fetch, url)
	};
};
