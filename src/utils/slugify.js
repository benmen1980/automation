/**
 * Converts arbitrary text into a URL-safe slug.
 * "WhatsApp Order!" -> "whatsapp-order"
 */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = { slugify };
