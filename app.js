let records = [];
const STORAGE_KEY = 'scm_dashboard_data';

const statusText = {
  healthy: '健康',
  normal: '正常',
  warning: '预警',
  critical: '紧急'
};

const statusColors = {
  healthy: '#52c41a',
  normal: '#1890ff',
  warning: '#faad14',
  critical: '#f5222d'
};

// 智能识别表头并映射数据
function mapData(rawData) {
  if (!rawData || rawData.length === 0) return [];
  const headers = rawData[0];
  const headerMap = {};

  const fieldMappings = {
    supplyChain: ['供应链', '供应商', '渠道', '供应链名称', '供应商名称', '客户', '经销商'],
    product: ['产品', '商品', '货品', '产品名称', '商品名称', '食盐品种', '品类'],
    demand: ['需求', '需求量', '需求数量', '订单需求', '预测需求', '计划需求'],
    deliveryCycle: ['配送周期', '周期', '交货周期', 'lead time', '运输周期', '配送天数'],
    sales: ['销量', '销售量', '销售额', '实际销量', '销售数量', '出货量', '实销量'],
    inventory: ['库存', '库存量', '现有库存', '存货', '库存数量'],
    region: ['区域', '地区', '片区', '销售区域', '省份', '城市']
  };

  headers.forEach((h, idx) => {
    const headerStr = String(h).trim();
    for (const [key, aliases] of Object.entries(fieldMappings)) {
      if (aliases.some(a => headerStr.includes(a))) {
        headerMap[key] = idx;
        break;
      }
    }
  });

  const records = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;
    const record = {
      id: i,
      supplyChain: String(row[headerMap.supplyChain] || row[0] || '未知').trim(),
      product: String(row[headerMap.product] || row[1] || '食盐').trim(),
      demand: parseFloat(row[headerMap.demand]) || 0,
      deliveryCycle: parseFloat(row[headerMap.deliveryCycle]) || 0,
      sales: parseFloat(row[headerMap.sales]) || 0,
      inventory: parseFloat(row[headerMap.inventory]) || 0,
      region: String(row[headerMap.region] || '').trim(),
      status: ''
    };
    record.status = analyzeStatus(record);
    records.push(record);
  }
  return records;
}

// 智能分析销量状态
function analyzeStatus(record) {
  const { demand, sales, inventory, deliveryCycle } = record;
  const fillRate = demand > 0 ? (sales / demand) * 100 : 0;
  const inventoryDays = sales > 0 ? inventory / (sales / 30) : 999;

  if (fillRate >= 95 && inventoryDays >= deliveryCycle * 1.5) return 'healthy';
  if (fillRate >= 85 && inventoryDays >= deliveryCycle) return 'normal';
  if (fillRate < 70 || inventoryDays < deliveryCycle * 0.5) return 'critical';
  if (fillRate < 85 || inventoryDays < deliveryCycle) return 'warning';
  return 'normal';
}

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      records = JSON.parse(stored);
    }
  } catch (e) {
    console.error('加载数据失败', e);
  }
  renderAll();
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function renderAll() {
  renderStats();
  renderTable();
  renderCharts();
}

function renderStats() {
  const counts = { healthy: 0, normal: 0, warning: 0, critical: 0 };
  records.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  document.getElementById('healthyCount').textContent = counts.healthy || 0;
  document.getElementById('normalCount').textContent = counts.normal || 0;
  document.getElementById('warningCount').textContent = counts.warning || 0;
  document.getElementById('criticalCount').textContent = counts.critical || 0;
  document.getElementById('totalCount').textContent = records.length;
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  records.forEach((r, idx) => {
    const fillRate = r.demand > 0 ? ((r.sales / r.demand) * 100).toFixed(1) : 0;
    const inventoryDays = r.sales > 0 ? (r.inventory / (r.sales / 30)).toFixed(1) : '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.supplyChain}</td>
      <td>${r.product}</td>
      <td>${r.region || '-'}</td>
      <td class="editable" data-field="demand" data-idx="${idx}">${r.demand}</td>
      <td class="editable" data-field="sales" data-idx="${idx}">${r.sales}</td>
      <td class="editable" data-field="inventory" data-idx="${idx}">${r.inventory}</td>
      <td class="editable" data-field="deliveryCycle" data-idx="${idx}">${r.deliveryCycle}</td>
      <td>${fillRate}%</td>
      <td>${inventoryDays}</td>
      <td><span class="status-badge ${r.status}">${statusText[r.status] || r.status}</span></td>
      <td><div class="analysis-text">${getAnalysisText(r)}</div></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.editable').forEach(cell => {
    cell.addEventListener('click', startEdit);
  });
}

function getAnalysisText(r) {
  const fillRate = r.demand > 0 ? (r.sales / r.demand) * 100 : 0;
  const inventoryDays = r.sales > 0 ? r.inventory / (r.sales / 30) : 999;
  const parts = [];
  if (fillRate >= 95) parts.push('需求满足率高');
  else if (fillRate < 70) parts.push('需求满足率严重不足');
  else if (fillRate < 85) parts.push('需求满足率偏低');

  if (inventoryDays >= r.deliveryCycle * 1.5) parts.push('库存充足');
  else if (inventoryDays < r.deliveryCycle * 0.5) parts.push('库存紧缺');
  else if (inventoryDays < r.deliveryCycle) parts.push('库存偏紧');

  if (r.deliveryCycle > 10) parts.push('配送周期较长');
  else if (r.deliveryCycle <= 3) parts.push('配送快速');

  return parts.join('；') || '数据正常';
}

function startEdit(e) {
  const cell = e.target;
  if (cell.querySelector('input')) return;
  const field = cell.dataset.field;
  const idx = parseInt(cell.dataset.idx);
  const oldValue = cell.textContent;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'edit-input';
  input.value = oldValue;
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  function finishEdit() {
    const newValue = parseFloat(input.value) || 0;
    records[idx][field] = newValue;
    records[idx].status = analyzeStatus(records[idx]);
    renderAll();
  }

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { input.blur(); }
    if (ev.key === 'Escape') {
      cell.textContent = oldValue;
    }
  });
}

function renderCharts() {
  renderSalesChart();
  renderDemandChart();
  renderStatusChart();
  renderCycleChart();
}

function renderSalesChart() {
  const el = document.getElementById('salesChart');
  let chart = echarts.getInstanceByDom(el);
  if (!chart) chart = echarts.init(el);
  const grouped = {};
  records.forEach(r => {
    grouped[r.supplyChain] = (grouped[r.supplyChain] || 0) + r.sales;
  });
  const data = Object.entries(grouped).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0,8);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: data.map(d=>d.name), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value' },
    series: [{
      data: data.map(d=>d.value),
      type: 'bar',
      itemStyle: { borderRadius: [4,4,0,0], color: '#1890ff' }
    }]
  });
}

function renderDemandChart() {
  const el = document.getElementById('demandChart');
  let chart = echarts.getInstanceByDom(el);
  if (!chart) chart = echarts.init(el);
  const names = records.slice(0,10).map(r=>r.supplyChain);
  const demands = records.slice(0,10).map(r=>r.demand);
  const sales = records.slice(0,10).map(r=>r.sales);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['需求量','销量'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: names, axisLabel: { rotate: 30 } },
    yAxis: { type: 'value' },
    series: [
      { name: '需求量', type: 'bar', data: demands, itemStyle: { color: '#722ed1' } },
      { name: '销量', type: 'bar', data: sales, itemStyle: { color: '#52c41a' } }
    ]
  });
}

function renderStatusChart() {
  const el = document.getElementById('statusChart');
  let chart = echarts.getInstanceByDom(el);
  if (!chart) chart = echarts.init(el);
  const counts = { healthy: 0, normal: 0, warning: 0, critical: 0 };
  records.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const data = Object.entries(counts).filter(([,v])=>v>0).map(([k,v])=>({ name: statusText[k], value: v }));
  chart.setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data,
      label: { formatter: '{b}: {c} ({d}%)' },
      itemStyle: { borderRadius: 6 }
    }],
    color: ['#52c41a','#1890ff','#faad14','#f5222d']
  });
}

function renderCycleChart() {
  const el = document.getElementById('cycleChart');
  let chart = echarts.getInstanceByDom(el);
  if (!chart) chart = echarts.init(el);
  const sorted = [...records].sort((a,b)=>b.deliveryCycle - a.deliveryCycle).slice(0,15);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: sorted.map(r=>r.supplyChain), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', name: '天数' },
    series: [{
      data: sorted.map(r=>r.deliveryCycle),
      type: 'line',
      smooth: true,
      areaStyle: { color: 'rgba(24,144,255,0.2)' },
      lineStyle: { color: '#1890ff', width: 3 },
      itemStyle: { color: '#1890ff' },
      markLine: {
        data: [{ type: 'average', name: '平均值' }]
      }
    }]
  });
}

// 文件上传
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      records = mapData(jsonData);
      saveToStorage();
      renderAll();
      showToast(`成功导入 ${records.length} 条数据`);
    } catch (err) {
      showToast('解析Excel失败: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  handleFile(file);
  e.target.value = '';
});

// 导出
document.getElementById('exportBtn').addEventListener('click', () => {
  if (records.length === 0) {
    showToast('暂无数据可导出');
    return;
  }
  const exportData = records.map(r => ({
    '供应链': r.supplyChain,
    '产品': r.product,
    '区域': r.region,
    '需求量': r.demand,
    '销量': r.sales,
    '库存': r.inventory,
    '配送周期(天)': r.deliveryCycle,
    '满足率(%)': r.demand > 0 ? ((r.sales/r.demand)*100).toFixed(1) : 0,
    '库存天数': r.sales > 0 ? (r.inventory/(r.sales/30)).toFixed(1) : '-',
    '状态': statusText[r.status] || r.status
  }));
  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '供应链数据');
  XLSX.writeFile(wb, '供应链数据导出.xlsx');
  showToast('导出成功');
});

// 保存
document.getElementById('saveBtn').addEventListener('click', () => {
  saveToStorage();
  showToast('保存成功，数据已持久化到本地');
});

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

window.addEventListener('resize', () => {
  ['salesChart','demandChart','statusChart','cycleChart'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const chart = echarts.getInstanceByDom(el);
      if (chart) chart.resize();
    }
  });
});

// 初始化加载
loadData();
