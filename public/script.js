async function createLink() {
  const content = document.getElementById('content').value;
  if (!content) {
    alert('Vui lòng nhập nội dung!');
    return;
  }

  try {
    const response = await fetch('/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await response.json();

    if (data.link) {
      document.getElementById('result').innerHTML = `Raw của bạn: <a href="${data.link}" target="_blank">${data.link}</a>`;
      document.getElementById('content').value = '';
      loadLinks();
    } else {
      alert('Có lỗi xảy ra!');
    }
  } catch (err) {
    console.error(err);
    alert('Lỗi khi tạo link!');
  }
}

async function loadLinks() {
  try {
    const response = await fetch('/links');
    const links = await response.json();
    const tbody = document.getElementById('linksBody');
    tbody.innerHTML = '';

    links.forEach(link => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${link.link}" target="_blank">${link.link}</a></td>
        <td>${link.content.substring(0, 50)}${link.content.length > 50 ? '...' : ''}</td>
        <td>${new Date(link.createdAt).toLocaleString('vi-VN')}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error(err);
  }
}

// Tải danh sách link khi trang được tải
window.onload = loadLinks;