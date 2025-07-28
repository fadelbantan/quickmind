function $(sel, el = document) {
    return el.querySelector(sel);
}
function $$(sel, el = document) {
    return Array.from(el.querySelectorAll(sel));
}
