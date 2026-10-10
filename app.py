from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import os
import sqlite3
from functools import wraps
import requests
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "change-this-secret-key")
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE_URL = "https://api.themoviedb.org/3"
DATABASE = os.path.join(app.instance_path, "cinestar.db")
os.makedirs(app.instance_path, exist_ok=True)


def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tmdb_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            year TEXT,
            poster TEXT,
            rating TEXT,
            plot TEXT,
            watched INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, tmdb_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)
    db.commit()
    db.close()


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapped_view


def current_user():
    if "user_id" not in session:
        return None
    db = get_db()
    user = db.execute("SELECT id, name, email FROM users WHERE id = ?", (session["user_id"],)).fetchone()
    db.close()
    return user


def tmdb_get(endpoint, params=None):
    if not TMDB_API_KEY:
        raise RuntimeError(
            "TMDB_API_KEY is not configured. Add it to your .env file."
        )

    params = params or {}

    headers = {
        "Authorization": f"Bearer {TMDB_API_KEY}",
        "accept": "application/json"
    }

    response = requests.get(
        f"{TMDB_BASE_URL}{endpoint}",
        headers=headers,
        params=params,
        timeout=10
    )

    response.raise_for_status()
    return response.json()

def normalize_movie(movie):
    poster_path = movie.get("poster_path")
    release_date = movie.get("release_date") or ""
    rating = movie.get("vote_average")
    return {
        "imdbID": str(movie.get("id")),
        "tmdbID": movie.get("id"),
        "Title": movie.get("title") or movie.get("original_title") or "Unknown title",
        "Year": release_date[:4] if release_date else "N/A",
        "Poster": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else "N/A",
        "imdbRating": f"{rating:.1f}" if isinstance(rating, (int, float)) else "N/A",
        "Plot": movie.get("overview") or "No description available.",
    }


def watchlist_row(row):
    return {
        "imdbID": str(row["tmdb_id"]),
        "tmdbID": row["tmdb_id"],
        "Title": row["title"],
        "Year": row["year"] or "N/A",
        "Poster": row["poster"] or "N/A",
        "imdbRating": row["rating"] or "N/A",
        "Plot": row["plot"] or "No description available.",
        "watched": bool(row["watched"]),
    }


@app.get("/")
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))
    return render_template("index.html", user=current_user())


@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("index"))
    error = None
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        db.close()
        if not user or not check_password_hash(user["password_hash"], password):
            error = "Invalid email or password."
        else:
            session.clear()
            session["user_id"] = user["id"]
            session["user_name"] = user["name"]
            return redirect(url_for("index"))
    return render_template("login.html", error=error)


@app.route("/register", methods=["GET", "POST"])
def register():
    if "user_id" in session:
        return redirect(url_for("index"))
    error = None
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        if not name or not email or not password:
            error = "Please complete all fields."
        elif password != confirm:
            error = "Passwords do not match."
        elif len(password) < 8:
            error = "Password must be at least 8 characters."
        else:
            db = get_db()
            try:
                cursor = db.execute(
                    "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                    (name, email, generate_password_hash(password))
                )
                db.commit()
                user_id = cursor.lastrowid
            except sqlite3.IntegrityError:
                db.rollback()
                error = "An account with that email already exists."
                user_id = None
            finally:
                db.close()
            if user_id:
                session.clear()
                session["user_id"] = user_id
                session["user_name"] = name
                return redirect(url_for("index"))
    return render_template("register.html", error=error)


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.get("/api/me")
@login_required
def me():
    user = current_user()
    return jsonify({"id": user["id"], "name": user["name"], "email": user["email"]})


@app.get("/api/movies")
@login_required
def search_movies():
    query = request.args.get("query", "").strip()
    page = request.args.get("page", "1", type=int)
    if not query:
        return jsonify({"results": [], "page": 1, "total_pages": 0, "total_results": 0})
    page = max(1, min(page, 500))
    try:
        data = tmdb_get("/search/movie", {"query": query, "page": page, "include_adult": "false"})
        return jsonify({
            "results": [normalize_movie(movie) for movie in data.get("results", [])],
            "page": data.get("page", page),
            "total_pages": data.get("total_pages", 0),
            "total_results": data.get("total_results", 0),
        })
    except requests.RequestException as exc:
        return jsonify({"error": "TMDB request failed", "details": str(exc)}), 502
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/movies/<int:movie_id>")
@login_required
def movie_details(movie_id):
    try:
        movie = tmdb_get(f"/movie/{movie_id}")
        normalized = normalize_movie(movie)
        normalized.update({
            "Runtime": f"{movie.get('runtime')} min" if movie.get("runtime") else "N/A",
            "Genre": ", ".join(g["name"] for g in movie.get("genres", [])) or "N/A",
            "Director": "N/A",
            "Actors": "N/A",
            "Language": ", ".join(lang.get("english_name") or lang.get("name", "") for lang in movie.get("spoken_languages", [])) or "N/A",
            "Country": ", ".join(country.get("name", "") for country in movie.get("production_countries", [])) or "N/A",
            "Awards": "N/A",
            "Homepage": movie.get("homepage") or "",
        })
        credits = tmdb_get(f"/movie/{movie_id}/credits")
        normalized["Director"] = ", ".join(dict.fromkeys(person.get("name") for person in credits.get("crew", []) if person.get("job") == "Director")) or "N/A"
        normalized["Actors"] = ", ".join(person.get("name") for person in credits.get("cast", [])[:8] if person.get("name")) or "N/A"
        return jsonify(normalized)
    except requests.RequestException as exc:
        return jsonify({"error": "TMDB request failed", "details": str(exc)}), 502
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500


@app.get("/api/watchlist")
@login_required
def get_watchlist():
    db = get_db()
    rows = db.execute("SELECT * FROM watchlist WHERE user_id = ? ORDER BY created_at DESC, id DESC", (session["user_id"],)).fetchall()
    db.close()
    return jsonify([watchlist_row(row) for row in rows])


@app.post("/api/watchlist")
@login_required
def add_watchlist():
    movie = request.get_json(silent=True) or {}
    required = ["tmdbID", "Title"]
    if not all(movie.get(field) is not None for field in required):
        return jsonify({"error": "Movie ID and title are required."}), 400
    db = get_db()
    try:
        db.execute(
            """INSERT INTO watchlist (user_id, tmdb_id, title, year, poster, rating, plot, watched)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0)""",
            (session["user_id"], int(movie["tmdbID"]), movie.get("Title", "Unknown title"), movie.get("Year"), movie.get("Poster"), movie.get("imdbRating"), movie.get("Plot"))
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        db.close()
        return jsonify({"error": "Movie is already in your watchlist."}), 409
    db.close()
    return jsonify({"message": "Movie added to watchlist."}), 201


@app.delete("/api/watchlist/<int:movie_id>")
@login_required
def remove_watchlist(movie_id):
    db = get_db()
    db.execute("DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ?", (session["user_id"], movie_id))
    db.commit()
    db.close()
    return jsonify({"message": "Movie removed from watchlist."})


@app.patch("/api/watchlist/<int:movie_id>")
@login_required
def toggle_watchlist(movie_id):
    payload = request.get_json(silent=True) or {}
    watched = bool(payload.get("watched"))
    db = get_db()
    cursor = db.execute("UPDATE watchlist SET watched = ? WHERE user_id = ? AND tmdb_id = ?", (int(watched), session["user_id"], movie_id))
    db.commit()
    db.close()
    if cursor.rowcount == 0:
        return jsonify({"error": "Movie not found in your watchlist."}), 404
    return jsonify({"message": "Watchlist updated.", "watched": watched})


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(debug=True)
