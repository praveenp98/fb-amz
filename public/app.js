const auth = firebase.auth();
const logoutBtn = document.getElementById('logout-btn');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchBtnText = document.getElementById('search-btn-text');
const searchSpinner = document.getElementById('search-spinner');
const loadingState = document.getElementById('loading-state');
const resultsSection = document.getElementById('results-section');
const resultsDiv = document.getElementById('results');
const copyAllBtn = document.getElementById('copy-all');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageStartSpan = document.getElementById('page-start');
const pageEndSpan = document.getElementById('page-end');
const totalResultsSpan = document.getElementById('total-results');

let currentUser = null;
let allInterests = [];
let currentPage = 1;
const itemsPerPage = 50;
let isSearching = false;

// Auth state observer
auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (!user) {
        window.location.href = '/login.html';
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = '/login.html';
    }).catch(console.error);
});

// Copy all interests
copyAllBtn.addEventListener('click', () => {
    if (allInterests.length === 0) {
        alert('No interests to copy!');
        return;
    }

    const interestNames = allInterests.map(interest => interest.name).join('\n');
    navigator.clipboard.writeText(interestNames).then(() => {
        alert('All interests copied to clipboard!');
    }).catch(error => {
        console.error('Failed to copy:', error);
        alert('Failed to copy interests. Please try again.');
    });
});

// Pagination controls
function updatePagination() {
    const totalPages = Math.ceil(allInterests.length / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, allInterests.length);

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage >= totalPages;

    pageStartSpan.textContent = allInterests.length ? start : 0;
    pageEndSpan.textContent = end;
    totalResultsSpan.textContent = allInterests.length;
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        displayResults();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage * itemsPerPage < allInterests.length) {
        currentPage++;
        displayResults();
    }
});

// Search functionality
async function performSearch(query) {
    if (isSearching) return;
    
    if (query.length < 2) {
        allInterests = [];
        displayResults();
        return;
    }

    isSearching = true;
    setLoadingState(true);

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch(`/api/interests?query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': idToken
            }
        });

        if (!response.ok) throw new Error('Failed to fetch interests');
        
        const data = await response.json();
        
        if (data && data.data && Array.isArray(data.data)) {
            allInterests = data.data.map(interest => ({
                ...interest,
                audience_size: parseInt(interest.audience_size) || 0
            }));
        } else {
            allInterests = [];
        }
        
        currentPage = 1;
        displayResults();
    } catch (error) {
        console.error('Error:', error);
        resultsDiv.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-4 text-center text-red-500">
                    Error: ${error.message}
                </td>
            </tr>`;
        resultsSection.classList.remove('hidden');
    } finally {
        setLoadingState(false);
        isSearching = false;
    }
}

// Handle search button click
searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    performSearch(query);
});

// Handle enter key in search input
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        performSearch(query);
    }
});

// Set loading state
function setLoadingState(isLoading) {
    if (isLoading) {
        searchBtnText.textContent = 'Searching...';
        searchSpinner.classList.remove('hidden');
        searchBtn.disabled = true;
        loadingState.classList.remove('hidden');
        resultsSection.classList.add('hidden');
    } else {
        searchBtnText.textContent = 'Search Interests';
        searchSpinner.classList.add('hidden');
        searchBtn.disabled = false;
        loadingState.classList.add('hidden');
        if (allInterests.length > 0) {
            resultsSection.classList.remove('hidden');
        }
    }
}

// Display results
function displayResults() {
    if (!allInterests || allInterests.length === 0) {
        resultsDiv.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No interests found
                </td>
            </tr>`;
        updatePagination();
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, allInterests.length);
    const pageInterests = allInterests.slice(start, end);

    resultsDiv.innerHTML = pageInterests.map(interest => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                ${interest.name}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${interest.topic || 'N/A'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${formatNumber(interest.audience_size || 0)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${getPathString(interest.path)}
            </td>
        </tr>
    `).join('');

    updatePagination();
}

function getPathString(path) {
    if (!path) return 'N/A';
    if (Array.isArray(path)) return path.join(' > ');
    if (typeof path === 'string') return path;
    return 'N/A';
}

// Format large numbers
function formatNumber(num) {
    num = parseInt(num) || 0;
    
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
}
