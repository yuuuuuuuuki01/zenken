import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

async function run() {
    const email = "client@gigacompute.local";
    const newPassword = "password123";
    const passwordHash = await hashPassword(newPassword);

    try {
        await db.user.upsert({
            where: { email },
            update: { passwordHash },
            create: {
                email,
                name: "GigaCompute Client",
                passwordHash
            }
        });
        console.log(`Successfully reset password for ${email} to ${newPassword}`);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await db.$disconnect();
    }
}
run();
