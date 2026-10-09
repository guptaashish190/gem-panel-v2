import { spawn } from 'node:child_process'
import { createServer } from 'vite'

const shell = process.platform === 'win32'

await new Promise((resolve, reject) => {
  const compile = spawn('npx', ['tsc', '-p', 'tsconfig.electron.json'], { stdio: 'inherit', shell })
  compile.on('error', reject)
  compile.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('compile failed'))))
})

const server = await createServer({ server: { port: 5173, strictPort: true } })
await server.listen()
const url = server.resolvedUrls?.local?.[0]
if (!url) throw new Error('dev server has no local url')

const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  shell,
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
})

electron.on('exit', (code) => {
  void server.close()
  process.exit(code ?? 0)
})
