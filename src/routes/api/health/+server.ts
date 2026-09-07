import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = () => {
	return json(
		{
			status: 'ok',
			checkedAt: new Date().toISOString()
		},
		{
			headers: { 'cache-control': 'no-store' }
		}
	);
};
