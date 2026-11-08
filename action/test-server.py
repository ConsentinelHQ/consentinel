import http.server, json, sys
mode=sys.argv[1]; n={'c':0}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def send(self,code,obj):
        b=json.dumps(obj).encode(); self.send_response(code); self.send_header('content-type','application/json'); self.end_headers(); self.wfile.write(b)
    def do_POST(self):
        if mode=='402': return self.send(402,{"error":"Scan after deploy needs a monitoring plan."})
        self.send(202,{"status":"queued","scanId":"11111111-1111-1111-1111-111111111111"})
    def do_GET(self):
        n['c']+=1
        if n['c']<2: return self.send(200,{"status":"running","scanId":"x","reportUrl":"https://r"})
        nc=[{"vendor":"Meta","title":"Meta fires before consent","fix":"Gate Meta | now.","gtm":["The Custom HTML tag that loads Meta (tag ID 69 in GTM-AB12) has no consent check."]}] if mode=='fail' else []
        self.send(200,{"status":"complete","scanId":"x","reportUrl":"https://r/app/scans/x","verdict":"fail" if nc else "pass","critical":3,"warning":1,"headline":"3 trackers fire after opt-out","newCritical":nc})
http.server.HTTPServer(('127.0.0.1',int(sys.argv[2])),H).serve_forever()
