import { base } from '$app/paths';
import { forgetClient } from '$lib/server/access';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, url }) => {
	forgetClient(cookies, url.protocol === 'https:');
	throw redirect(303, `${base}/login`);
};
