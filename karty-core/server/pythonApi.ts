import { spawn, ChildProcess } from 'child_process';

let pythonProcess: ChildProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let stopping = false;

export function startPythonApi() {
  if (pythonProcess || stopping) return;

  const labPath = '/root/karty-lab';
  const venvPath = '/root/karty-lab/venv';

  console.log(`[Python API] Starting FastAPI on :8000 from ${labPath}`);

  pythonProcess = spawn('bash', ['-c',
    `cd ${labPath} && VIRTUAL_ENV=${venvPath} PATH=${venvPath}/bin:$PATH xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 run_api.py`
  ], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  pythonProcess.on('error', (err) => {
    console.error('[Python API] Error:', err.message);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`[Python API] Exited with code ${code}`);
    pythonProcess = null;
    if (!stopping && !restartTimer) {
      console.error('[Python API] Child process stopped; restarting in 5 seconds');
      restartTimer = setTimeout(() => {
        restartTimer = null;
        startPythonApi();
      }, 5000);
    }
  });
}

function stopPythonApi() {
  stopping = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  pythonProcess?.kill('SIGTERM');
}

process.once('SIGINT', stopPythonApi);
process.once('SIGTERM', stopPythonApi);
