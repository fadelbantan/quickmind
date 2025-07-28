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
    <details id='shortcut-help'>
        <summary>Shortcuts</summary>
        <ul>
            <li>Enter: add child</li>
            <li>Tab: add sibling</li>
            <li>E or double-click: edit node</li>
            <li>Esc: exit edit</li>
            <li>Arrow keys: navigate nodes</li>
            <li>C: center map</li>
        </ul>
    </details>
    """
    return render_template("index.html", zoom_controls=zoom_controls)



app.run(debug=True)
