import './styles/app.css';
import './styles/markdown.css';
import { mount } from 'svelte';
import App from './App.svelte';

// Block the default "navigate to dropped file" behaviour everywhere.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

mount(App, { target: document.getElementById('app')! });
