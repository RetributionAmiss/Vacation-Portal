@echo off
cd /d "%~dp0"
py -u -c "import http.server, webbrowser; http.server.SimpleHTTPRequestHandler.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript'}); server = http.server.ThreadingHTTPServer(('127.0.0.1', 8001), http.server.SimpleHTTPRequestHandler); print('Payments/Budget preview ready: http://127.0.0.1:8001/preview.html - keep this window open'); webbrowser.open('http://127.0.0.1:8001/preview.html'); server.serve_forever()"
if errorlevel 1 (
  echo Close any previous preview server with Ctrl+C, then try again.
  pause
)
