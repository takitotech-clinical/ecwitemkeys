<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
</script>

<div class="page">
	<h1>{page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
	<p>{page.error?.message}</p>
	<p><a href={resolve('/')}>Go to the item keys browser</a></p>
</div>
