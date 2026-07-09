<?php
/**
 * 网站运维工作记录表 - SQLite 数据库工具函数
 */

declare(strict_types=1);

function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/config.php';
    }
    return $config;
}

function json_flags(): int
{
    return JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
}

function send_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, json_flags());
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('请求数据不是有效的 JSON。');
    }

    return $decoded;
}

function open_database(): PDO
{
    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('PHP 未启用 pdo_sqlite 扩展，请先在服务器中开启 PDO SQLite。');
    }

    $config = app_config();
    $dbPath = $config['db_path'];
    $dbDir = dirname($dbPath);

    if (!is_dir($dbDir) && !mkdir($dbDir, 0775, true) && !is_dir($dbDir)) {
        throw new RuntimeException('无法创建数据库目录：' . $dbDir);
    }

    if (!is_writable($dbDir)) {
        throw new RuntimeException('数据库目录不可写，请检查权限：' . $dbDir);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $pdo->exec('PRAGMA foreign_keys = ON');
    initialize_database($pdo);

    return $pdo;
}

function initialize_database(PDO $pdo): void
{
    $config = app_config();
    $schemaPath = $config['schema_path'];

    if (!is_file($schemaPath)) {
        throw new RuntimeException('找不到数据库结构文件：' . $schemaPath);
    }

    $schema = file_get_contents($schemaPath);
    if ($schema === false) {
        throw new RuntimeException('无法读取数据库结构文件。');
    }

    $pdo->exec($schema);

    $count = (int) $pdo->query('SELECT COUNT(*) FROM record_tables')->fetchColumn();
    if ($count === 0) {
        replace_all_records($pdo, load_default_records_data());
    }
}

function load_default_records_data(): array
{
    $config = app_config();
    $path = $config['default_data_path'];

    if (!is_file($path)) {
        throw new RuntimeException('找不到默认数据文件：' . $path);
    }

    $json = file_get_contents($path);
    if ($json === false) {
        throw new RuntimeException('无法读取默认数据文件。');
    }

    $data = json_decode($json, true);
    if (!is_array($data)) {
        throw new RuntimeException('默认数据文件不是有效的 JSON。');
    }

    return normalize_records_data($data);
}

function normalize_records_data(array $recordsData): array
{
    $normalized = [];

    foreach ($recordsData as $tableKey => $table) {
        if (!is_string($tableKey) || trim($tableKey) === '') {
            throw new RuntimeException('表格编号不能为空。');
        }
        if (!is_array($table)) {
            throw new RuntimeException("表格 {$tableKey} 的数据格式不正确。");
        }
        if (!isset($table['columns']) || !is_array($table['columns'])) {
            throw new RuntimeException("表格 {$tableKey} 缺少 columns 字段。");
        }
        if (!isset($table['rows']) || !is_array($table['rows'])) {
            throw new RuntimeException("表格 {$tableKey} 缺少 rows 字段。");
        }

        $columns = array_values(array_filter($table['columns'], static function ($column): bool {
            return is_array($column) && isset($column['key']) && trim((string) $column['key']) !== '';
        }));

        $rows = [];
        foreach ($table['rows'] as $row) {
            if (!is_array($row)) {
                continue;
            }
            unset($row['__id'], $row['_dbId']);
            $rows[] = $row;
        }

        $normalized[$tableKey] = [
            'title' => (string) ($table['title'] ?? $tableKey),
            'menuTitle' => (string) ($table['menuTitle'] ?? ($table['title'] ?? $tableKey)),
            'description' => (string) ($table['description'] ?? ''),
            'note' => (string) ($table['note'] ?? ''),
            'columns' => $columns,
            'rows' => $rows,
        ];
    }

    ksort($normalized, SORT_NATURAL);
    return $normalized;
}

function now_text(): string
{
    return gmdate('Y-m-d H:i:s');
}

function encode_json_value($value): string
{
    $json = json_encode($value, json_flags());
    if ($json === false) {
        throw new RuntimeException('JSON 编码失败。');
    }
    return $json;
}

function get_record_code(array $row): ?string
{
    $value = $row['recordId'] ?? $row['recordID'] ?? $row['id'] ?? null;
    $text = trim((string) ($value ?? ''));
    return $text === '' ? null : $text;
}

function get_record_date(array $row): ?string
{
    $value = $row['date'] ?? $row['recordDate'] ?? null;
    $text = trim((string) ($value ?? ''));
    return $text === '' ? null : $text;
}

function replace_all_records(PDO $pdo, array $recordsData): void
{
    $recordsData = normalize_records_data($recordsData);
    $now = now_text();

    $pdo->beginTransaction();
    try {
        $pdo->exec('DELETE FROM record_rows');
        $pdo->exec('DELETE FROM record_tables');

        $tableStmt = $pdo->prepare(
            'INSERT INTO record_tables (table_key, title, menu_title, description, note, columns_json, sort_order, created_at, updated_at)
             VALUES (:table_key, :title, :menu_title, :description, :note, :columns_json, :sort_order, :created_at, :updated_at)'
        );

        $rowStmt = $pdo->prepare(
            'INSERT INTO record_rows (table_key, record_code, record_date, row_json, sort_order, created_at, updated_at)
             VALUES (:table_key, :record_code, :record_date, :row_json, :sort_order, :created_at, :updated_at)'
        );

        $tableIndex = 0;
        foreach ($recordsData as $tableKey => $table) {
            $tableStmt->execute([
                ':table_key' => $tableKey,
                ':title' => $table['title'],
                ':menu_title' => $table['menuTitle'],
                ':description' => $table['description'],
                ':note' => $table['note'],
                ':columns_json' => encode_json_value($table['columns']),
                ':sort_order' => $tableIndex,
                ':created_at' => $now,
                ':updated_at' => $now,
            ]);

            foreach ($table['rows'] as $rowIndex => $row) {
                $rowStmt->execute([
                    ':table_key' => $tableKey,
                    ':record_code' => get_record_code($row),
                    ':record_date' => get_record_date($row),
                    ':row_json' => encode_json_value($row),
                    ':sort_order' => $rowIndex,
                    ':created_at' => $now,
                    ':updated_at' => $now,
                ]);
            }

            $tableIndex++;
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function fetch_records_data(PDO $pdo, bool $includeRowIds = true): array
{
    $recordsData = [];
    $tables = $pdo->query('SELECT * FROM record_tables ORDER BY sort_order ASC, table_key ASC')->fetchAll();

    $rowStmt = $pdo->prepare('SELECT * FROM record_rows WHERE table_key = :table_key ORDER BY sort_order ASC, id ASC');

    foreach ($tables as $table) {
        $columns = json_decode((string) $table['columns_json'], true);
        if (!is_array($columns)) {
            $columns = [];
        }

        $rowStmt->execute([':table_key' => $table['table_key']]);
        $rows = [];

        foreach ($rowStmt->fetchAll() as $rowItem) {
            $row = json_decode((string) $rowItem['row_json'], true);
            if (!is_array($row)) {
                $row = [];
            }
            if ($includeRowIds) {
                $row['__id'] = (int) $rowItem['id'];
            }
            $rows[] = $row;
        }

        $recordsData[$table['table_key']] = [
            'title' => (string) $table['title'],
            'menuTitle' => (string) ($table['menu_title'] ?? ''),
            'description' => (string) ($table['description'] ?? ''),
            'note' => (string) ($table['note'] ?? ''),
            'columns' => $columns,
            'rows' => $rows,
        ];
    }

    return $recordsData;
}

function fetch_records_meta(PDO $pdo): array
{
    $tableCount = (int) $pdo->query('SELECT COUNT(*) FROM record_tables')->fetchColumn();
    $rowCount = (int) $pdo->query('SELECT COUNT(*) FROM record_rows')->fetchColumn();
    $latestTableUpdate = (string) ($pdo->query('SELECT MAX(updated_at) FROM record_tables')->fetchColumn() ?: '');
    $latestRowUpdate = (string) ($pdo->query('SELECT MAX(updated_at) FROM record_rows')->fetchColumn() ?: '');
    $backupCount = null;

    try {
        $backupCount = count(list_server_backups());
    } catch (Throwable $e) {
        // 备份目录异常不应该影响基础数据读取；真正执行备份操作时再抛出明确错误。
        $backupCount = null;
    }

    return [
        'tableCount' => $tableCount,
        'rowCount' => $rowCount,
        'latestUpdate' => max($latestTableUpdate, $latestRowUpdate),
        'backupCount' => $backupCount,
    ];
}

function get_row_id_by_index(PDO $pdo, string $tableKey, int $rowIndex): ?int
{
    if ($rowIndex < 0) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT id FROM record_rows WHERE table_key = :table_key ORDER BY sort_order ASC, id ASC LIMIT 1 OFFSET :offset');
    $stmt->bindValue(':table_key', $tableKey, PDO::PARAM_STR);
    $stmt->bindValue(':offset', $rowIndex, PDO::PARAM_INT);
    $stmt->execute();

    $id = $stmt->fetchColumn();
    return $id === false ? null : (int) $id;
}

function ensure_table_exists(PDO $pdo, string $tableKey): void
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM record_tables WHERE table_key = :table_key');
    $stmt->execute([':table_key' => $tableKey]);
    if ((int) $stmt->fetchColumn() === 0) {
        throw new RuntimeException('未找到对应表格：' . $tableKey);
    }
}

function insert_record(PDO $pdo, string $tableKey, array $row): int
{
    unset($row['__id'], $row['_dbId']);
    ensure_table_exists($pdo, $tableKey);

    $sortStmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM record_rows WHERE table_key = :table_key');
    $sortStmt->execute([':table_key' => $tableKey]);
    $sortOrder = (int) $sortStmt->fetchColumn();
    $now = now_text();

    $stmt = $pdo->prepare(
        'INSERT INTO record_rows (table_key, record_code, record_date, row_json, sort_order, created_at, updated_at)
         VALUES (:table_key, :record_code, :record_date, :row_json, :sort_order, :created_at, :updated_at)'
    );
    $stmt->execute([
        ':table_key' => $tableKey,
        ':record_code' => get_record_code($row),
        ':record_date' => get_record_date($row),
        ':row_json' => encode_json_value($row),
        ':sort_order' => $sortOrder,
        ':created_at' => $now,
        ':updated_at' => $now,
    ]);

    touch_table($pdo, $tableKey);
    return (int) $pdo->lastInsertId();
}

function update_record(PDO $pdo, string $tableKey, ?int $rowId, ?int $rowIndex, array $row): void
{
    unset($row['__id'], $row['_dbId']);
    ensure_table_exists($pdo, $tableKey);

    if (!$rowId && $rowIndex !== null) {
        $rowId = get_row_id_by_index($pdo, $tableKey, $rowIndex);
    }

    if (!$rowId) {
        throw new RuntimeException('未找到需要更新的记录。');
    }

    $stmt = $pdo->prepare(
        'UPDATE record_rows
         SET record_code = :record_code, record_date = :record_date, row_json = :row_json, updated_at = :updated_at
         WHERE id = :id AND table_key = :table_key'
    );
    $stmt->execute([
        ':record_code' => get_record_code($row),
        ':record_date' => get_record_date($row),
        ':row_json' => encode_json_value($row),
        ':updated_at' => now_text(),
        ':id' => $rowId,
        ':table_key' => $tableKey,
    ]);

    touch_table($pdo, $tableKey);
}

function delete_record(PDO $pdo, string $tableKey, ?int $rowId, ?int $rowIndex): void
{
    ensure_table_exists($pdo, $tableKey);

    if (!$rowId && $rowIndex !== null) {
        $rowId = get_row_id_by_index($pdo, $tableKey, $rowIndex);
    }

    if (!$rowId) {
        throw new RuntimeException('未找到需要删除的记录。');
    }

    $stmt = $pdo->prepare('DELETE FROM record_rows WHERE id = :id AND table_key = :table_key');
    $stmt->execute([
        ':id' => $rowId,
        ':table_key' => $tableKey,
    ]);

    if ($stmt->rowCount() === 0) {
        throw new RuntimeException('记录不存在，删除失败。');
    }

    resequence_rows($pdo, $tableKey);
    touch_table($pdo, $tableKey);
}

function resequence_rows(PDO $pdo, string $tableKey): void
{
    $stmt = $pdo->prepare('SELECT id FROM record_rows WHERE table_key = :table_key ORDER BY sort_order ASC, id ASC');
    $stmt->execute([':table_key' => $tableKey]);
    $ids = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    $update = $pdo->prepare('UPDATE record_rows SET sort_order = :sort_order WHERE id = :id');
    foreach ($ids as $index => $id) {
        $update->execute([
            ':sort_order' => $index,
            ':id' => $id,
        ]);
    }
}

function touch_table(PDO $pdo, string $tableKey): void
{
    $stmt = $pdo->prepare('UPDATE record_tables SET updated_at = :updated_at WHERE table_key = :table_key');
    $stmt->execute([
        ':updated_at' => now_text(),
        ':table_key' => $tableKey,
    ]);
}

function build_export_payload(PDO $pdo, string $source = 'manual-export'): array
{
    $config = app_config();

    return [
        'name' => $config['app_name'] . '数据备份',
        'version' => $config['app_version'],
        'source' => $source,
        'exportedAt' => gmdate('c'),
        'meta' => fetch_records_meta($pdo),
        'recordsData' => fetch_records_data($pdo, false),
    ];
}

function ensure_backup_dir(): string
{
    $config = app_config();
    $backupDir = $config['backup_dir'];

    if (!is_dir($backupDir) && !mkdir($backupDir, 0775, true) && !is_dir($backupDir)) {
        throw new RuntimeException('无法创建备份目录：' . $backupDir);
    }

    if (!is_writable($backupDir)) {
        throw new RuntimeException('备份目录不可写，请检查权限：' . $backupDir);
    }

    return $backupDir;
}

function sanitize_backup_reason(string $reason): string
{
    $reason = preg_replace('/[^a-zA-Z0-9\-_]+/', '-', $reason);
    $reason = trim((string) $reason, '-');
    return $reason === '' ? 'manual' : strtolower($reason);
}

function create_server_backup(PDO $pdo, string $reason = 'manual'): array
{
    $config = app_config();
    $backupDir = ensure_backup_dir();
    $safeReason = sanitize_backup_reason($reason);
    $createdAt = gmdate('c');
    $filename = $config['backup_file_prefix'] . gmdate('Ymd-His') . '-' . $safeReason . '.json';
    $path = $backupDir . DIRECTORY_SEPARATOR . $filename;

    $payload = build_export_payload($pdo, $safeReason);
    $payload['backupReason'] = $safeReason;
    $payload['createdAt'] = $createdAt;

    $json = json_encode($payload, JSON_PRETTY_PRINT | json_flags());
    if ($json === false) {
        throw new RuntimeException('备份 JSON 生成失败。');
    }

    if (file_put_contents($path, $json) === false) {
        throw new RuntimeException('无法写入服务器备份文件：' . $filename);
    }

    return backup_file_info($path, $filename, $safeReason);
}

function backup_file_info(string $path, ?string $filename = null, string $reason = ''): array
{
    $filename = $filename ?: basename($path);
    $createdAt = gmdate('c', (int) filemtime($path));

    if ($reason === '') {
        $reason = 'manual';
        if (preg_match('/-(manual|before-import|before-reset|before-restore)\.json$/', $filename, $matches)) {
            $reason = $matches[1];
        }
    }

    return [
        'filename' => $filename,
        'reason' => $reason,
        'createdAt' => $createdAt,
        'sizeBytes' => (int) filesize($path),
    ];
}

function list_server_backups(): array
{
    $backupDir = ensure_backup_dir();
    $files = glob($backupDir . DIRECTORY_SEPARATOR . '*.json') ?: [];
    $items = [];

    foreach ($files as $path) {
        if (is_file($path)) {
            $items[] = backup_file_info($path);
        }
    }

    usort($items, static function (array $a, array $b): int {
        return strcmp((string) $b['createdAt'], (string) $a['createdAt']);
    });

    return $items;
}

function safe_backup_path(string $filename): string
{
    $filename = trim($filename);
    if ($filename === '' || basename($filename) !== $filename || !preg_match('/\.json$/i', $filename)) {
        throw new RuntimeException('备份文件名不合法。');
    }

    $backupDir = ensure_backup_dir();
    $path = $backupDir . DIRECTORY_SEPARATOR . $filename;

    if (!is_file($path)) {
        throw new RuntimeException('未找到备份文件：' . $filename);
    }

    return $path;
}

function load_backup_records_data(string $filename): array
{
    $path = safe_backup_path($filename);
    $json = file_get_contents($path);
    if ($json === false) {
        throw new RuntimeException('无法读取备份文件：' . $filename);
    }

    $payload = json_decode($json, true);
    if (!is_array($payload)) {
        throw new RuntimeException('备份文件不是有效 JSON：' . $filename);
    }

    $recordsData = $payload['recordsData'] ?? $payload['data'] ?? $payload;
    if (!is_array($recordsData)) {
        throw new RuntimeException('备份文件中没有可恢复的 recordsData。');
    }

    return normalize_records_data($recordsData);
}

function delete_server_backup(string $filename): void
{
    $path = safe_backup_path($filename);
    if (!unlink($path)) {
        throw new RuntimeException('备份文件删除失败：' . $filename);
    }
}
