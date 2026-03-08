import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStatus() {
    try {
        console.log("--- System Status Check ---");

        const jobCount = await prisma.clientJob.count();
        console.log(`Total Client Jobs: ${jobCount}`);

        const pendingJobs = await prisma.clientJob.findMany({
            where: { status: 'pending' },
            take: 5
        });
        console.log(`Pending Jobs: ${pendingJobs.length}`);
        pendingJobs.forEach(j => console.log(` - ID: ${j.id}, Type: ${j.type}, Created: ${j.createdAt}`));

        const processingJobs = await prisma.clientJob.findMany({
            where: { status: 'processing' },
            take: 5
        });
        console.log(`Processing Jobs: ${processingJobs.length}`);

        const nodeCount = await prisma.node.count();
        const activeNodes = await prisma.node.count({ where: { status: 'idle' } });
        console.log(`Total Nodes: ${nodeCount}`);
        console.log(`Active (Idle) Nodes: ${activeNodes}`);

        const nodes = await prisma.node.findMany({ take: 5 });
        nodes.forEach(n => console.log(` - Node: ${n.id}, Status: ${n.status}, Trust: ${n.trustScore}`));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkStatus();
