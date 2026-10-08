import sys,json,urllib.request,time,datetime,hashlib
base,manifest_path,label=sys.argv[1:4]
manifest=json.load(open(manifest_path))
health=None
for _ in range(20):
    try:
        health=json.load(urllib.request.urlopen(base+'/health',timeout=2))
        if health.get('service')=='readytogo' and health.get('status')=='ok':break
    except Exception:pass
    time.sleep(1)
assert health and health.get('service')=='readytogo' and health.get('status')=='ok',health
assets=[]
for path,want in manifest['files'].items():
    if not path.startswith('dist/client/'):continue
    url=base+'/'+path[len('dist/client/'):]
    with urllib.request.urlopen(url,timeout=5) as response:
        got=hashlib.sha256(response.read()).hexdigest()
        assert got==want,path
        assets.append({'path':path,'status':response.status,'sha256':got,'matchesManifest':True})
print(json.dumps({'schema':'readytogo.release-assets.v1','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'label':label,'expectedRevision':manifest['revision'],'transport':'ordinary HTTP only; no browser','health':health,'assets':assets,'newProviderCalls':0,'newModelCalls':0,'passed':True},indent=2))
