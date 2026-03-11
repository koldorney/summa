/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				parchment: {
					50: '#faf6ed',
					100: '#f0e6d0',
					200: '#d4c9a8',
					300: '#a89a80',
					400: '#8a7a5a',
				},
				gold: {
					DEFAULT: '#c9a84c',
					bright: '#e8c860',
					dim: '#8a7235',
				},
				charcoal: {
					DEFAULT: '#1c1c1c',
					light: '#2a2a2a',
				},
				bg: {
					DEFAULT: '#0e0c08',
					panel: '#1a170f',
					hover: '#252118',
				}
			},
			fontFamily: {
				cinzel: ['Cinzel', 'serif'],
				cormorant: ['Cormorant Garamond', 'Georgia', 'serif'],
			},
		},
	},
	plugins: [],
};
