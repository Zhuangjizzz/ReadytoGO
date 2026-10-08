const button = document.querySelector('#check-button');
const status = document.querySelector('#server-state');
const detail = document.querySelector('#check-detail');
document.querySelector('#connection-type').textContent = location.protocol === 'https:' ? 'HTTPS' : 'HTTP（验证阶段）';

async function checkConnection() {
  button.disabled = true;
  status.textContent = '检查中…';
  detail.textContent = '正在向服务器发送检查请求。';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('/healthz', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('HTTP check failed');
    const data = await response.json();
    if (data.ok !== true || data.service !== 'readytogo-smoke') throw new Error('Unexpected service');
    status.textContent = '连接正常';
    detail.textContent = `服务器已响应 · ${new Date(data.time).toLocaleString('zh-CN')}`;
  } catch {
    status.textContent = '暂时无法连接';
    detail.textContent = '未收到有效响应，请稍后重新检查。';
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
  }
}

button.addEventListener('click', checkConnection);
checkConnection();
