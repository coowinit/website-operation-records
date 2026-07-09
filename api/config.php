<?php
/**
 * 网站运维工作记录表 - 基础配置
 * ------------------------------------------------------------
 * 1. 默认数据库放在 database/website_records.sqlite。
 * 2. 默认服务器端 JSON 备份放在 backups/。
 * 3. 如果主机支持放到网站目录外，建议把 db_path 和 backup_dir 改成网站根目录之外的路径。
 */
return [
    'app_name' => '网站运维工作记录表',
    'app_version' => 'v1.2.1',
    'db_path' => dirname(__DIR__) . '/database/website_records.sqlite',
    'schema_path' => dirname(__DIR__) . '/database/schema.sql',
    'default_data_path' => dirname(__DIR__) . '/data/default-records-data.json',
    'backup_dir' => dirname(__DIR__) . '/backups',
    'backup_file_prefix' => 'website-work-record-backup-',
];
