from http.server import HTTPServer, SimpleHTTPRequestHandler
import argparse
import os


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Local dev server with no-cache headers")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--root", type=str, default=".")
    args = parser.parse_args()

    os.chdir(args.root)
    server = HTTPServer(("127.0.0.1", args.port), NoCacheHandler)
    print(f"[Demo] no-cache server running at http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
