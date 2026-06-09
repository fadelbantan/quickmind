"""Turns the Flask app into a static site so it can be deployed to Netlify (or anywhere static).

QuickMind doesn't have real backend logic — Flask is just there to render the
Jinja template and serve files from static/. So this script renders the
template once and drops everything into dist/. For day-to-day dev you can
still just use `flask run` as usual; this is only needed when deploying.

"""
import os
import shutil

from app import app

OUT = "dist"


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    # Hit the "/" route and save whatever Flask renders as our index.html.
    with app.test_client() as client:
        resp = client.get("/")
        if resp.status_code != 200:
            raise SystemExit(f"Something went wrong — GET / came back {resp.status_code}")
        html = resp.get_data(as_text=True)

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    # Bring along the static assets so all the /static/... paths still work.
    shutil.copytree("static", os.path.join(OUT, "static"))

    print(f"Done! Static site is ready in ./{OUT}/")


if __name__ == "__main__":
    main()
