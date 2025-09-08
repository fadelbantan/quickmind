/**
 * Utility helpers for DOM selection and tree queries.
 */

/**
 * Query a single element within the given root.
 * @param {string} sel - CSS selector to match.
 * @param {Document|HTMLElement} [root=document] - Root to query within.
 * @returns {Element|null} The matched element or null if not found.
 */
export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Query multiple elements within the given root.
 * @param {string} sel - CSS selector to match.
 * @param {Document|HTMLElement} [root=document] - Root to query within.
 * @returns {Element[]} Array of matched elements.
 */
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Return the direct children of a node based on the `data-parent` attribute.
 * @param {HTMLElement} node - Node whose children should be returned.
 * @returns {Element[]} Child nodes belonging to the given node.
 */
export const getChildren = (node) => $$(`[data-parent="${node.dataset.id}"]`);