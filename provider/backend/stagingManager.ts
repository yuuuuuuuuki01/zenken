import fs from 'fs';
import path from 'path';

export interface StagedFile {
    path: string;
    content: string;
}

export class StagingManager {
    private stagingDir: string;

    constructor(baseDir: string) {
        this.stagingDir = path.resolve(baseDir, '.gigacompute/staging');
        this.ensureDir(this.stagingDir);
    }

    private ensureDir(dir: string) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * ワーカーからの成果物を Staging 領域に展開する
     */
    async stageResult(taskId: string, files: StagedFile[]): Promise<string> {
        // [Security Fix] replace() でサニタイズすると ../secret→secret になりthrowされない
        // 正しくは: 正規化後に絶対パスが stagingDir 外を指していれば即 throw する
        const taskDir = path.join(this.stagingDir, path.normalize(taskId));
        const absoluteStagingDir = path.resolve(this.stagingDir) + path.sep;
        const absoluteTaskDir = path.resolve(taskDir);

        if (!absoluteTaskDir.startsWith(absoluteStagingDir)) {
            const msg = `Invalid taskId (Security Violation): "${taskId}" escapes staging boundary`;
            console.error(`[StagingManager] 🚨 SECURITY ALERT: ${msg}`);
            throw new Error(msg);
        }

        this.ensureDir(taskDir);
        console.log(`[StagingManager] Created task directory: ${taskDir}`);

        for (const file of files) {
            // セキュリティパッチ (Phase 27): パス・サニタイズ
            // 悪意ある "../" を含むパスを排除し、taskDir 内に収まることを保証する
            const normalizedRelativePath = path.normalize(file.path).replace(/^(\.\.(\/|\\|$))+/, '');
            const filePath = path.join(taskDir, normalizedRelativePath);

            // 境界チェックの厳密化: taskDir にセパレータを付与して比較することで
            // "../staging-secret" のような部分一致による脱出を防止する
            const absoluteTaskDir = path.resolve(taskDir) + path.sep;
            const absoluteFilePath = path.resolve(filePath);

            if (!absoluteFilePath.startsWith(absoluteTaskDir)) {
                console.error(`[StagingManager] SECURITY ALERT: Attempted directory traversal detected! Path: ${file.path}`);
                continue;
            }

            const parentDir = path.dirname(filePath);
            this.ensureDir(parentDir);

            console.log(`[StagingManager] Writing file: ${filePath} (${file.content.length} bytes)`);
            fs.writeFileSync(filePath, file.content);

            if (fs.existsSync(filePath)) {
                console.log(`[StagingManager] Successfully verified file creation: ${filePath}`);
            } else {
                console.error(`[StagingManager] Failed to verify file creation: ${filePath}`);
            }
        }

        console.log(`[StagingManager] Task ${taskId} staging complete.`);
        return taskDir;
    }

    /**
     * Staging 領域のファイルを本番環境へマージする
     * @param taskId 
     * @param targetBaseDir 本番環境のベースディレクトリ (c:/agent 等)
     */
    async mergeTask(taskId: string, targetBaseDir: string): Promise<void> {
        const taskDir = path.join(this.stagingDir, taskId);
        if (!fs.existsSync(taskDir)) {
            throw new Error(`Staging directory for task ${taskId} not found.`);
        }

        const files = this.getAllFiles(taskDir);
        const absoluteTargetDir = path.resolve(targetBaseDir) + path.sep;

        for (const relativePath of files) {
            const sourcePath = path.join(taskDir, relativePath);
            const destPath = path.join(targetBaseDir, relativePath);
            const absoluteDestPath = path.resolve(destPath);

            // トラバーサル・上書き防御
            if (!absoluteDestPath.startsWith(absoluteTargetDir)) {
                console.error(`[StagingManager] SECURITY ALERT: Merge traversal blocked! Path: ${relativePath}`);
                continue;
            }

            // 本番環境のディレクトリ作成
            this.ensureDir(path.dirname(destPath));

            // ファイルのコピー (マージ)
            fs.copyFileSync(sourcePath, destPath);
            console.log(`[Staging] Merged: ${relativePath}`);
        }

        // マージ後に Staging 領域を削除（クリーンアップ）
        fs.rmSync(taskDir, { recursive: true, force: true });
        console.log(`[Staging] Task ${taskId} merge complete.`);
    }

    private getAllFiles(dir: string, baseDir: string = dir): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(this.getAllFiles(filePath, baseDir));
            } else {
                results.push(path.relative(baseDir, filePath));
            }
        }
        return results;
    }

    getPendingTasks(): string[] {
        if (!fs.existsSync(this.stagingDir)) return [];
        return fs.readdirSync(this.stagingDir).filter(f =>
            fs.statSync(path.join(this.stagingDir, f)).isDirectory()
        );
    }
}
