<?php
/**
 * PHP + SQLite 环境检测
 * 上传服务器后可先访问：api/health.php
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

$config = app_config();
$dbDir = dirname($config['db_path']);
$backupDir = $config['backup_dir'];

$checks = [
    'php_version' => PHP_VERSION,
    'pdo_loaded' => extension_loaded('pdo'),
    'pdo_sqlite_loaded' => extension_loaded('pdo_sqlite'),
    'sqlite3_loaded' => extension_loaded('sqlite3'),
    'database_directory' => $dbDir,
    'database_directory_exists' => is_dir($dbDir),
    'database_directory_writable' => is_dir($dbDir) ? is_writable($dbDir) : is_writable(dirname($dbDir)),
    'database_path' => $config['db_path'],
    'backup_directory' => $backupDir,
    'backup_directory_exists' => is_dir($backupDir),
    'backup_directory_writable' => is_dir($backupDir) ? is_writable($backupDir) : is_writable(dirname($backupDir)),
];

$success = $checks['pdo_loaded']
    && $checks['pdo_sqlite_loaded']
    && $checks['database_directory_writable']
    && $checks['backup_directory_writable'];

send_json([
    'success' => $success,
    'message' => $success ? 'PHP + SQLite 环境检测通过。' : '环境检测未通过，请检查 pdo_sqlite 扩展、数据库目录权限或备份目录权限。',
    'checks' => $checks,
]);
