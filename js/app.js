/*
  网站运维工作记录表 - 页面交互脚本
  ------------------------------------------------------------
  修改建议：
  1. 日常新增、编辑、删除记录，优先在页面中操作。
  2. 表格字段、默认记录、表格数量，建议修改 js/records-data.js。
  3. 本文件主要负责页面渲染、表单弹窗、本地保存、导入导出，通常不需要频繁修改。
*/
(function () {
  // 本地存储 Key：页面上的增删改会保存到浏览器 localStorage 中。
  const STORAGE_KEY = "websiteWorkRecordData.v1";

  // 默认数据来自 js/records-data.js 中的 window.recordsData。
  const DEFAULT_DATA = deepClone(window.recordsData || {});

  // data 是当前页面正在使用的数据；activeKey 是当前打开的表格编号，例如 table01。
  let data = loadData();
  let activeKey = "";
  let editingIndex = null;

  // 页面主要区域。
  const tableMenu = document.getElementById("tableMenu");
  const activeTableCode = document.getElementById("activeTableCode");
  const activeTableTitle = document.getElementById("activeTableTitle");
  const activeTableDesc = document.getElementById("activeTableDesc");
  const activeTableNote = document.getElementById("activeTableNote");
  const activeRowCount = document.getElementById("activeRowCount");
  const tableWrap = document.getElementById("tableWrap");

  // 工具栏按钮。
  const addRecordBtn = document.getElementById("addRecordBtn");
  const exportDataBtn = document.getElementById("exportDataBtn");
  const importDataInput = document.getElementById("importDataInput");
  const resetDataBtn = document.getElementById("resetDataBtn");

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

  // 读取本地数据；如果没有本地数据，就使用默认模板。
  function loadData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return deepClone(DEFAULT_DATA);
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object") return deepClone(DEFAULT_DATA);
      return parsed;
    } catch (error) {
      console.warn("读取本地数据失败，已使用默认模板。", error);
      return deepClone(DEFAULT_DATA);
    }
  }

  // 保存到浏览器本地。注意：这不会自动改写 js/records-data.js 文件。
  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // 获取所有表格编号，并按 table01、table02... 的顺序显示。
  function getTableKeys() {
    return Object.keys(data).sort();
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

  // 渲染顶部 5 个表格菜单。新增 table06 后也会自动显示。
  function renderMenu(nextActiveKey) {
    if (!tableMenu) return;
    const tableKeys = getTableKeys();

    if (!tableKeys.length) {
      tableMenu.innerHTML = `<div class="empty-state">未找到表格数据。请检查 <code>js/records-data.js</code> 或导入备份文件。</div>`;
      return;
    }

    tableMenu.innerHTML = tableKeys
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

    renderMenu(tableKey);

    if (!columns.length) {
      tableWrap.innerHTML = `<div class="empty-state">当前表格还没有配置列。请在 <code>columns</code> 中新增列定义。</div>`;
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

  // 切换表格，同时把当前表格写入 URL hash，便于刷新后仍停留在同一张表。
  function setActiveTable(tableKey) {
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
    const table = data[activeKey];
    if (!table) return;

    const columns = Array.isArray(table.columns) ? table.columns : [];
    const row = mode === "edit" ? deepClone(table.rows[rowIndex] || {}) : {};
    editingIndex = mode === "edit" ? rowIndex : null;

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

  function deleteRecord(rowIndex) {
    const table = data[activeKey];
    if (!table || !Array.isArray(table.rows)) return;

    const row = table.rows[rowIndex] || {};
    const recordId = row.recordId ? `「${row.recordId}」` : "这条记录";
    if (!confirm(`确定删除 ${recordId} 吗？删除后会保存到当前浏览器本地数据中。`)) return;

    table.rows.splice(rowIndex, 1);
    saveData();
    renderTable(activeKey);
  }

  // 导出当前所有表格数据，作为 JSON 备份文件。
  function exportBackup() {
    const payload = {
      name: "网站运维工作记录表数据备份",
      version: "v1.0.0",
      exportedAt: new Date().toISOString(),
      recordsData: data
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0")
    ].join("");

    const link = document.createElement("a");
    link.href = url;
    link.download = `website-work-record-backup-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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

  // 导入 JSON 备份，并保存到当前浏览器本地。
  function importBackup(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(reader.result);
        const importedData = normalizeImportedData(parsed);
        data = deepClone(importedData);
        saveData();
        const tableKeys = getTableKeys();
        setActiveTable(data[activeKey] ? activeKey : tableKeys[0]);
        alert("导入成功，数据已保存到当前浏览器本地。");
      } catch (error) {
        alert(`导入失败：${error.message}`);
      } finally {
        importDataInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  // 恢复默认模板会清空当前浏览器本地数据，执行前建议先导出备份。
  function resetData() {
    if (!confirm("确定恢复默认模板吗？当前浏览器本地新增或修改的数据会被清空。建议先导出备份。")) return;
    data = deepClone(DEFAULT_DATA);
    saveData();
    const tableKeys = getTableKeys();
    setActiveTable(tableKeys[0]);
  }

  // 菜单点击：切换表格。
  tableMenu.addEventListener("click", function (event) {
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

  exportDataBtn.addEventListener("click", exportBackup);

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

  // 保存表单：新增时追加到 rows，编辑时替换原有记录。
  recordForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const table = data[activeKey];
    if (!table) return;
    if (!Array.isArray(table.rows)) table.rows = [];

    const row = collectFormData();

    if (editingIndex === null) {
      table.rows.push(row);
    } else {
      table.rows[editingIndex] = row;
    }

    saveData();
    closeRecordModal();
    renderTable(activeKey);
  });

  // 支持通过 #table01 这种地址直接打开某张表。
  window.addEventListener("hashchange", function () {
    const hashKey = window.location.hash.replace("#", "");
    if (hashKey) setActiveTable(hashKey);
  });

  // 页面初始化：优先打开 URL hash 指定的表格，否则打开第一张表。
  const initialKey = window.location.hash.replace("#", "") || getTableKeys()[0];
  setActiveTable(initialKey);
})();
