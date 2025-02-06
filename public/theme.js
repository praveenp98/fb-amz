// Theme management
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');
const themeToggleBtn = document.getElementById('theme-toggle');

// Check for saved theme preference, otherwise use system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const storedTheme = localStorage.getItem('theme');

// Set initial theme
if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
    document.body.classList.add('dark');
    themeToggleLightIcon.classList.remove('hidden');
} else {
    themeToggleDarkIcon.classList.remove('hidden');
}

// Toggle theme function
function toggleTheme() {
    const isDark = document.body.classList.contains('dark');
    
    // Toggle theme
    document.body.classList.toggle('dark');
    
    // Toggle icons
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');
    
    // Save preference
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

// Add click event
themeToggleBtn.addEventListener('click', toggleTheme);
