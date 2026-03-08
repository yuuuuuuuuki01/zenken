import pino from 'pino';

// BQ_ENABLED が true の場合はピュアな JSON を出力 (Cloud Logging / BigQuery 連携用)
// false の場合は開発環境向けに読みやすいテキスト形式で出力 (pino-pretty)
const isProductionLog = process.env.NODE_ENV === 'production' || process.env.BQ_ENABLED === 'true';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // 開発時は読みやすく、本番・BigQuery連携時はJSON出力
    ...(isProductionLog ? {} : {
        transport: {
            target: 'pino-pretty',
            options: { colorize: true }
        }
    }),
    base: {
        env: process.env.NODE_ENV || 'development',
    },
});

// BigQuery連携用の専用イベントロギング関数
export const bqLog = {
    taskCompleted: (jobId: string, taskId: string, cost: number, nodeId: string) => {
        if (process.env.BQ_ENABLED !== 'true') return;
        logger.info({
            event_type: 'TASK_COMPLETED',
            job_id: jobId,
            task_id: taskId,
            cost: cost,
            node_id: nodeId,
            timestamp: new Date().toISOString()
        });
    },
    nodeConnected: (nodeId: string, trustScore: number) => {
        if (process.env.BQ_ENABLED !== 'true') return;
        logger.info({
            event_type: 'NODE_CONNECTED',
            node_id: nodeId,
            trust_score: trustScore,
            timestamp: new Date().toISOString()
        });
    },
    deposit: (userId: string, amount: number) => {
        if (process.env.BQ_ENABLED !== 'true') return;
        logger.info({
            event_type: 'DEPOSIT',
            user_id: userId,
            amount: amount,
            timestamp: new Date().toISOString()
        });
    }
};
