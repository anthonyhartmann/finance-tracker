import subprocess, os, sys
os.chdir(os.path.expanduser('~/.cline/dashboard'))
log = open('/tmp/dashboard-test.log', 'w')
p = subprocess.Popen([sys.executable.replace('python','node').replace('python3','node') if False else 'node', 'dashboard.js'],
                    env={**os.environ, 'PORT': os.environ.get('PORT','25464')},
                    stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                    start_new_session=True)
print('launched dashboard.js pid=%d port=%s' % (p.pid, os.environ.get('PORT','25464')))
