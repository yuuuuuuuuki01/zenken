import { db } from './db';
import { generateToken } from './auth';

async function verifyAllFlows() {
    console.log('--- GigaCompute Integration Verification ---');

    const testEmail = `test_${Date.now()}@example.com`;
    const testNodeId = `test_node_${Date.now()}`;
    let userId = '';

    try {
        // 1. ユーザー作成
        console.log('[Step 1] Creating test user...');
        const user = await db.user.create({
            data: {
                email: testEmail,
                name: 'Test User',
                passwordHash: 'dummy_hash',
                points: 0
            }
        });
        userId = user.id;
        console.log(`Successfully created user: ${userId} (${testEmail})`);

        // 2. トークン生成とノード紐付け
        console.log('[Step 2] Simulating node pairing...');
        const pairingToken = generateToken({ userId });
        console.log(`Generated pairing token: ${pairingToken.substring(0, 10)}...`);

        // Simulate behavior in index.ts wss.on('connection')
        await db.node.upsert({
            where: { id: testNodeId },
            update: { ownerId: userId, status: 'idle' },
            create: {
                id: testNodeId,
                type: 'agent',
                ownerId: userId,
                status: 'idle',
                performanceScore: 80
            }
        });

        const pairedNode = await db.node.findUnique({ where: { id: testNodeId } });
        if (pairedNode?.ownerId === userId) {
            console.log(`Successfully paired node ${testNodeId} to user ${userId}`);
        } else {
            throw new Error('Node pairing failed');
        }

        // 3. 報酬付与 (Worker Result simulation)
        console.log('[Step 3] Granting reward...');
        const rewardAmount = 50.5;
        await db.user.update({
            where: { id: userId },
            data: { points: { increment: rewardAmount } }
        });

        const userAfterReward = await db.user.findUnique({ where: { id: userId } });
        console.log(`User points after reward: ${userAfterReward?.points} (Expected: ${rewardAmount})`);
        if (userAfterReward?.points !== rewardAmount) throw new Error('Reward granting failed');

        // 4. 出金申請 (Withdrawal request)
        console.log('[Step 4] Creating withdrawal request...');
        const withdrawAmount = 20;
        const destination = 'Test Wallet Address';

        await db.$transaction([
            db.user.update({
                where: { id: userId },
                data: { points: { decrement: withdrawAmount } }
            }),
            db.pointTransaction.create({
                data: {
                    userId,
                    type: 'WITHDRAW',
                    amount: withdrawAmount,
                    status: 'pending',
                    description: `Requested to: ${destination}`
                }
            })
        ]);

        const userAfterWithdraw = await db.user.findUnique({ where: { id: userId } });
        console.log(`User points after withdrawal: ${userAfterWithdraw?.points} (Expected: ${rewardAmount - withdrawAmount})`);

        const txs = await db.pointTransaction.findMany({
            where: { userId }
        });
        const tx = txs.find(t => t.type === 'WITHDRAW');
        if (tx && tx.amount === withdrawAmount) {
            console.log(`Withdrawal transaction recorded: ${tx.id}`);
        } else {
            throw new Error('Withdrawal recording failed');
        }

        // 5. クライアントジョブ投入
        console.log('[Step 5] Submitting client job...');
        const jobCost = 10;
        await db.$transaction([
            db.clientJob.create({
                data: {
                    type: 'custom_task',
                    payload: '{"test":true}',
                    cost: jobCost,
                    userId,
                    status: 'pending'
                }
            }),
            db.user.update({
                where: { id: userId },
                data: { points: { decrement: jobCost } }
            })
        ]);

        const jobs = await db.clientJob.findMany({ where: { userId } });
        const job = jobs[0];
        if (job) {
            console.log(`Client job recorded: ${job.id}, Cost: ${job.cost}`);
        } else {
            throw new Error('Job recording failed');
        }

        // 6. 管理者 API の視点での確認 (findMany)
        console.log('[Step 6] Verifying admin visibility...');
        const allUsers = await db.user.findMany({});
        const allNodes = await db.node.findMany({});
        const allJobs = await db.clientJob.findMany({});
        const allTxs = await db.pointTransaction.findMany({});

        console.log(`Admin can see: ${allUsers.length} users, ${allNodes.length} nodes, ${allJobs.length} jobs, ${allTxs.length} transactions`);

        if (allUsers.some(u => u.id === userId) &&
            allNodes.some(n => n.id === testNodeId) &&
            allJobs.some(j => j.userId === userId) &&
            allTxs.some(t => t.userId === userId)) {
            console.log('Verification Success: All data is persistent and visible to Admin.');
        } else {
            throw new Error('Admin visibility verification failed');
        }

    } catch (err) {
        console.error('Verification Error:', err);
    } finally {
        // Clean up
        console.log('Cleaning up test data...');
        if (userId) {
            await db.pointTransaction.deleteMany({ where: { userId } }).catch(() => { });
            await db.clientJob.deleteMany({ where: { userId } }).catch(() => { });
            await db.node.deleteMany({ where: { ownerId: userId } }).catch(() => { });
            await db.user.delete({ where: { id: userId } }).catch(() => { });
            console.log('Cleanup complete.');
        }
    }
}

verifyAllFlows();
