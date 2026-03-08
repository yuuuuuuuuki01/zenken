import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const db = new PrismaClient();

async function main() {
    console.log('Starting migration to generate securePortalHash for existing users...');

    const users = await db.user.findMany({
        where: { securePortalHash: null }
    });

    console.log(`Found ${users.length} users needing a hash.`);

    let updatedCount = 0;
    for (const user of users) {
        let hash = '';
        let isUnique = false;

        while (!isUnique) {
            hash = crypto.randomBytes(32).toString('base64url');
            const existing = await db.user.findUnique({ where: { securePortalHash: hash } });
            if (!existing) {
                isUnique = true;
            }
        }

        await db.user.update({
            where: { id: user.id },
            data: { securePortalHash: hash }
        });
        updatedCount++;
        console.log(`Updated user ${user.email} with hash.`);
    }

    console.log(`Migration complete. Updated ${updatedCount} users.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await db.$disconnect();
    });
