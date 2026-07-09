<?php
/**
 * 网站运维工作记录表 - 统一接口
 * ------------------------------------------------------------
 * GET  api/records.php?action=all              获取全部数据
 * GET  api/records.php?action=export           导出 JSON 备份到本地
 * GET  api/records.php?action=backups          获取服务器端备份列表
 * GET  api/records.php?action=download_backup  下载服务器端备份
 * POST api/records.php?action=create           新增记录
 * POST api/records.php?action=update           更新记录
 * POST api/records.php?action=delete           删除记录
 * POST api/records.php?action=import           导入 JSON 备份并覆盖数据库
 * POST api/records.php?action=reset            恢复默认模板
 * POST api/records.php?action=backup           生成服务器端备份
 * POST api/records.php?action=restore_backup   从服务器端备份恢复
 * POST api/records.php?action=delete_backup    删除服务器端备份
 */

declare(strict_types=1);

require __DIR__ . '/db.php';

try {
    $pdo = open_database();
    $config = app_config();
    $action = (string) ($_GET['action'] ?? 'all');

    if ($action === 'all') {
        send_json([
            'success' => true,
            'version' => $config['app_version'],
            'recordsData' => fetch_records_data($pdo, true),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'export') {
        $payload = build_export_payload($pdo, 'manual-download');
        $filename = $config['backup_file_prefix'] . gmdate('Ymd-His') . '.json';
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo json_encode($payload, JSON_PRETTY_PRINT | json_flags());
        exit;
    }

    if ($action === 'backups') {
        send_json([
            'success' => true,
            'backups' => list_server_backups(),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'download_backup') {
        $filename = (string) ($_GET['filename'] ?? '');
        $path = safe_backup_path($filename);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . basename($path) . '"');
        readfile($path);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json(['success' => false, 'message' => '该操作需要使用 POST 请求。'], 405);
    }

    $body = read_json_body();

    if ($action === 'create') {
        $tableKey = trim((string) ($body['tableKey'] ?? ''));
        $row = $body['row'] ?? null;

        if ($tableKey === '' || !is_array($row)) {
            throw new RuntimeException('新增记录缺少 tableKey 或 row。');
        }

        $rowId = insert_record($pdo, $tableKey, $row);
        send_json([
            'success' => true,
            'message' => '记录已新增。',
            'rowId' => $rowId,
            'recordsData' => fetch_records_data($pdo, true),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'update') {
        $tableKey = trim((string) ($body['tableKey'] ?? ''));
        $rowId = isset($body['rowId']) ? (int) $body['rowId'] : null;
        $rowIndex = isset($body['rowIndex']) ? (int) $body['rowIndex'] : null;
        $row = $body['row'] ?? null;

        if ($tableKey === '' || !is_array($row)) {
            throw new RuntimeException('更新记录缺少 tableKey 或 row。');
        }

        update_record($pdo, $tableKey, $rowId, $rowIndex, $row);
        send_json([
            'success' => true,
            'message' => '记录已更新。',
            'recordsData' => fetch_records_data($pdo, true),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'delete') {
        $tableKey = trim((string) ($body['tableKey'] ?? ''));
        $rowId = isset($body['rowId']) ? (int) $body['rowId'] : null;
        $rowIndex = isset($body['rowIndex']) ? (int) $body['rowIndex'] : null;

        if ($tableKey === '') {
            throw new RuntimeException('删除记录缺少 tableKey。');
        }

        delete_record($pdo, $tableKey, $rowId, $rowIndex);
        send_json([
            'success' => true,
            'message' => '记录已删除。',
            'recordsData' => fetch_records_data($pdo, true),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'import') {
        $recordsData = $body['recordsData'] ?? ($body['data'] ?? null);
        if (!is_array($recordsData)) {
            throw new RuntimeException('导入数据缺少 recordsData。');
        }

        $backup = create_server_backup($pdo, 'before-import');
        replace_all_records($pdo, $recordsData);
        send_json([
            'success' => true,
            'message' => '备份已导入数据库。导入前已自动生成服务器端备份。',
            'autoBackup' => $backup,
            'recordsData' => fetch_records_data($pdo, true),
            'backups' => list_server_backups(),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'reset') {
        $backup = create_server_backup($pdo, 'before-reset');
        replace_all_records($pdo, load_default_records_data());
        send_json([
            'success' => true,
            'message' => '已恢复默认模板。恢复前已自动生成服务器端备份。',
            'autoBackup' => $backup,
            'recordsData' => fetch_records_data($pdo, true),
            'backups' => list_server_backups(),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'backup') {
        $reason = trim((string) ($body['reason'] ?? 'manual'));
        $backup = create_server_backup($pdo, $reason);
        send_json([
            'success' => true,
            'message' => '服务器端备份已生成。',
            'backup' => $backup,
            'backups' => list_server_backups(),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'restore_backup') {
        $filename = trim((string) ($body['filename'] ?? ''));
        if ($filename === '') {
            throw new RuntimeException('恢复备份缺少 filename。');
        }

        $backupBeforeRestore = create_server_backup($pdo, 'before-restore');
        $recordsData = load_backup_records_data($filename);
        replace_all_records($pdo, $recordsData);

        send_json([
            'success' => true,
            'message' => '已从服务器端备份恢复。恢复前已自动备份当前数据库。',
            'autoBackup' => $backupBeforeRestore,
            'recordsData' => fetch_records_data($pdo, true),
            'backups' => list_server_backups(),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    if ($action === 'delete_backup') {
        $filename = trim((string) ($body['filename'] ?? ''));
        if ($filename === '') {
            throw new RuntimeException('删除备份缺少 filename。');
        }

        delete_server_backup($filename);
        send_json([
            'success' => true,
            'message' => '服务器端备份已删除。',
            'backups' => list_server_backups(),
            'meta' => fetch_records_meta($pdo),
        ]);
    }

    send_json(['success' => false, 'message' => '未知操作：' . $action], 400);
} catch (Throwable $e) {
    send_json([
        'success' => false,
        'message' => $e->getMessage(),
    ], 500);
}
