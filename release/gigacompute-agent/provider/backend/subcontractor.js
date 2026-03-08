"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubcontractorManager = void 0;
class SubcontractorManager {
    subnodes = new Map();
    constructor() {
        // Initialize with some mock subnodes for PoC
        this.registerSubnode('iphone-15-pro', 'smartphone');
        this.registerSubnode('pixel-8-worker', 'smartphone');
        this.registerSubnode('raspi-iot-01', 'iot');
    }
    registerSubnode(id, type) {
        this.subnodes.set(id, { id, type, status: 'idle', lastSeen: Date.now() });
    }
    getSubnodes() {
        return Array.from(this.subnodes.values());
    }
    // Determine if a task should be delegated
    shouldDelegate(task) {
        // [FIX] PoC: Only trigger cascading delegation for specific dummy/test workloads to avoid polluting real Wasm results.
        return !!task.isCascadingTest;
    }
    async delegate(task) {
        const available = this.getSubnodes().find(n => n.status === 'idle');
        if (!available) {
            throw new Error("No available subcontractors for delegation.");
        }
        console.log(`[Cascading] Delegating task ${task.taskId} to subnode: ${available.id} (${available.type})`);
        available.status = 'busy';
        // Simulate subnode processing delay
        await new Promise(r => setTimeout(r, 1000));
        available.status = 'idle';
        available.lastSeen = Date.now();
        return {
            taskId: task.taskId,
            status: 'success',
            result: `Sub-result from Cascading Node ${available.id}`,
            workerId: available.id
        };
    }
}
exports.SubcontractorManager = SubcontractorManager;
