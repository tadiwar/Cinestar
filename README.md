# CineStar – Flask + TMDB + User Accounts

This version adds:
- Flask backend
- TMDB movie search with API key kept in `.env`
- TMDB pagination / Load More Movies
- Registration and login
- SQLite database
- Secure password hashing with Werkzeug
- Flask sessions
- Logout
- User-specific watchlists stored in SQLite
- Watched / unwatched status per user

## Project structure

```text
CineStar/
├── app.py
├── .env
├── .env.example
├── requirements.txt
├── instance/
│   └── cinestar.db        # created automatically
├── templates/
│   ├── login.html
│   ├── register.html
│   └── index.html
└── static/
    ├── auth.css
    ├── script.js
    └── style.css
```

## Setup on Windows

1. Open this folder in VS Code.
2. Open a terminal in the project folder.
3. Create a virtual environment only if you do not already have one:

```cmd
python -m venv .venv
```

4. Activate it:

```cmd
.venv\Scripts\activate
```

5. Install dependencies:

```cmd
pip install -r requirements.txt
```

6. Open `.env` and replace the placeholder with your new TMDB API key. Also replace `SECRET_KEY` with a long random value.
7. Start the app:

```cmd
python app.py
```

8. Open `http://127.0.0.1:5000`.

The first visit redirects to the login page. Create an account, then log in.

## Database

The SQLite database is created automatically at `instance/cinestar.db`. Passwords are stored as hashes, not plain text. Each watchlist row is linked to the logged-in user's ID, so users cannot see another user's watchlist through the app's watchlist endpoints.

Do not commit `.env`, `.venv`, or `instance/cinestar.db` to a public repository.
