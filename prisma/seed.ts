import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const exists = await prisma.user.findUnique({
    where: { email: 'exemplo@funcionalup.digital' },
  })

  if (!exists) {
    await prisma.user.create({
      data: {
        email: 'exemplo@funcionalup.digital',
        name: 'Usuário de Exemplo',
      },
    })
    console.log('✅ Usuário de exemplo criado.')
  } else {
    console.log('ℹ️  Usuário de exemplo já existe. Nada foi alterado.')
  }
}

main()
  .catch((error) => {
    console.error('❌ Erro ao executar seed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
