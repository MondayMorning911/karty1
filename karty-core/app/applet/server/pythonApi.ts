import { spawn, ChildProcess } from 'child_process';
import path from 'path';

let pythonProcess: ChildProcess | null = null;

export function startPythonApi() {
  if (pythonProcess) return;
  
  console.log('[Python API] Starting FastAPI server on port 8000...');
  
  // We'll use the venv created locally
  pythonProcess = spawn('bash', ['-c', 'cd /app/applet/karty-lab-code && source venv/bin/activate && xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" python3 run_api.py'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  pythonProcess.on('error', (err) => {
    console.error('[Python API] Error starting process:', err);
  });

  pythonProcess.on('exit', (code) => {
    console.log(`[Python API] Process exited with code ${code}`);
    pythonProcess = null;
  });
}
