// Поднимает весь стек и печатает адреса сервисов, чтобы не вспоминать порты.
// Порты держать в синхроне с docker-compose.yml (секции ports каждого сервиса).
import { spawnSync } from 'node:child_process'

const up = spawnSync('docker', ['compose', 'up', '--build', '-d'], {
  stdio: 'inherit',
  shell: true,
})

if (up.status !== 0) {
  process.exit(up.status ?? 1)
}

const services = [
  ['Админка (под логином)', 'http://localhost:8081'],
  ['n8n', 'http://localhost:5678'],
  ['RSSHub', 'http://localhost:1200'],
  ['Ollama', 'http://localhost:11434'],
]

const pad = Math.max(...services.map(([name]) => name.length))
const line = '-'.repeat(pad + 30)

console.log('')
console.log('  news-poster поднят:')
console.log(`  ${line}`)
for (const [name, url] of services) {
  console.log(`  ${name.padEnd(pad)}  ->  ${url}`)
}
console.log(`  ${line}`)
console.log('  Остановить: npm run stop   Логи: npm run logs')
console.log('')
