from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    zoom_controls = """
    <div id='controls'>        
        <button id='zoom-out' title='Zoom Out'>-</button>
        <span id='zoom-display'>100%</span>
        <button id='zoom-in' title='Zoom In'>+</button>
    </div>
    """
    return render_template("index.html", zoom_controls=zoom_controls)



app.run(debug=True)
