<script lang="ts">
	import { base } from '$app/paths';

	type ServerState = 'checking' | 'online' | 'offline' | 'unauthorized';

	const checkIntervalMs = 30_000;
	const requestTimeoutMs = 6_000;

	let connectionOnline = $state(true);
	let serverState = $state<ServerState>('checking');
	let responseTimeMs = $state<number | undefined>();
	let lastCheckedAt = $state<Date | undefined>();

	const connectionLabel = $derived(connectionOnline ? 'En ligne' : 'Hors ligne');
	const serverLabel = $derived(
		serverState === 'online'
			? responseTimeMs === undefined
				? 'Disponible'
				: `Disponible · ${responseTimeMs} ms`
			: serverState === 'unauthorized'
				? 'Session expirée'
				: serverState === 'offline'
					? 'Indisponible'
					: 'Vérification…'
	);
	const statusTitle = $derived(
		lastCheckedAt
			? `Dernière vérification à ${lastCheckedAt.toLocaleTimeString('fr-FR')}`
			: 'Vérification de la disponibilité du serveur'
	);

	async function checkServer() {
		connectionOnline = navigator.onLine;
		if (!connectionOnline) {
			serverState = 'offline';
			responseTimeMs = undefined;
			return;
		}

		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
		const startedAt = performance.now();

		try {
			const response = await fetch(`${base}/api/health?at=${Date.now()}`, {
				cache: 'no-store',
				headers: { accept: 'application/json' },
				signal: controller.signal
			});

			responseTimeMs = Math.round(performance.now() - startedAt);
			serverState = response.ok
				? 'online'
				: response.status === 401 || response.status === 403
					? 'unauthorized'
					: 'offline';
		} catch {
			responseTimeMs = undefined;
			serverState = 'offline';
		} finally {
			window.clearTimeout(timeout);
			lastCheckedAt = new Date();
		}
	}

	$effect(() => {
		connectionOnline = navigator.onLine;
		void checkServer();

		const handleOnline = () => {
			connectionOnline = true;
			serverState = 'checking';
			void checkServer();
		};
		const handleOffline = () => {
			connectionOnline = false;
			serverState = 'offline';
			responseTimeMs = undefined;
		};
		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') void checkServer();
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		const interval = window.setInterval(() => void checkServer(), checkIntervalMs);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.clearInterval(interval);
		};
	});
</script>

<section
	class="server-status"
	aria-label="État de la connexion"
	aria-live="polite"
	title={statusTitle}
>
	<div class="server-status-row">
		<span
			class:available={connectionOnline}
			class:unavailable={!connectionOnline}
			class="server-status-dot"
			aria-hidden="true"
		></span>
		<span>Connexion</span>
		<strong>{connectionLabel}</strong>
	</div>

	<div class="server-status-row">
		<span
			class:checking={serverState === 'checking'}
			class:available={serverState === 'online'}
			class:unavailable={serverState === 'offline'}
			class:warning={serverState === 'unauthorized'}
			class="server-status-dot"
			aria-hidden="true"
		></span>
		<span>Serveur</span>
		<strong>{serverLabel}</strong>
	</div>
</section>
