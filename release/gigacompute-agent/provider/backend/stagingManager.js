"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StagingManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class StagingManager {
    stagingDir;
    constructor(baseDir) {
        this.stagingDir = path_1.default.resolve(baseDir, '.gigacompute/staging');
        this.ensureDir(this.stagingDir);
    }
    ensureDir(dir) {
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
    }
    /**
     * ワーカーからの成果物を Staging 領域に展開する
     */
    async stageResult(taskId, files) {
        // [Security Fix] replace() でサニタイズすると ../secret→secret になりthrowされない
        // 正しくは: 正規化後に絶対パスが stagingDir 外を指していれば即 throw する
        const taskDir = path_1.default.join(this.stagingDir, path_1.default.normalize(taskId));
        const absoluteStagingDir = path_1.default.resolve(this.stagingDir) + path_1.default.sep;
        const absoluteTaskDir = path_1.default.resolve(taskDir);
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
            const normalizedRelativePath = path_1.default.normalize(file.path).replace(/^(\.\.(\/|\\|$))+/, '');
            const filePath = path_1.default.join(taskDir, normalizedRelativePath);
            // 境界チェックの厳密化: taskDir にセパレータを付与して比較することで
            // "../staging-secret" のような部分一致による脱出を防止する
            const absoluteTaskDir = path_1.default.resolve(taskDir) + path_1.default.sep;
            const absoluteFilePath = path_1.default.resolve(filePath);
            if (!absoluteFilePath.startsWith(absoluteTaskDir)) {
                console.error(`[StagingManager] SECURITY ALERT: Attempted directory traversal detected! Path: ${file.path}`);
                continue;
            }
            const parentDir = path_1.default.dirname(filePath);
            this.ensureDir(parentDir);
            console.log(`[StagingManager] Writing file: ${filePath} (${file.content.length} bytes)`);
            fs_1.default.writeFileSync(filePath, file.content);
            if (fs_1.default.existsSync(filePath)) {
                console.log(`[StagingManager] Successfully verified file creation: ${filePath}`);
            }
            else {
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
    async mergeTask(taskId, targetBaseDir) {
        const taskDir = path_1.default.join(this.stagingDir, taskId);
        if (!fs_1.default.existsSync(taskDir)) {
            throw new Error(`Staging directory for task ${taskId} not found.`);
        }
        const files = this.getAllFiles(taskDir);
        const absoluteTargetDir = path_1.default.resolve(targetBaseDir) + path_1.default.sep;
        for (const relativePath of files) {
            const sourcePath = path_1.default.join(taskDir, relativePath);
            const destPath = path_1.default.join(targetBaseDir, relativePath);
            const absoluteDestPath = path_1.default.resolve(destPath);
            // トラバーサル・上書き防御
            if (!absoluteDestPath.startsWith(absoluteTargetDir)) {
                console.error(`[StagingManager] SECURITY ALERT: Merge traversal blocked! Path: ${relativePath}`);
                continue;
            }
            // 本番環境のディレクトリ作成
            this.ensureDir(path_1.default.dirname(destPath));
            // ファイルのコピー (マージ)
            fs_1.default.copyFileSync(sourcePath, destPath);
            console.log(`[Staging] Merged: ${relativePath}`);
        }
        // マージ後に Staging 領域を削除（クリーンアップ）
        fs_1.default.rmSync(taskDir, { recursive: true, force: true });
        console.log(`[Staging] Task ${taskId} merge complete.`);
    }
    getAllFiles(dir, baseDir = dir) {
        let results = [];
        const list = fs_1.default.readdirSync(dir);
        for (const file of list) {
            const filePath = path_1.default.join(dir, file);
            const stat = fs_1.default.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(this.getAllFiles(filePath, baseDir));
            }
            else {
                results.push(path_1.default.relative(baseDir, filePath));
            }
        }
        return results;
    }
    getPendingTasks() {
        if (!fs_1.default.existsSync(this.stagingDir))
            return [];
        return fs_1.default.readdirSync(this.stagingDir).filter(f => fs_1.default.statSync(path_1.default.join(this.stagingDir, f)).isDirectory());
    }
}
exports.StagingManager = StagingManager;
