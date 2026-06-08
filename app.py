from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")

if __name__ == "__main__":
    # Port 5000 is hijacked by macOS AirPlay Receiver / Control Center, which
    # causes the browser to hit AirTunes (IPv6 ::1) instead of Flask and show a
    # connection error. 5001 avoids that collision. Alternatively, disable
    # System Settings → General → AirDrop & Handoff → "AirPlay Receiver".
    app.run(debug=True, port=5001)
