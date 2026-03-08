const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function getLatestKey() {
    try {
        const key = await prisma.clientApiKey.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });
        if (key) {
            fs.writeFileSync('C:/agent/gigacompute/latest_key.txt', key.key);
            console.log("Key saved to latest_key.txt");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

getLatestKey();
