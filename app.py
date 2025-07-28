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
        <summary>🔑 Shortcut<span class="hint">(Press ?)</span></summary>
        <ul>
            <li>↩️ <strong>Enter</strong> – Add child</li>
            <li>↔️ <strong>Tab</strong> – Add sibling</li>
            <li>✏️ <strong>E</strong> / Double-click – Edit node</li>
            <li>🚪 <strong>Esc</strong> – Exit edit mode</li>
            <li>🧭 <strong>Arrow keys</strong> – Navigate nodes</li>
            <li>🎯 <strong>C</strong> – Center map</li>
            <li>🗑️ <strong>Backspace</strong> – Delete leaf node</li>
        </ul>
    </details>
    """
    return render_template("index.html", zoom_controls=zoom_controls)



app.run(debug=True)
