/*
  网站运维工作记录表 - 页面交互脚本
  ------------------------------------------------------------
  v1.2.1 说明：
  1. 页面数据从 PHP 接口 api/records.php 读取。
  2. 新增、编辑、删除都会写入 SQLite 数据库。
  3. 备份、导入、导出、恢复默认模板统一集中到「数据管理」入口。
  4. 导入、恢复默认模板、从服务器备份恢复前，会自动生成服务器端 JSON 备份。
  5. js/records-data.js 仅作为本地预览/接口失败时的备用模板，不再作为正式数据源。
*/
(function () {
  const API_URL = "api/records.php";
  const DATA_MANAGER_KEY = "data-manager";
  const DEFAULT_DATA = deepClone(window.recordsData || {});

  // data 是当前页面正在使用的数据；activeKey 是当前打开的表格编号，例如 table01。
  let data = {};
  let activeKey = "";
  let editingIndex = null;
  let editingRowId = null;
  let serverReady = false;
  let isBusy = false;

  // 页面主要区域。
  const tableMenu = document.getElementById("tableMenu");
  const activeTableCode = document.getElementById("activeTableCode");
  const activeTableTitle = document.getElementById("activeTableTitle");
  const activeTableDesc = document.getElementById("activeTableDesc");
  const activeTableNote = document.getElementById("activeTableNote");
  const activeRowCount = document.getElementById("activeRowCount");
  const tableWrap = document.getElementById("tableWrap");
  const apiStatus = document.getElementById("apiStatus");
  const tableCountLabel = document.querySelector(".table-count-card span");
  const recordToolbar = document.getElementById("recordToolbar");
  const dataManagerPanel = document.getElementById("dataManagerPanel");
  const editTip = document.getElementById("editTip");

  // 工具栏按钮。
  const addRecordBtn = document.getElementById("addRecordBtn");
  const refreshDataBtn = document.getElementById("refreshDataBtn");
  const exportDataBtn = document.getElementById("exportDataBtn");
  const serverBackupBtn = document.getElementById("serverBackupBtn");
  const toggleBackupPanelBtn = document.getElementById("toggleBackupPanelBtn");
  const importDataInput = document.getElementById("importDataInput");
  const resetDataBtn = document.getElementById("resetDataBtn");
  const backupPanel = document.getElementById("backupPanel");
  const backupList = document.getElementById("backupList");
  const refreshBackupsBtn = document.getElementById("refreshBackupsBtn");

  // 新增 / 编辑弹窗。
  const recordModal = document.getElementById("recordModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalTableName = document.getElementById("modalTableName");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelFormBtn = document.getElementById("cancelFormBtn");
  const recordForm = document.getElementById("recordForm");
  const formFields = document.getElementById("formFields");

  // 深拷贝：避免修改默认模板时互相影响。
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function setBusy(nextBusy) {
    isBusy = nextBusy;
    [addRecordBtn, refreshDataBtn, exportDataBtn, serverBackupBtn, toggleBackupPanelBtn, resetDataBtn, refreshBackupsBtn, importDataInput].forEach((button) => {
      if (button) button.disabled = nextBusy;
    });
  }

  function setStatus(message, type) {
    if (!apiStatus) return;
    apiStatus.textContent = message;
    apiStatus.className = `api-status ${type || ""}`.trim();
  }

  // 所有前端写入操作都必须先确认 PHP 接口可用，避免误以为数据已保存。
  function ensureServerReady() {
    if (serverReady) return true;
    alert("当前没有连接到 PHP + SQLite 接口，无法保存数据。请把项目放到 PHP 服务器中访问，并确认 api/records.php 可以正常运行。");
    return false;
  }

  async function apiRequest(action, options) {
    const requestOptions = options || {};
    const method = requestOptions.method || "GET";
    const url = `${API_URL}?action=${encodeURIComponent(action)}`;
    const fetchOptions = {
      method,
      headers: {
        Accept: "application/json"
      }
    };

    if (requestOptions.body !== undefined) {
      fetchOptions.headers["Content-Type"] = "application/json;charset=utf-8";
      fetchOptions.body = JSON.stringify(requestOptions.body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let result = null;

    try {
      result = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error("接口返回的不是有效 JSON。请检查 PHP 报错信息或服务器配置。");
    }

    if (!response.ok || !result || result.success === false) {
      throw new Error((result && result.message) || `接口请求失败：${response.status}`);
    }

    return result;
  }

  async function loadDataFromServer(preferredKey) {
    setBusy(true);
    setStatus("正在连接 SQLite 数据库...", "loading");

    try {
      const result = await apiRequest("all");
      data = deepClone(result.recordsData || {});
      serverReady = true;
      const initialKey = preferredKey || getHashKey() || getTableKeys()[0];
      setActiveTable(initialKey);
      updateMetaStatus(result.meta);
      setStatus(getMetaStatusText(result.meta) || "已连接 PHP + SQLite，页面修改会保存到服务器数据库。", "ok");
    } catch (error) {
      console.warn("连接 PHP + SQLite 失败，已切换到备用模板预览。", error);
      data = deepClone(DEFAULT_DATA);
      serverReady = false;
      const initialKey = preferredKey || getHashKey() || getTableKeys()[0];
      setActiveTable(initialKey);
      setStatus(`接口连接失败：${error.message}。当前仅为备用模板预览，新增/编辑/删除不会保存。`, "error");
    } finally {
      setBusy(false);
    }
  }

  function getHashKey() {
    const hash = window.location.hash.replace("#", "");
    return hash === DATA_MANAGER_KEY ? DATA_MANAGER_KEY : hash;
  }

  function applyReturnedData(result, preferredKey) {
    if (result && result.recordsData) {
      data = deepClone(result.recordsData);
    }
    const tableKeys = getTableKeys();
    setActiveTable(preferredKey === DATA_MANAGER_KEY || data[preferredKey] ? preferredKey : tableKeys[0]);
    if (result && result.meta) updateMetaStatus(result.meta);
  }

  function getMetaStatusText(meta) {
    if (!meta) return "";
    const rowText = typeof meta.rowCount === "number" ? `${meta.rowCount} 条记录` : "记录已同步";
    const backupText = typeof meta.backupCount === "number" ? `服务器备份 ${meta.backupCount} 份` : "";
    return `已连接 PHP + SQLite，当前 ${rowText}${backupText ? `，${backupText}` : ""}。`;
  }

  function updateMetaStatus(meta) {
    if (!meta || !apiStatus || apiStatus.classList.contains("error")) return;
    const text = getMetaStatusText(meta);
    if (text) apiStatus.textContent = text;
  }

  function getAutoBackupText(result) {
    if (!result || !result.autoBackup || !result.autoBackup.filename) return "";
    return `已自动生成服务器备份：${result.autoBackup.filename}`;
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  // 获取所有表格编号，并按 table01、table02... 的顺序显示。
  function getTableKeys() {
    return Object.keys(data).sort();
  }

  function getTotalRowCount() {
    return getTableKeys().reduce((total, key) => {
      const rows = data[key] && Array.isArray(data[key].rows) ? data[key].rows : [];
      return total + rows.length;
    }, 0);
  }

  // 防止用户填写的内容破坏 HTML 结构。
  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 用于 input value、href 等属性值的转义。
  function escapeAttribute(value) {
    return escapeHTML(value).replace(/`/g, "&#096;");
  }

  function isEmptyValue(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  function getDisplayValue(value) {
    if (isEmptyValue(value)) return "—";
    return String(value);
  }

  // 渲染“云文件”链接。默认显示“查看详情”。
  function renderLinkCell(value) {
    let text = "查看详情";
    let url = "#";

    if (typeof value === "string") {
      url = value || "#";
    } else if (value && typeof value === "object") {
      text = value.text || text;
      url = value.url || url;
    }

    return `<a class="cloud-file-link" href="${escapeAttribute(url)}" target="_blank" rel="noopener">${escapeHTML(text)}</a>`;
  }

  // 根据字段类型渲染单元格。
  function renderCell(row, column) {
    const value = row[column.key];

    if (column.type === "link") {
      return renderLinkCell(value);
    }

    return escapeHTML(getDisplayValue(value));
  }

  // 给空值、模板占位值、记录编号增加不同样式。
  function getCellClass(row, column) {
    const value = row[column.key];
    const text = typeof value === "object" ? "" : String(value ?? "");
    if (isEmptyValue(value) || text.includes("__")) {
      return " class=\"empty-cell\"";
    }
    if (column.key === "recordId") {
      return " class=\"record-id-cell\"";
    }
    return "";
  }

  // 渲染顶部表格菜单。新增 table06 后也会自动显示；数据管理是全局入口，不属于业务表。
  function renderMenu(nextActiveKey) {
    if (!tableMenu) return;
    const tableKeys = getTableKeys();

    if (!tableKeys.length) {
      tableMenu.innerHTML = `<div class="empty-state">未找到表格数据。请检查 SQLite 数据库或默认数据文件。</div>`;
      return;
    }

    const tableButtons = tableKeys
      .map((key, index) => {
        const table = data[key] || {};
        const activeClass = key === nextActiveKey ? " active" : "";
        return `
          <button class="record-menu-btn${activeClass}" type="button" data-table-key="${escapeAttribute(key)}">
            <span class="record-card-index">${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHTML(table.menuTitle || table.title || key)}</strong>
            <small>${escapeHTML(key)}</small>
          </button>
        `;
      })
      .join("");

    const managerActiveClass = nextActiveKey === DATA_MANAGER_KEY ? " active manager-active" : "";
    const managerButton = `
      <button class="record-menu-btn data-manager-menu${managerActiveClass}" type="button" data-manager-key="${DATA_MANAGER_KEY}">
        <span class="record-card-index">备</span>
        <strong>数据管理</strong>
        <small>全局备份 / 导入 / 导出</small>
      </button>
    `;

    tableMenu.innerHTML = tableButtons + managerButton;
  }

  // 渲染当前选中的表格，包括表头、数据行和操作按钮。
  function renderTable(tableKey) {
    const table = data[tableKey];

    if (!table) {
      tableWrap.innerHTML = `<div class="empty-state">未找到 ${escapeHTML(tableKey)} 对应的数据。</div>`;
      return;
    }

    const columns = Array.isArray(table.columns) ? table.columns : [];
    const rows = Array.isArray(table.rows) ? table.rows : [];

    activeKey = tableKey;
    activeTableCode.textContent = tableKey;
    activeTableTitle.textContent = table.title || tableKey;
    activeTableDesc.textContent = table.description || "";
    activeTableNote.textContent = table.note || "";
    activeRowCount.textContent = rows.length;
    if (tableCountLabel) tableCountLabel.textContent = "当前记录";
    if (recordToolbar) recordToolbar.hidden = false;
    if (dataManagerPanel) dataManagerPanel.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
    if (editTip) editTip.hidden = false;

    renderMenu(tableKey);

    if (!columns.length) {
      tableWrap.innerHTML = `<div class="empty-state">当前表格还没有配置列。请在默认数据或数据库表格配置中新增列定义。</div>`;
      return;
    }

    const thead = columns
      .map((column) => `<th>${escapeHTML(column.label || column.key)}</th>`)
      .join("");

    if (!rows.length) {
      tableWrap.innerHTML = `
        <table class="data-table record-table simplified-table">
          <thead><tr>${thead}<th class="operation-th">操作</th></tr></thead>
          <tbody><tr><td colspan="${columns.length + 1}" class="empty-row">当前表格暂无记录，可以点击“新增记录”。</td></tr></tbody>
        </table>
      `;
      return;
    }

    const tbody = rows
      .map((row, rowIndex) => {
        const cells = columns
          .map((column) => `<td${getCellClass(row, column)}>${renderCell(row, column)}</td>`)
          .join("");
        return `
          <tr>
            ${cells}
            <td class="operation-cell">
              <button class="mini-btn" type="button" data-action="edit" data-row-index="${rowIndex}">编辑</button>
              <button class="mini-btn danger" type="button" data-action="delete" data-row-index="${rowIndex}">删除</button>
            </td>
          </tr>
        `;
      })
      .join("");

    tableWrap.innerHTML = `
      <table class="data-table record-table simplified-table">
        <thead><tr>${thead}<th class="operation-th">操作</th></tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    `;
  }

  function renderDataManager() {
    activeKey = DATA_MANAGER_KEY;
    activeTableCode.textContent = "DATA";
    activeTableTitle.textContent = "数据管理";
    activeTableDesc.textContent = "集中处理整套系统的服务器备份、本地 JSON 导入导出和默认模板恢复。这里的操作影响全部记录表。";
    activeTableNote.textContent = "建议在批量导入、恢复默认模板、版本升级前，先生成一份服务器备份。";
    activeRowCount.textContent = getTotalRowCount();
    if (tableCountLabel) tableCountLabel.textContent = "全部记录";
    if (recordToolbar) recordToolbar.hidden = true;
    if (dataManagerPanel) dataManagerPanel.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
    if (editTip) editTip.hidden = true;
    renderMenu(DATA_MANAGER_KEY);
  }

  // 切换表格，同时把当前位置写入 URL hash，便于刷新后仍停留在同一入口。
  function setActiveTable(tableKey) {
    if (tableKey === DATA_MANAGER_KEY) {
      renderDataManager();
      if (window.location.hash !== `#${DATA_MANAGER_KEY}`) {
        history.replaceState(null, "", `#${DATA_MANAGER_KEY}`);
      }
      return;
    }

    const tableKeys = getTableKeys();
    const nextKey = data[tableKey] ? tableKey : tableKeys[0];
    if (!nextKey) return;
    renderTable(nextKey);
    if (window.location.hash !== `#${nextKey}`) {
      history.replaceState(null, "", `#${nextKey}`);
    }
  }

  function getInputId(columnKey, suffix) {
    return `field_${columnKey}${suffix ? `_${suffix}` : ""}`;
  }

  // 这些字段内容一般较长，表单中使用 textarea。
  function shouldUseTextarea(columnKey) {
    return ["content", "summary", "item", "backupScope"].includes(columnKey);
  }

  // 打开新增 / 编辑弹窗，并根据当前表格 columns 自动生成表单字段。
  function openRecordModal(mode, rowIndex) {
    if (!ensureServerReady()) return;

    const table = data[activeKey];
    if (!table) return;

    const columns = Array.isArray(table.columns) ? table.columns : [];
    const row = mode === "edit" ? deepClone(table.rows[rowIndex] || {}) : {};
    editingIndex = mode === "edit" ? rowIndex : null;
    editingRowId = mode === "edit" ? Number(row.__id || 0) || null : null;

    modalTitle.textContent = mode === "edit" ? "编辑记录" : "新增记录";
    modalTableName.textContent = `${activeKey} · ${table.title || ""}`;

    formFields.innerHTML = columns
      .map((column) => {
        const label = column.label || column.key;
        const value = row[column.key];

        // link 类型会拆成“显示文字”和“链接地址”两个输入框。
        if (column.type === "link") {
          const linkText = value && typeof value === "object" ? value.text || "查看详情" : "查看详情";
          const linkUrl = typeof value === "string" ? value : value && typeof value === "object" ? value.url || "#" : "#";
          return `
            <div class="form-field">
              <label for="${escapeAttribute(getInputId(column.key, "text"))}">${escapeHTML(label)}文字</label>
              <input id="${escapeAttribute(getInputId(column.key, "text"))}" name="${escapeAttribute(column.key)}__text" type="text" value="${escapeAttribute(linkText)}" placeholder="查看详情" />
            </div>
            <div class="form-field wide-field">
              <label for="${escapeAttribute(getInputId(column.key, "url"))}">${escapeHTML(label)}链接</label>
              <input id="${escapeAttribute(getInputId(column.key, "url"))}" name="${escapeAttribute(column.key)}__url" type="url" value="${escapeAttribute(linkUrl)}" placeholder="https://..." />
            </div>
          `;
        }

        if (shouldUseTextarea(column.key)) {
          return `
            <div class="form-field wide-field">
              <label for="${escapeAttribute(getInputId(column.key))}">${escapeHTML(label)}</label>
              <textarea id="${escapeAttribute(getInputId(column.key))}" name="${escapeAttribute(column.key)}" rows="3" placeholder="请填写${escapeAttribute(label)}">${escapeHTML(value || "")}</textarea>
            </div>
          `;
        }

        return `
          <div class="form-field">
            <label for="${escapeAttribute(getInputId(column.key))}">${escapeHTML(label)}</label>
            <input id="${escapeAttribute(getInputId(column.key))}" name="${escapeAttribute(column.key)}" type="text" value="${escapeAttribute(value || "")}" placeholder="请填写${escapeAttribute(label)}" />
          </div>
        `;
      })
      .join("");

    recordModal.hidden = false;
    document.body.classList.add("modal-open");
    const firstInput = recordModal.querySelector("input, textarea");
    if (firstInput) firstInput.focus();
  }

  function closeRecordModal() {
    recordModal.hidden = true;
    document.body.classList.remove("modal-open");
    editingIndex = null;
    editingRowId = null;
    recordForm.reset();
    formFields.innerHTML = "";
  }

  // 读取表单内容，并按 columns 重新组装成一条 row 数据。
  function collectFormData() {
    const table = data[activeKey];
    const columns = Array.isArray(table.columns) ? table.columns : [];
    const formData = new FormData(recordForm);
    const row = {};

    columns.forEach((column) => {
      if (column.type === "link") {
        const text = String(formData.get(`${column.key}__text`) || "查看详情").trim() || "查看详情";
        const url = String(formData.get(`${column.key}__url`) || "#").trim() || "#";
        row[column.key] = { text, url };
      } else {
        row[column.key] = String(formData.get(column.key) || "").trim();
      }
    });

    return row;
  }

  async function deleteRecord(rowIndex) {
    if (!ensureServerReady() || isBusy) return;

    const table = data[activeKey];
    if (!table || !Array.isArray(table.rows)) return;

    const row = table.rows[rowIndex] || {};
    const recordId = row.recordId ? `「${row.recordId}」` : "这条记录";
    if (!confirm(`确定删除 ${recordId} 吗？删除后会同步保存到 SQLite 数据库。`)) return;

    setBusy(true);
    setStatus("正在删除记录...", "loading");

    try {
      const result = await apiRequest("delete", {
        method: "POST",
        body: {
          tableKey: activeKey,
          rowId: row.__id || null,
          rowIndex
        }
      });
      applyReturnedData(result, activeKey);
      setStatus("记录已删除，并已保存到 SQLite 数据库。", "ok");
    } catch (error) {
      alert(`删除失败：${error.message}`);
      setStatus(`删除失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function exportBackup() {
    if (!serverReady) {
      alert("当前没有连接到 PHP + SQLite 接口，无法从数据库导出备份。请先确认服务器接口可用。 ");
      return;
    }

    setBusy(true);
    setStatus("正在从 SQLite 导出 JSON 备份...", "loading");

    try {
      const response = await fetch(`${API_URL}?action=export`);
      if (!response.ok) {
        throw new Error(`导出失败：${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : getBackupFilename();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("JSON 备份已从 SQLite 导出。", "ok");
    } catch (error) {
      alert(`导出失败：${error.message}`);
      setStatus(`导出失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function getBackupFilename() {
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join("");
    return `website-work-record-backup-${timestamp}.json`;
  }

  async function createServerBackup() {
    if (!ensureServerReady() || isBusy) return;

    setBusy(true);
    setStatus("正在生成服务器端 JSON 备份...", "loading");

    try {
      const result = await apiRequest("backup", {
        method: "POST",
        body: { reason: "manual" }
      });
      const filename = result.backup && result.backup.filename ? result.backup.filename : "服务器备份";
      setStatus(`服务器端备份已生成：${filename}`, "ok");
      renderBackupList(result.backups || []);
      if (backupPanel) backupPanel.hidden = false;
    } catch (error) {
      alert(`生成服务器备份失败：${error.message}`);
      setStatus(`生成服务器备份失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function loadServerBackups() {
    if (!ensureServerReady() || isBusy) return;
    if (!backupPanel || !backupList) return;

    backupPanel.hidden = false;
    backupList.innerHTML = `<div class="backup-empty">正在加载服务器端备份列表...</div>`;
    setBusy(true);

    try {
      const result = await apiRequest("backups");
      renderBackupList(result.backups || []);
      updateMetaStatus(result.meta);
    } catch (error) {
      backupList.innerHTML = `<div class="backup-empty error-text">备份列表加载失败：${escapeHTML(error.message)}</div>`;
      setStatus(`备份列表加载失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function renderBackupList(backups) {
    if (!backupList) return;

    if (!Array.isArray(backups) || backups.length === 0) {
      backupList.innerHTML = `<div class="backup-empty">服务器上暂无 JSON 备份。可以点击“生成服务器备份”创建一份。</div>`;
      return;
    }

    backupList.innerHTML = backups
      .map((item) => {
        const filename = item.filename || "";
        const downloadUrl = `${API_URL}?action=download_backup&filename=${encodeURIComponent(filename)}`;
        return `
          <div class="backup-item">
            <div class="backup-info">
              <strong>${escapeHTML(filename)}</strong>
              <span>来源：${escapeHTML(item.reason || "manual")} · 时间：${escapeHTML(formatDateTime(item.createdAt))} · 大小：${escapeHTML(formatBytes(item.sizeBytes))}</span>
            </div>
            <div class="backup-actions">
              <a class="mini-btn" href="${escapeAttribute(downloadUrl)}">下载</a>
              <button class="mini-btn" type="button" data-backup-action="restore" data-filename="${escapeAttribute(filename)}">恢复</button>
              <button class="mini-btn danger" type="button" data-backup-action="delete" data-filename="${escapeAttribute(filename)}">删除</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function restoreServerBackup(filename) {
    if (!ensureServerReady() || isBusy) return;
    if (!filename) return;
    if (!confirm(`确定从该服务器备份恢复吗？\n${filename}\n\n当前 SQLite 数据库会被覆盖，系统会先自动备份当前数据库。`)) return;

    setBusy(true);
    setStatus("正在自动备份当前数据库，并从服务器备份恢复...", "loading");

    try {
      const result = await apiRequest("restore_backup", {
        method: "POST",
        body: { filename }
      });
      applyReturnedData(result, activeKey === DATA_MANAGER_KEY ? DATA_MANAGER_KEY : getTableKeys()[0]);
      renderBackupList(result.backups || []);
      const backupText = getAutoBackupText(result);
      setStatus(`已从服务器备份恢复。${backupText ? ` ${backupText}` : ""}`, "ok");
    } catch (error) {
      alert(`恢复服务器备份失败：${error.message}`);
      setStatus(`恢复服务器备份失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteServerBackup(filename) {
    if (!ensureServerReady() || isBusy) return;
    if (!filename) return;
    if (!confirm(`确定删除这份服务器备份吗？\n${filename}`)) return;

    setBusy(true);
    setStatus("正在删除服务器端备份...", "loading");

    try {
      const result = await apiRequest("delete_backup", {
        method: "POST",
        body: { filename }
      });
      renderBackupList(result.backups || []);
      setStatus("服务器端备份已删除。", "ok");
    } catch (error) {
      alert(`删除服务器备份失败：${error.message}`);
      setStatus(`删除服务器备份失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // 校验导入文件的基础结构，避免误导入不兼容文件。
  function normalizeImportedData(parsed) {
    const imported = parsed && (parsed.recordsData || parsed.data || parsed);
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
      throw new Error("备份文件结构不正确。请导入由本页面导出的 JSON 文件。");
    }

    Object.keys(imported).forEach((key) => {
      const table = imported[key];
      if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
        throw new Error(`表格 ${key} 缺少 columns 或 rows。`);
      }
    });

    return imported;
  }

  // 导入 JSON 备份，并覆盖 SQLite 当前数据。
  function importBackup(file) {
    if (!file) return;
    if (!ensureServerReady()) {
      importDataInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async function () {
      try {
        const parsed = JSON.parse(reader.result);
        const importedData = normalizeImportedData(parsed);
        if (!confirm("确定导入该 JSON 备份吗？导入后会覆盖 SQLite 数据库中的全部表格和记录。系统会先自动生成一份服务器端备份。")) {
          return;
        }

        setBusy(true);
        setStatus("正在自动备份当前数据库，并导入 JSON 备份...", "loading");
        const result = await apiRequest("import", {
          method: "POST",
          body: { recordsData: importedData }
        });
        applyReturnedData(result, activeKey === DATA_MANAGER_KEY || data[activeKey] ? activeKey : getTableKeys()[0]);
        const backupText = getAutoBackupText(result);
        setStatus(`导入成功，数据已保存到 SQLite 数据库。${backupText ? ` ${backupText}` : ""}`, "ok");
        alert(`导入成功，数据已保存到 SQLite 数据库。${backupText ? `
${backupText}` : ""}`);
        if (backupPanel && !backupPanel.hidden) renderBackupList(result.backups || []);
      } catch (error) {
        alert(`导入失败：${error.message}`);
        setStatus(`导入失败：${error.message}`, "error");
      } finally {
        setBusy(false);
        importDataInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  // 恢复默认模板会覆盖 SQLite 当前数据，执行前建议先导出备份。
  async function resetData() {
    if (!ensureServerReady() || isBusy) return;
    if (!confirm("确定恢复默认模板吗？SQLite 数据库中的当前数据会被覆盖。系统会先自动生成一份服务器端备份。")) return;

    setBusy(true);
    setStatus("正在自动备份当前数据库，并恢复默认模板...", "loading");

    try {
      const result = await apiRequest("reset", { method: "POST", body: {} });
      applyReturnedData(result, activeKey === DATA_MANAGER_KEY ? DATA_MANAGER_KEY : getTableKeys()[0]);
      const backupText = getAutoBackupText(result);
      setStatus(`已恢复默认模板，并已写入 SQLite 数据库。${backupText ? ` ${backupText}` : ""}`, "ok");
      if (backupPanel && !backupPanel.hidden) renderBackupList(result.backups || []);
    } catch (error) {
      alert(`恢复失败：${error.message}`);
      setStatus(`恢复失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // 菜单点击：切换表格。
  tableMenu.addEventListener("click", function (event) {
    const managerButton = event.target.closest("[data-manager-key]");
    if (managerButton) {
      setActiveTable(DATA_MANAGER_KEY);
      return;
    }

    const button = event.target.closest("[data-table-key]");
    if (!button) return;
    setActiveTable(button.dataset.tableKey);
  });

  // 表格操作：编辑或删除记录。
  tableWrap.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const rowIndex = Number(button.dataset.rowIndex);
    const action = button.dataset.action;

    if (action === "edit") openRecordModal("edit", rowIndex);
    if (action === "delete") deleteRecord(rowIndex);
  });

  addRecordBtn.addEventListener("click", function () {
    openRecordModal("add");
  });

  if (refreshDataBtn) {
    refreshDataBtn.addEventListener("click", function () {
      loadDataFromServer(activeKey || getTableKeys()[0]);
    });
  }

  exportDataBtn.addEventListener("click", exportBackup);

  if (serverBackupBtn) serverBackupBtn.addEventListener("click", createServerBackup);

  if (toggleBackupPanelBtn) {
    toggleBackupPanelBtn.addEventListener("click", function () {
      if (!backupPanel) return;
      if (backupPanel.hidden) {
        loadServerBackups();
      } else {
        backupPanel.hidden = true;
      }
    });
  }

  if (refreshBackupsBtn) refreshBackupsBtn.addEventListener("click", loadServerBackups);

  if (backupList) {
    backupList.addEventListener("click", function (event) {
      const button = event.target.closest("[data-backup-action]");
      if (!button) return;
      const action = button.dataset.backupAction;
      const filename = button.dataset.filename;
      if (action === "restore") restoreServerBackup(filename);
      if (action === "delete") deleteServerBackup(filename);
    });
  }

  importDataInput.addEventListener("change", function () {
    importBackup(importDataInput.files && importDataInput.files[0]);
  });

  resetDataBtn.addEventListener("click", resetData);

  closeModalBtn.addEventListener("click", closeRecordModal);
  cancelFormBtn.addEventListener("click", closeRecordModal);

  recordModal.addEventListener("click", function (event) {
    if (event.target === recordModal) closeRecordModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !recordModal.hidden) closeRecordModal();
  });

  // 保存表单：新增或编辑都会通过 PHP 接口写入 SQLite。
  recordForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!ensureServerReady() || isBusy) return;

    const table = data[activeKey];
    if (!table) return;

    const row = collectFormData();
    const action = editingRowId === null ? "create" : "update";

    setBusy(true);
    setStatus(action === "create" ? "正在新增记录..." : "正在保存修改...", "loading");

    try {
      const result = await apiRequest(action, {
        method: "POST",
        body: {
          tableKey: activeKey,
          rowId: editingRowId,
          rowIndex: editingIndex,
          row
        }
      });

      closeRecordModal();
      applyReturnedData(result, activeKey);
      setStatus("记录已保存到 SQLite 数据库。", "ok");
    } catch (error) {
      alert(`保存失败：${error.message}`);
      setStatus(`保存失败：${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  });

  // 支持通过 #table01 这种地址直接打开某张表。
  window.addEventListener("hashchange", function () {
    const hashKey = getHashKey();
    if (hashKey) setActiveTable(hashKey);
  });

  // 页面初始化：优先连接服务器数据库，失败时展示备用模板。
  loadDataFromServer();
})();
