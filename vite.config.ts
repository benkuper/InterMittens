import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const basePath =
	process.env.BASE_PATH && process.env.BASE_PATH !== '/'
		? (process.env.BASE_PATH as `/${string}`)
		: '';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Set BASE_PATH=/intermittens on the hosted server.
			adapter: adapter(),
			paths: {
				base: basePath
			}
		})
	]
});
