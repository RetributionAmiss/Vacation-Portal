# Family Vacation Portal — PWA Host V4.0.1

V4.0.1 fixes iPhone/Safari viewport sizing.

The PWA shell now:
- fills the dynamic visual viewport
- resizes when Safari's address/tool bars expand or collapse
- explicitly sizes the root and embedded Apps Script iframe
- prevents the iframe from falling back to its small intrinsic height
- uses a new service-worker cache version

Before publishing, keep your current Apps Script `/exec` URL in `config.js`.

For GitHub Pages, replace the files in the repository root with this package and
commit to the publishing branch. GitHub Pages will redeploy automatically.
