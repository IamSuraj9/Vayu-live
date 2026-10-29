import sys, json, os, glob
reg, dest = sys.argv[1], sys.argv[2]
deps = set()
for f in sorted(glob.glob(os.path.join(reg, '*.json'))):
    d = json.load(open(f))
    deps.update(d.get('dependencies', []))
    for file in d.get('files', []):
        name = os.path.basename(file['path'])
        open(os.path.join(dest, name), 'w').write(file['content'])
        print('wrote', name)
print('DEPS', ' '.join(sorted(deps)))
