import sys, re
src, out = sys.argv[1], sys.argv[2]
h = open(src).read()
head = re.search(r'<head>(.*?)</head>', h, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', h, re.S).group(1)
head = re.sub(r'<meta charset="UTF-8"\s*/?>', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>', '', head)
# title and meta first, so the title sits in the first 8KB
title = re.search(r'<title>.*?</title>', head).group(0)
head = head.replace(title, '')
open(out, 'w').write(title + '\n' + head.strip() + '\n' + body.strip() + '\n')
print('bytes', len(open(out).read()), 'starts:', open(out).read()[:160].replace('\n', ' | '))
