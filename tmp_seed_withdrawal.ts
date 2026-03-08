import { GigaDB } from './server/src/db';

async function test() {
    const db = new GigaDB();
    const workerId = 'worker-demo';

    console.log('--- Step 1: Create a pending withdrawal request ---');
    const tx = await db.pointTransaction.create({
        data: {
            userId: workerId,
            type: 'WITHDRAW',
            amount: 5000,
            status: 'pending',
            description: 'Test withdrawal to Bank A'
        }
    });
    console.log('Created pending transaction:', tx.id);

    // Note: To test the actual API, we would need the server running.
    // Here we just verify the DB state or provide instructions for manual test.
    console.log('\n--- Test Instructions ---');
    console.log('1. Start the server: npm run dev (in server dir)');
    console.log('2. Open Admin Panel: http://localhost:3000/admin');
    console.log('3. Go to "出金管理" tab.');
    console.log('4. You should see the transaction:', tx.id);
    console.log('5. Clicking "Approve" should update earningsYen and set status to completed.');
}

test().catch(console.error);
