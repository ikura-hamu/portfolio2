/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				"primary":"#c792ea",
				"secondary":"#C5E478",
				"dark": "#0B253A",
			}
		},
	},
	plugins: [],
}
