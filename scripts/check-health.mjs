import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const requiredFiles = [
  'package.json',
  'next.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
  'prisma/schema.prisma',
  'app/layout.tsx',
  'app/page.tsx',
]

console.log('🔍 Verificando saúde do projeto...')

let healthy = true
for (const file of requiredFiles) {
  const fullPath = path.join(root, file)
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`)
  } else {
    console.log(`  ❌ ${file} não encontrado`)
    healthy = false
  }
}

if (!fs.existsSync(path.join(root, '.env.local')) && !fs.existsSync(path.join(root, '.env'))) {
  console.log('  ⚠️  .env.local ou .env ainda não criado. Lembre-se de copiar .env.example.')
}

if (healthy) {
  console.log('\n✅ O projeto parece saudável.')
} else {
  console.log('\n❌ Alguns arquivos estão faltando.')
  process.exit(1)
}
