// CineStar frontend. Authentication and watchlists are handled by Flask.
let watchlist = [];
let searchResults = [];
let currentPage = 1;
let currentQuery = '';
let totalPages = 1;

const moviesGrid = document.getElementById('movies-grid');
const watchlistGrid = document.getElementById('watchlist-grid');
const emptyWatchlist = document.getElementById('empty-watchlist');
const noResults = document.getElementById('no-results');
const searchInput = document.querySelector('.search-input');
const searchBtn = document.querySelector('.search-btn');
const notification = document.getElementById('notification');
const filterBtns = document.querySelectorAll('.filter-btn');
const wlFilterBtns = document.querySelectorAll('[data-wl-filter]');
const navLinks = document.querySelectorAll('.nav-link');
const homeLink = document.getElementById('home-link');
const loading = document.getElementById('loading');
const movieModal = document.getElementById('movie-modal');
const modalClose = document.getElementById('modal-close');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');

const totalMoviesEl = document.getElementById('total-movies');
const watchlistCountEl = document.getElementById('watchlist-count');
const watchedCountEl = document.getElementById('watched-count');
const avgRatingEl = document.getElementById('avg-rating');
const wlTotalEl = document.getElementById('wl-total');
const wlWatchedEl = document.getElementById('wl-watched');
const wlUnwatchedEl = document.getElementById('wl-unwatched');
const wlAvgRatingEl = document.getElementById('wl-avg-rating');

async function init() {
    setupEventListeners();
    await loadWatchlist();
    updateStats();
    searchMovies('avengers');
}

function displayMovies(moviesToDisplay) {
    moviesGrid.innerHTML = '';
    if (!moviesToDisplay.length) {
        noResults.style.display = 'block';
        updateLoadMoreButton();
        return;
    }
    noResults.style.display = 'none';
    moviesToDisplay.forEach(movie => {
        const isInWatchlist = watchlist.some(item => item.imdbID === movie.imdbID);
        const movieCard = document.createElement('div');
        movieCard.className = 'movie-card';
        movieCard.innerHTML = `
            <img src="${movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450/cccccc/969696?text=No+Poster'}" alt="${escapeHtml(movie.Title)}" class="movie-poster">
            <div class="movie-info">
                <h3 class="movie-title">${escapeHtml(movie.Title)}</h3>
                <div class="movie-year">${escapeHtml(movie.Year)}</div>
                <div class="movie-rating"><i class="fas fa-star"></i><span>${escapeHtml(movie.imdbRating || 'N/A')}</span></div>
                <div class="movie-actions">
                    <button class="btn ${isInWatchlist ? 'btn-success' : 'btn-primary'}" data-id="${movie.imdbID}">
                        <i class="fas ${isInWatchlist ? 'fa-check' : 'fa-plus'}"></i>
                        ${isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                    </button>
                    <button class="btn btn-outline view-details" data-id="${movie.imdbID}">
                        <i class="fas fa-info-circle"></i> Details
                    </button>
                </div>
            </div>`;
        moviesGrid.appendChild(movieCard);
    });
    updateLoadMoreButton();
}

function updateWatchlistDisplay(filter = 'all') {
    watchlistGrid.innerHTML = '';
    let filtered = watchlist;
    if (filter === 'watched') filtered = watchlist.filter(movie => movie.watched);
    if (filter === 'unwatched') filtered = watchlist.filter(movie => !movie.watched);

    if (!filtered.length) {
        emptyWatchlist.style.display = 'block';
        updateWatchlistStats();
        return;
    }
    emptyWatchlist.style.display = 'none';
    filtered.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.innerHTML = `
            <img src="${movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450/cccccc/969696?text=No+Poster'}" alt="${escapeHtml(movie.Title)}" class="movie-poster">
            <div class="movie-info">
                <h3 class="movie-title">${escapeHtml(movie.Title)}</h3>
                <div class="movie-year">${escapeHtml(movie.Year)}</div>
                <div class="movie-rating"><i class="fas fa-star"></i><span>${escapeHtml(movie.imdbRating || 'N/A')}</span></div>
                <div class="movie-actions">
                    <button class="btn ${movie.watched ? 'btn-success' : 'btn-outline'}" data-id="${movie.imdbID}" data-action="watched">
                        <i class="fas ${movie.watched ? 'fa-check' : 'fa-eye'}"></i>
                        ${movie.watched ? 'Watched' : 'Mark as Watched'}
                    </button>
                    <button class="btn btn-danger" data-id="${movie.imdbID}" data-action="remove">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>`;
        watchlistGrid.appendChild(card);
    });
    updateWatchlistStats();
}

function updateStats() {
    totalMoviesEl.textContent = searchResults.length;
    watchlistCountEl.textContent = watchlist.length;
    watchedCountEl.textContent = watchlist.filter(movie => movie.watched).length;
    avgRatingEl.textContent = averageRating(watchlist);
}

function updateWatchlistStats() {
    wlTotalEl.textContent = watchlist.length;
    const watched = watchlist.filter(movie => movie.watched).length;
    wlWatchedEl.textContent = watched;
    wlUnwatchedEl.textContent = watchlist.length - watched;
    wlAvgRatingEl.textContent = averageRating(watchlist);
}

function averageRating(movies) {
    const ratings = movies.map(movie => parseFloat(movie.imdbRating)).filter(Number.isFinite);
    return ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '0.0';
}

function showNotification(message) {
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 3000);
}

async function loadWatchlist() {
    try {
        const response = await fetch('/api/watchlist');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load watchlist');
        watchlist = data;
        updateWatchlistDisplay();
    } catch (error) {
        console.error(error);
        showNotification('Could not load your watchlist.');
    }
}

async function addToWatchlist(movieId) {
    const movie = searchResults.find(m => m.imdbID === movieId);
    if (!movie) return;
    try {
        const response = await fetch('/api/watchlist', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(movie)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not add movie');
        await loadWatchlist();
        updateStats();
        displayMovies(searchResults);
        showNotification('Movie added to your watchlist!');
    } catch (error) {
        showNotification(error.message);
    }
}

async function removeFromWatchlist(movieId) {
    try {
        const response = await fetch(`/api/watchlist/${movieId}`, {method: 'DELETE'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not remove movie');
        await loadWatchlist();
        updateStats();
        displayMovies(searchResults);
        showNotification('Movie removed from your watchlist.');
    } catch (error) { showNotification(error.message); }
}

async function toggleWatchedStatus(movieId) {
    const movie = watchlist.find(m => m.imdbID === movieId);
    if (!movie) return;
    try {
        const response = await fetch(`/api/watchlist/${movieId}`, {
            method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({watched: !movie.watched})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not update watchlist');
        await loadWatchlist();
        updateStats();
    } catch (error) { showNotification(error.message); }
}

async function searchMovies(query, type = '', page = 1) {
    if (!query.trim()) return;
    loading.style.display = 'block';
    if (page === 1) {
        moviesGrid.innerHTML = '';
        searchResults = [];
        currentQuery = query;
    }
    currentPage = page;
    try {
        const response = await fetch(`/api/movies?query=${encodeURIComponent(query)}&page=${page}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Backend request failed');
        totalPages = data.total_pages || 1;
        searchResults = [...searchResults, ...(data.results || [])];
        displayMovies(searchResults);
        updateStats();
    } catch (error) {
        console.error(error);
        if (page === 1) displayMovies([]);
        showNotification(error.message || 'Unable to search movies.');
    } finally {
        loading.style.display = 'none';
        updateLoadMoreButton();
    }
}

function updateLoadMoreButton() {
    if (!loadMoreContainer || !loadMoreBtn) return;
    const canLoadMore = searchResults.length > 0 && currentPage < totalPages;
    loadMoreContainer.style.display = canLoadMore ? 'flex' : 'none';
    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Load More Movies';
}

async function loadMoreMovies() {
    if (currentPage >= totalPages) return;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
    await searchMovies(currentQuery, '', currentPage + 1);
}

async function showMovieDetails(movieId) {
    try {
        const response = await fetch(`/api/movies/${movieId}`);
        const movie = await response.json();
        if (!response.ok) throw new Error(movie.error || 'Failed to load details');
        modalTitle.textContent = movie.Title;
        modalBody.innerHTML = `
            <img src="${movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/300x450/cccccc/969696?text=No+Poster'}" alt="${escapeHtml(movie.Title)}" class="modal-poster">
            <div class="modal-details">
                <h3 class="modal-title">${escapeHtml(movie.Title)}</h3>
                <div class="modal-meta">
                    <span><i class="fas fa-calendar"></i> ${escapeHtml(movie.Year)}</span>
                    <span><i class="fas fa-clock"></i> ${escapeHtml(movie.Runtime)}</span>
                    <span><i class="fas fa-star"></i> ${escapeHtml(movie.imdbRating)}/10</span>
                </div>
                <p class="modal-plot">${escapeHtml(movie.Plot)}</p>
                <div class="modal-info">
                    <div class="info-item"><span class="info-label">Genre</span><span class="info-value">${escapeHtml(movie.Genre)}</span></div>
                    <div class="info-item"><span class="info-label">Director</span><span class="info-value">${escapeHtml(movie.Director)}</span></div>
                    <div class="info-item"><span class="info-label">Actors</span><span class="info-value">${escapeHtml(movie.Actors)}</span></div>
                    <div class="info-item"><span class="info-label">Language</span><span class="info-value">${escapeHtml(movie.Language)}</span></div>
                    <div class="info-item"><span class="info-label">Country</span><span class="info-value">${escapeHtml(movie.Country)}</span></div>
                </div>
            </div>`;
        movieModal.style.display = 'block';
    } catch (error) { showNotification('Error loading movie details'); }
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    navLinks.forEach(link => link.classList.toggle('active', link.dataset.page === pageId.replace('-page', '')));
    if (pageId === 'watchlist-page') updateWatchlistDisplay();
}

function setupEventListeners() {
    searchBtn.addEventListener('click', () => { if (searchInput.value.trim()) searchMovies(searchInput.value.trim()); });
    searchInput.addEventListener('keyup', e => { if (e.key === 'Enter' && searchInput.value.trim()) searchMovies(searchInput.value.trim()); });
    loadMoreBtn?.addEventListener('click', loadMoreMovies);

    moviesGrid.addEventListener('click', e => {
        const button = e.target.closest('.btn');
        if (!button) return;
        const movieId = button.dataset.id;
        if (button.classList.contains('btn-primary')) addToWatchlist(movieId);
        else if (button.classList.contains('view-details')) showMovieDetails(movieId);
    });

    watchlistGrid.addEventListener('click', e => {
        const button = e.target.closest('.btn');
        if (!button) return;
        const movieId = button.dataset.id;
        if (button.dataset.action === 'remove') removeFromWatchlist(movieId);
        else if (button.dataset.action === 'watched') toggleWatchedStatus(movieId);
    });

    filterBtns.forEach(btn => btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.filter !== 'all' && btn.dataset.filter !== 'movie') {
            showNotification('CineStar currently searches movies using TMDB.');
            return;
        }
        if (searchInput.value.trim()) searchMovies(searchInput.value.trim());
    }));

    wlFilterBtns.forEach(btn => btn.addEventListener('click', () => {
        wlFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateWatchlistDisplay(btn.dataset.wlFilter);
    }));

    navLinks.forEach(link => link.addEventListener('click', e => { e.preventDefault(); switchPage(`${link.dataset.page}-page`); }));
    homeLink.addEventListener('click', () => switchPage('home-page'));
    modalClose.addEventListener('click', () => movieModal.style.display = 'none');
    window.addEventListener('click', e => { if (e.target === movieModal) movieModal.style.display = 'none'; });
}

function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', init);

function updateWelcomeGreeting() {
    const greetingElement = document.getElementById("greetingText");

    if (!greetingElement) return;

    const hour = new Date().getHours();

    if (hour < 12) {
        greetingElement.textContent = "Good morning";
    } else if (hour < 17) {
        greetingElement.textContent = "Good afternoon";
    } else {
        greetingElement.textContent = "Good evening";
    }
}

updateWelcomeGreeting();