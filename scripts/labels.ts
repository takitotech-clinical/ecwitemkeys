/**
 * Creates or updates the proposal labels from LABEL_STYLES. Run by the Labels workflow; locally it
 * needs GITHUB_TOKEN with Issues: write.
 */
import { LABEL_STYLES } from '../src/lib/config.ts';
import { rest, restAll } from './lib/github.ts';
import { run } from './lib/io.ts';

run(async () => {
	const existing = await restAll<{ name: string; color: string; description: string | null }>(
		'/repos/{repo}/labels'
	);
	for (const [name, style] of Object.entries(LABEL_STYLES)) {
		const cur = existing.find((l) => l.name.toLowerCase() === name.toLowerCase());
		if (!cur) {
			await rest('POST', '/repos/{repo}/labels', { name, ...style });
			console.log(`created ${name}`);
		} else if (
			cur.name !== name ||
			cur.color !== style.color ||
			cur.description !== style.description
		) {
			await rest('PATCH', `/repos/{repo}/labels/${encodeURIComponent(cur.name)}`, {
				new_name: name,
				...style
			});
			console.log(`updated ${name}`);
		} else {
			console.log(`ok ${name}`);
		}
	}
});
