<script lang="ts">
	import type { IntermittensState } from '$lib/app/state.svelte';
	import Calendar from '$lib/components/Calendar.svelte';

	let { state }: { state: IntermittensState } = $props();
</script>

<section class="view-grid calendar-page">
	<Calendar {state} panelClass="calendar-page-panel" />
</section>
