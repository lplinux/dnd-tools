/** api/docs.js — Module documentation (README.md served as plain text) */


export const docsApi = {
  /**
   * Fetch the README for a module slug.
   * Returns plain text (not JSON) — use fetch directly for this one.
   * @param {string} slug  e.g. 'timeline', 'pc-sheet'
   */
  async getReadme(slug) {
    const res = await fetch(`/api/docs/${slug}`);
    if (!res.ok) throw new Error(`No docs for "${slug}"`);
    return res.text();
  },
};
