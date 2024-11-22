/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				"primary": "#c792ea",
				"primary-dark": "#b06fd1", // Slightly darker than primary
				"secondary": "#C5E478",
				"dark": "#0B253A",
			}
		},
	},
	plugins: [],
}
