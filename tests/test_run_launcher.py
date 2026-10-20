"""Exercise the actual launcher with isolated services; no network or credentials."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

LAUNCHER = Path(__file__).resolve().parents[1] / 'run.command'


class LauncherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='launcher test ')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for folder in ('backend', 'frontend', 'bin'):
            (self.root / folder).mkdir()
        shutil.copy2(LAUNCHER, self.root / 'run.command')
        (self.root / 'backend/.env').write_text(
            "SUPABASE_DB_URL='jdbc:postgresql://example/db'\n"
            "SUPABASE_DB_USER='test'\nSUPABASE_DB_PASSWORD='test password'\n"
            "CLERK_ISSUER_URI='https://example.test'\n")
        (self.root / 'frontend/.env.local').write_text('VITE_API_URL=http://127.0.0.1:8000\n')
        self.executable('bin/java', '#!/bin/bash\nexit 0\n')
        service = '''#!/bin/bash
if [[ "${PWD##*/}" == backend ]]; then
  [[ "$SUPABASE_DB_PASSWORD" == 'test password' ]] || exit 19
fi
if [[ "$1" == ci ]]; then
  echo installed > ../installed
  mkdir -p node_modules
  exit "${INSTALL_EXIT:-0}"
fi
if [[ "$1" == run && "${FRONTEND_EXIT:-}" != '' ]]; then
  exit "$FRONTEND_EXIT"
fi
echo $$ > "../${PWD##*/}.pid"
sleep 300 &
echo $! > "../${PWD##*/}.child"
wait
'''
        self.executable('bin/npm', service)
        self.executable('backend/mvnw', service)
        self.env = dict(os.environ, PATH=str(self.root / 'bin') + os.pathsep + os.environ['PATH'])

    def executable(self, path, text):
        target = self.root / path
        target.write_text(text)
        target.chmod(0o755)

    def run_launcher(self, **env):
        return subprocess.run(['bash', str(self.root / 'run.command')],
                              cwd='/', env=dict(self.env, **env),
                              capture_output=True, text=True, timeout=10)

    def test_missing_backend_environment(self):
        (self.root / 'backend/.env').unlink()
        result = self.run_launcher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Create backend/.env', result.stdout)

    def test_placeholder_rejected(self):
        (self.root / 'backend/.env').write_text('SUPABASE_DB_URL=YOUR_HOST\n')
        result = self.run_launcher()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Set SUPABASE_DB_URL', result.stdout)

    def test_missing_frontend_environment(self):
        (self.root / 'frontend/.env.local').unlink()
        self.assertIn('Create frontend/.env.local', self.run_launcher().stdout)

    def test_install_failure_prevents_startup(self):
        result = self.run_launcher(INSTALL_EXIT='7')
        self.assertEqual(result.returncode, 7)
        self.assertFalse((self.root / 'backend.pid').exists())

    def test_service_failure_propagates(self):
        result = self.run_launcher(FRONTEND_EXIT='9')
        self.assertEqual(result.returncode, 9)
        self.assertTrue((self.root / 'installed').exists())

    def test_interrupt_stops_services_and_children(self):
        (self.root / 'frontend/node_modules').mkdir()
        proc = subprocess.Popen(['bash', str(self.root / 'run.command')],
                                cwd='/', env=self.env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True)
        try:
            deadline = time.monotonic() + 6
            while not all((self.root / f'{name}.{kind}').exists()
                          for name in ('backend', 'frontend') for kind in ('pid', 'child')):
                if proc.poll() is not None or time.monotonic() > deadline:
                    self.fail('Services did not start')
                time.sleep(0.05)
            proc.send_signal(signal.SIGINT)
            output, _ = proc.communicate(timeout=6)
            self.assertEqual(proc.returncode, 130, output)
            self.assertFalse((self.root / 'installed').exists())
            for name in ('backend', 'frontend'):
                for kind in ('pid', 'child'):
                    pid = int((self.root / f'{name}.{kind}').read_text())
                    state = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)],
                                           capture_output=True, text=True).stdout.strip()
                    self.assertTrue(not state or state.startswith('Z'), f'{name} {kind} still running')
        finally:
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                proc.communicate(timeout=6)


if __name__ == '__main__':
    unittest.main()
