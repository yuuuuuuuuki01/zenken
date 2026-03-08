import { getFirestore } from './utils/firebase';
import * as admin from 'firebase-admin';
import { encrypt, decrypt } from './utils/encryption';

/**
 * GigaDB: Firestore-based persistence.
 * Mimics Prisma Client API for rapid PoC and stable demos in Cloud Run.
 */

function resolveFirebaseData(data: any) {
    const resolved: any = {};
    for (const key of Object.keys(data)) {
        const val = data[key];
        if (val && typeof val === 'object' && 'increment' in val) {
            resolved[key] = admin.firestore.FieldValue.increment(val.increment);
        } else if (val && typeof val === 'object' && 'decrement' in val) {
            resolved[key] = admin.firestore.FieldValue.increment(-val.decrement);
        } else {
            resolved[key] = val;
        }
    }
    return resolved;
}

class GigaDB {
    get user() {
        return {
            findUnique: async (args: any): Promise<any> => {
                const { where } = args;
                const db = getFirestore();
                if (where.id) {
                    const doc = await db.collection('users').doc(where.id).get();
                    if (!doc.exists) return null;
                    const user = { ...doc.data(), id: doc.id } as any;
                    return {
                        ...user,
                        openAiKey: user.openAiKey ? decrypt(user.openAiKey) : user.openAiKey,
                        geminiKey: user.geminiKey ? decrypt(user.geminiKey) : user.geminiKey
                    };
                }
                if (where.email) {
                    const snapshot = await db.collection('users').where('email', '==', where.email).limit(1).get();
                    if (snapshot.empty) return null;
                    const doc = snapshot.docs[0];
                    const user = { ...doc.data(), id: doc.id } as any;
                    return {
                        ...user,
                        openAiKey: user.openAiKey ? decrypt(user.openAiKey) : user.openAiKey,
                        geminiKey: user.geminiKey ? decrypt(user.geminiKey) : user.geminiKey
                    };
                }
                return null;
            },
            findMany: async (args?: any): Promise<any[]> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('users');
                if (args?.where) {
                    for (const [key, value] of Object.entries(args.where)) {
                        if (value !== undefined) {
                            query = query.where(key, '==', value);
                        }
                    }
                }
                const snapshot = await query.get();
                return snapshot.docs.map(doc => {
                    const u = { ...doc.data(), id: doc.id } as any;
                    return {
                        ...u,
                        openAiKey: u.openAiKey ? decrypt(u.openAiKey) : u.openAiKey,
                        geminiKey: u.geminiKey ? decrypt(u.geminiKey) : u.geminiKey
                    };
                });
            },
            create: async (args: any): Promise<any> => {
                const db = getFirestore();
                const dataToSave = { ...args.data };
                if (dataToSave.openAiKey) dataToSave.openAiKey = encrypt(dataToSave.openAiKey);
                if (dataToSave.geminiKey) dataToSave.geminiKey = encrypt(dataToSave.geminiKey);

                const newUser = {
                    points: 0,
                    earningsYen: 0,
                    createdAt: new Date().toISOString(),
                    nodes: [],
                    ...dataToSave,
                };

                let docId = args.data.id;
                let docRef;
                if (docId) {
                    docRef = db.collection('users').doc(docId);
                    await docRef.set(newUser);
                } else {
                    docRef = await db.collection('users').add(newUser);
                }

                return {
                    ...newUser,
                    id: docRef.id,
                    openAiKey: args.data.openAiKey,
                    geminiKey: args.data.geminiKey
                } as any;
            },
            update: async (args: any): Promise<any> => {
                const { where, data } = args;
                const db = getFirestore();
                const updateData = resolveFirebaseData(data);
                if (updateData.openAiKey) updateData.openAiKey = encrypt(updateData.openAiKey);
                if (updateData.geminiKey) updateData.geminiKey = encrypt(updateData.geminiKey);

                const docRef = db.collection('users').doc(where.id);
                await docRef.update(updateData);
                const doc = await docRef.get();
                const updated = { ...doc.data(), id: doc.id } as any;
                return {
                    ...updated,
                    openAiKey: updated.openAiKey ? decrypt(updated.openAiKey) : updated.openAiKey,
                    geminiKey: updated.geminiKey ? decrypt(updated.geminiKey) : updated.geminiKey
                };
            },
            delete: async (args: any): Promise<any> => {
                const db = getFirestore();
                await db.collection('users').doc(args.where.id).delete();
                return { id: args.where.id };
            },
            deleteMany: async (args?: any): Promise<any> => {
                const db = getFirestore();
                const snapshot = await db.collection('users').where('email', '==', args?.where?.email).get();
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                return { count: snapshot.size };
            }
        };
    }

    get node() {
        return {
            findUnique: async (args: any): Promise<any> => {
                const { where } = args;
                const db = getFirestore();
                if (where.id) {
                    const doc = await db.collection('nodes').doc(where.id).get();
                    return doc.exists ? { ...doc.data(), id: doc.id } as any : null;
                }
                if (where.otc) {
                    const snapshot = await db.collection('nodes').where('otc', '==', where.otc).limit(1).get();
                    if (snapshot.empty) return null;
                    return { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as any;
                }
                return null;
            },
            findMany: async (args?: any): Promise<any[]> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('nodes');
                if (args?.where?.status) query = query.where('status', '==', args.where.status);
                if (args?.where?.userId) query = query.where('userId', '==', args.where.userId);
                const snapshot = await query.get();
                return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
            },
            upsert: async (args: any): Promise<any> => {
                const { where, update, create } = args;
                const db = getFirestore();
                const docRef = db.collection('nodes').doc(where.id);
                const doc = await docRef.get();

                if (doc.exists) {
                    const updateData = { ...update, lastSeenAt: new Date().toISOString() };
                    await docRef.update(updateData);
                    const updated = await docRef.get();
                    return { id: updated.id, ...updated.data() } as any;
                } else {
                    const newNode = {
                        trustScore: 50,
                        performanceScore: 50,
                        rewardPoints: 0,
                        status: 'idle',
                        createdAt: new Date().toISOString(),
                        lastSeenAt: new Date().toISOString(),
                        ...create,
                    };
                    await docRef.set(newNode);
                    return { id: where.id, ...newNode } as any;
                }
            },
            update: async (args: any): Promise<any> => {
                const { where, data } = args;
                const db = getFirestore();
                const docRef = db.collection('nodes').doc(where.id);
                const updateData = resolveFirebaseData(data);
                await docRef.update(updateData);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            delete: async (args: any): Promise<any> => {
                const db = getFirestore();
                await db.collection('nodes').doc(args.where.id).delete();
                return { id: args.where.id };
            },
            deleteMany: async (args?: any): Promise<any> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('nodes');
                if (args?.where?.ownerId) query = query.where('ownerId', '==', args.where.ownerId);
                const snapshot = await query.get();
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                return { count: snapshot.size };
            }
        };
    }

    get pointTransaction() {
        return {
            findUnique: async (args: any): Promise<any> => {
                const db = getFirestore();
                if (args.where.stripeSessionId) {
                    const snapshot = await db.collection('transactions').where('stripeSessionId', '==', args.where.stripeSessionId).limit(1).get();
                    if (snapshot.empty) return null;
                    return { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as any;
                }
                if (args.where.id) {
                    const doc = await db.collection('transactions').doc(args.where.id).get();
                    return doc.exists ? { ...doc.data(), id: doc.id } as any : null;
                }
                return null;
            },
            findMany: async (args: any): Promise<any[]> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('transactions');
                if (args?.where?.userId) query = query.where('userId', '==', args.where.userId);
                if (args?.where?.type) query = query.where('type', '==', args.where.type);
                if (args?.where?.status) query = query.where('status', '==', args.where.status);

                if (args?.orderBy?.createdAt === 'desc') {
                    query = query.orderBy('createdAt', 'desc');
                }
                if (args?.take) query = query.limit(args.take);

                const snapshot = await query.get();
                return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
            },
            create: async (args: any): Promise<any> => {
                const db = getFirestore();
                const newTx = {
                    createdAt: new Date().toISOString(),
                    ...args.data,
                };
                const docRef = await db.collection('transactions').add(newTx);

                if (args.data.type === 'WITHDRAW') {
                    // NOTE: In the new flow, earningsYen is updated only upon admin approval.
                    // The old PoC logic of incrementing here is removed.
                }
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            update: async (args: any): Promise<any> => {
                const { where, data } = args;
                const db = getFirestore();
                const docRef = db.collection('transactions').doc(where.id);
                await docRef.update(data);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            deleteMany: async (args: any): Promise<any> => {
                const db = getFirestore();
                const snapshot = await db.collection('transactions').where('userId', '==', args.where.userId).get();
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                return { count: snapshot.size };
            }
        };
    }

    get clientApiKey() {
        return {
            findFirst: async (args: any): Promise<any> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('clientApiKeys');
                if (args?.where?.userId) query = query.where('userId', '==', args.where.userId);
                if (args?.where?.key) query = query.where('key', '==', args.where.key);
                if (args?.where?.isActive !== undefined) query = query.where('isActive', '==', args.where.isActive);
                if (args?.orderBy?.createdAt) query = query.orderBy('createdAt', args.orderBy.createdAt);

                query = query.limit(1);
                const snapshot = await query.get();
                if (snapshot.empty) return null;
                return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
            },
            findMany: async (args: any): Promise<any[]> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('clientApiKeys');
                if (args?.where?.userId) query = query.where('userId', '==', args.where.userId);
                if (args?.where?.key) query = query.where('key', '==', args.where.key);
                if (args?.where?.isActive !== undefined) query = query.where('isActive', '==', args.where.isActive);
                const snapshot = await query.get();
                return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
            },
            create: async (args: any): Promise<any> => {
                const db = getFirestore();
                const newKey = {
                    createdAt: new Date().toISOString(),
                    isActive: true,
                    ...args.data
                };
                const docRef = await db.collection('clientApiKeys').add(newKey);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            update: async (args: any): Promise<any> => {
                const { where, data } = args;
                const db = getFirestore();
                // This PoC uses key as unique if id not provided. We'll search for it.
                let docId = where.id;
                if (!docId && where.key) {
                    const snap = await db.collection('clientApiKeys').where('key', '==', where.key).limit(1).get();
                    if (snap.empty) return null;
                    docId = snap.docs[0].id;
                }
                if (!docId) return null;
                const docRef = db.collection('clientApiKeys').doc(docId);
                await docRef.update(data);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            delete: async (args: any): Promise<any> => {
                const { where } = args;
                const db = getFirestore();
                let docId = where.id;
                if (!docId && where.key) {
                    const snap = await db.collection('clientApiKeys').where('key', '==', where.key).limit(1).get();
                    if (snap.empty) return null;
                    docId = snap.docs[0].id;
                }
                if (!docId) return null;
                const docRef = db.collection('clientApiKeys').doc(docId);
                const doc = await docRef.get();
                const deletedData = { id: doc.id, ...doc.data() } as any;
                await docRef.delete();
                return deletedData;
            }
        };
    }

    get clientJob() {
        return {
            findMany: async (args: any): Promise<any[]> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('clientJobs');
                if (args.where?.userId && args.where.userId !== '*') {
                    query = query.where('userId', '==', args.where.userId);
                }
                if (args.where?.status) {
                    query = query.where('status', '==', args.where.status);
                }
                if (args.orderBy) {
                    const field = Object.keys(args.orderBy)[0];
                    const order = args.orderBy[field];
                    query = query.orderBy(field, order);
                }
                if (args.take) query = query.limit(args.take);
                const snapshot = await query.get();
                return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
            },
            count: async (args: any): Promise<number> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('clientJobs');
                if (args.where?.userId && args.where.userId !== '*') {
                    query = query.where('userId', '==', args.where.userId);
                }
                if (args.where?.status && args.where.status.in) {
                    query = query.where('status', 'in', args.where.status.in);
                }
                const snapshot = await query.count().get();
                return snapshot.data().count;
            },
            aggregate: async (args: any): Promise<any> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('clientJobs');
                if (args.where?.userId && args.where.userId !== '*') {
                    query = query.where('userId', '==', args.where.userId);
                }
                const snapshot = await query.get();
                const jobs = snapshot.docs.map(doc => doc.data());
                const sumCost = jobs.reduce((acc, j) => acc + (j.cost || 0), 0);
                return { _sum: { cost: sumCost } } as any;
            },
            create: async (args: any): Promise<any> => {
                const db = getFirestore();
                const newJob = {
                    createdAt: new Date().toISOString(),
                    ...args.data
                };
                const docRef = await db.collection('clientJobs').add(newJob);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            update: async (args: any): Promise<any> => {
                const { where, data } = args;
                const db = getFirestore();
                const docRef = db.collection('clientJobs').doc(where.id);
                const updateData = resolveFirebaseData(data);
                await docRef.update(updateData);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            deleteMany: async (args: any): Promise<any> => {
                const db = getFirestore();
                const snapshot = await db.collection('clientJobs').where('userId', '==', args.where.userId).get();
                const batch = db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                return { count: snapshot.size };
            }
        };
    }

    get mockSession() {
        return {
            findUnique: async (args: any): Promise<any> => {
                const db = getFirestore();
                const doc = await db.collection('mockSessions').doc(args.where.id).get();
                return doc.exists ? doc.data() : null;
            },
            create: async (args: any): Promise<any> => {
                const db = getFirestore();
                await db.collection('mockSessions').doc(args.data.id).set(args.data);
                return args.data as any;
            },
            delete: async (args: any): Promise<any> => {
                const db = getFirestore();
                const docRef = db.collection('mockSessions').doc(args.where.id);
                const doc = await docRef.get();
                const data = doc.data();
                await docRef.delete();
                return data as any;
            }
        };
    }

    get supportTicket() {
        return {
            create: async (args: any): Promise<any> => {
                const db = getFirestore();
                const newTicket = {
                    status: 'open',
                    replies: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    ...args.data,
                };
                const docRef = await db.collection('supportTickets').add(newTicket);
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            },
            findMany: async (args?: any): Promise<any[]> => {
                const db = getFirestore();
                let query: admin.firestore.Query = db.collection('supportTickets');
                if (args?.where?.userId) query = query.where('userId', '==', args.where.userId);
                if (args?.where?.userType) query = query.where('userType', '==', args.where.userType);
                if (args?.where?.status) query = query.where('status', '==', args.where.status);
                query = query.orderBy('createdAt', 'desc');
                if (args?.take) query = query.limit(args.take);
                const snapshot = await query.get();
                return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
            },
            findUnique: async (args: any): Promise<any> => {
                const db = getFirestore();
                if (args.where.id) {
                    const doc = await db.collection('supportTickets').doc(args.where.id).get();
                    return doc.exists ? { ...doc.data(), id: doc.id } as any : null;
                }
                return null;
            },
            update: async (args: any): Promise<any> => {
                const { where, data } = args;
                const db = getFirestore();
                const docRef = db.collection('supportTickets').doc(where.id);
                await docRef.update({ ...data, updatedAt: new Date().toISOString() });
                const doc = await docRef.get();
                return { id: doc.id, ...doc.data() } as any;
            }
        };
    }

    async $transaction(queries: any[]) {
        // PoC: Firestore handles atomic updates better via FieldValue.
        // For actual transactions, this would need a rewrite. 
        // We'll execute them sequentially which is same as original PoC.
        const results = [];
        for (const q of queries) {
            results.push(await q);
        }
        return results;
    }
}

export const db = new GigaDB();
