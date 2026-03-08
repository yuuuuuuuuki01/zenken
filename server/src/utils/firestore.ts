import { getFirestore } from './firebase';
import * as admin from 'firebase-admin'; // FieldValue 等のために残す
import { NodeInfo, ActiveTaskState } from '../../shared/src/index';

/**
 * Firestore Service for Real-time Fleet Synchronization
 */
export const firestoreService = {
    /**
     * Update node status and performance metrics in Firestore
     */
    async updateNode(nodeId: string, info: NodeInfo) {
        try {
            const db = getFirestore();
            await db.collection('nodes').doc(nodeId).set({
                ...info,
                lastSeen: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('[Firestore] Error updating node:', error);
        }
    },

    /**
     * Remove node from registry (e.g., on disconnect)
     */
    async removeNode(nodeId: string) {
        try {
            const db = getFirestore();
            await db.collection('nodes').doc(nodeId).delete();
        } catch (error) {
            console.error('[Firestore] Error removing node:', error);
        }
    },

    /**
     * Update task progress and state
     */
    async updateTask(taskId: string, state: ActiveTaskState) {
        try {
            const db = getFirestore();
            await db.collection('activeTasks').doc(taskId).set({
                ...state,
                lastUpdate: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('[Firestore] Error updating task:', error);
        }
    },

    /**
     * Remove task after completion or timeout
     */
    async removeTask(taskId: string) {
        try {
            const db = getFirestore();
            await db.collection('activeTasks').doc(taskId).delete();
        } catch (error) {
            console.error('[Firestore] Error removing task:', error);
        }
    },

    /**
     * Get system versioning info
     */
    async getVersion() {
        try {
            const db = getFirestore();
            const doc = await db.collection('system').doc('versioning').get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('[Firestore] Error getting version:', error);
            return null;
        }
    },

    /**
     * Update system versioning info
     */
    async updateVersion(versionData: any) {
        try {
            const db = getFirestore();
            await db.collection('system').doc('versioning').set({
                ...versionData,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.error('[Firestore] Error updating version:', error);
        }
    },

    /**
     * Get all documents in a collection
     */
    async getCollection(collectionName: string): Promise<any[]> {
        try {
            const db = getFirestore();
            const snapshot = await db.collection(collectionName).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`[Firestore] Error getting collection ${collectionName}:`, error);
            return [];
        }
    }
};
