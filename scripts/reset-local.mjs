import { execSync } from 'node:child_process'
import { config } from 'dotenv'

config({ path: '.env.local' })

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('❌ DATABASE_URL não encontrado em .env.local')
  process.exit(1)
}

console.log('⚠️  Atenção: este comando apaga todos os dados locais do banco configurado.')
console.log('   DATABASE_URL:', databaseUrl.replace(/:.+@/, ':*****@'))

try {
  execSync('npx prisma migrate reset --force', { stdio: 'inherit' })
  console.log('✅ Banco local resetado com sucesso.')
} catch (error) {
  console.error('❌ Falha ao resetar o banco:', error.message)
  process.exit(1)
}
