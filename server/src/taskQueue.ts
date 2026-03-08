import { db } from './db';

export interface ChunkedTask {
    id: string; // Unique ID for this specific chunk task
    jobId: string; // The parent job ID from the DB
    instruction: string;
    code: string;
    languageId: string;
    chunkIndex: number;
    totalChunks: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    assignedWorkerId?: string;
    assignedAt?: number;
    result?: string;
    score?: number; // For Client-Side Evaluation
}

export interface JobProgress {
    jobId: string;
    totalChunks: number;
    completedChunks: number;
    chunks: ChunkedTask[];
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: number;
    jobCost: number;           // クライアントが支払ったトータルPTS
    workerRewardPerChunk: number; // ワーカー1チャンクあたりの報酬PTS（70%按分）
}

class TaskQueue {
    private pendingTasks: ChunkedTask[] = [];
    private activeJobs: Map<string, JobProgress> = new Map();
    // Maps workerId to the task they are currently processing
    private processingTasks: Map<string, ChunkedTask> = new Map();
    private timeoutMs: number = 60000; // Default: 60 seconds

    public setTimeout(ms: number) {
        this.timeoutMs = ms;
    }

    public getTimeout(): number {
        return this.timeoutMs;
    }

    /**
     * Enqueue a new set of chunked tasks for a Job.
     */
    public enqueueJob(jobId: string, chunksPayload: any[], jobCost: number = 5) {
        const totalChunks = chunksPayload.length || 1;
        // ワーカー報酬: ジョブコスト全体の70%をチャンク数で按分
        const WORKER_SHARE = 0.70;
        const workerRewardPerChunk = parseFloat((jobCost * WORKER_SHARE / totalChunks).toFixed(2));

        const tasks: ChunkedTask[] = chunksPayload.map((p: any, idx: number) => ({
            id: `task_${jobId}_${idx}`,
            jobId,
            instruction: p.instruction,
            code: p.code,
            languageId: p.languageId,
            chunkIndex: p.chunkIndex || idx,
            totalChunks: p.totalChunks || totalChunks,
            status: 'pending'
        }));

        this.activeJobs.set(jobId, {
            jobId,
            totalChunks: tasks.length,
            completedChunks: 0,
            chunks: tasks,
            status: 'pending',
            createdAt: Date.now(),
            jobCost,
            workerRewardPerChunk
        });

        // P5: isEdgePriority（高優先度）ジョブのチャンクをキュー先頭に挿入
        const hasEdgePriority = (chunksPayload[0] as any)?.isEdgePriority;
        if (hasEdgePriority) {
            this.pendingTasks.unshift(...tasks);
        } else {
            this.pendingTasks.push(...tasks);
        }
        console.log(`[Queue] Enqueued Job ${jobId} with ${tasks.length} chunks. Cost: ${jobCost} PTS, RewardPerChunk: ${workerRewardPerChunk} PTS`);
    }

    /**
     * Fetch the next available task for a worker.
     */
    public getNextTask(workerId: string, workerTrustScore?: number): ChunkedTask | null {
        if (this.pendingTasks.length === 0) return null;

        // 1ワーカー1タスク制限
        if (this.processingTasks.has(workerId)) {
            return null;
        }

        // P5: trustScore フィルタ — requiredTrust を満たすタスクを探す
        const trustScore = workerTrustScore ?? 50; // 未指定時はデフォルト50
        const taskIndex = this.pendingTasks.findIndex(t => {
            const job = this.activeJobs.get(t.jobId);
            // requiredTrust と trustScore は共に 0〜100 スケール
            const requiredTrust = (job as any)?.requiredTrust ?? 0;
            return trustScore >= requiredTrust;
        });

        if (taskIndex === -1) {
            console.log(`[Queue] Worker ${workerId} (trust: ${trustScore}) has no eligible tasks.`);
            return null;
        }

        const task = this.pendingTasks.splice(taskIndex, 1)[0];
        task.status = 'processing';
        task.assignedWorkerId = workerId;
        task.assignedAt = Date.now();

        this.processingTasks.set(workerId, task);

        // Update Job status
        const job = this.activeJobs.get(task.jobId);
        if (job) job.status = 'processing';

        console.log(`[Queue] Assigned task ${task.id} to worker ${workerId} (trust: ${trustScore})`);
        return task;
    }

    /**
     * Submit a result for a task.
     */
    /**
     * タスク結果を提出する。
     * @returns 成功時にジョブ情報（workerRewardPerChunk含む）、失敗時にnull
     */
    public submitResult(workerId: string, taskId: string, result: string): JobProgress | null {
        const task = this.processingTasks.get(workerId);
        if (!task || task.id !== taskId) {
            console.error(`[Queue] Invalid result submission for task ${taskId} by worker ${workerId}`);
            return null;
        }

        task.status = 'completed';
        task.result = result;
        this.processingTasks.delete(workerId);

        const job = this.activeJobs.get(task.jobId);
        if (job) {
            job.completedChunks++;
            console.log(`[Queue] Job ${job.jobId} progress: ${job.completedChunks}/${job.totalChunks} | RewardThisChunk: ${job.workerRewardPerChunk} PTS`);

            if (job.completedChunks >= job.totalChunks) {
                job.status = 'completed';
                console.log(`[Queue] Job ${job.jobId} FULLY COMPLETED! Merging results...`);

                // Sort chunks by index to reconstruct original source ordering
                job.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

                const mergedResult = job.chunks.map(c =>
                    `/* --- Chunk ${c.chunkIndex + 1}/${job.totalChunks} --- */\n${c.result}`
                ).join('\n\n');

                console.log(`[Queue] Merge successful. Updating DB for job ${job.jobId}...`);

                db.clientJob.update({
                    where: { id: job.jobId },
                    data: {
                        status: 'completed',
                        result: mergedResult
                    }
                }).then(() => {
                    console.log(`[Queue] DB updated for job ${job.jobId}`);
                    this.activeJobs.delete(job.jobId);
                }).catch((e: any) => {
                    console.error(`[Queue] Failed to update DB for job ${job.jobId}:`, e);
                });
            }
            return job; // 呼び出し元が workerRewardPerChunk を使って報酬付与できるよう返却
        }
        return null;
    }

    /**
     * Re-queue tasks that have timed out.
     */
    public checkTimeouts(customTimeoutMs?: number) {
        const now = Date.now();
        const timeout = customTimeoutMs || this.timeoutMs;
        for (const [workerId, task] of this.processingTasks.entries()) {
            if (task.assignedAt && (now - task.assignedAt > timeout)) {
                console.log(`[Queue] Task ${task.id} timed out for worker ${workerId}. Re-queuing.`);
                task.status = 'pending';
                task.assignedWorkerId = undefined;
                task.assignedAt = undefined;
                this.pendingTasks.push(task);
                this.processingTasks.delete(workerId);

                const job = this.activeJobs.get(task.jobId);
                if (job && job.completedChunks === 0) {
                    const activeChunks = Array.from(this.processingTasks.values()).filter(t => t.jobId === task.jobId).length;
                    if (activeChunks === 0) {
                        job.status = 'pending';
                    }
                }
            }
        }
    }

    // Export internal state for debugging/dashboard
    public getQueueStatus() {
        return {
            pending: this.pendingTasks.length,
            processing: this.processingTasks.size,
            activeJobs: this.activeJobs.size
        };
    }

    public getJobStatus(jobId: string) {
        return this.activeJobs.get(jobId) || null;
    }
}

export const globalQueue = new TaskQueue();
