<?php
/**
 * 手动初始化/重置数据库入口
 * ------------------------------------------------------------
 * 上传到 PHP 服务器后，如果需要重新写入默认模板，可临时访问：
 * api/seed.php?token=change-this-token
 * 使用完成后，建议删除本文件或修改 token。
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

$token = 'change-this-token';
if (($_GET['token'] ?? '') !== $token) {
    send_json(['success' => false, 'message' => 'token 不正确，已拒绝执行。'], 403);
}

try {
    $pdo = open_database();
    replace_all_records($pdo, load_default_records_data());
    send_json([
        'success' => true,
        'message' => 'SQLite 数据库已按默认模板初始化。',
        'recordsData' => fetch_records_data($pdo, true),
    ]);
} catch (Throwable $e) {
    send_json(['success' => false, 'message' => $e->getMessage()], 500);
}
