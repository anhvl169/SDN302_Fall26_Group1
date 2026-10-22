(() => {
  const $ = (selector) => document.querySelector(selector);
  const tokenKey = 'fruitToken';
  const token = () => sessionStorage.getItem(tokenKey);
  const escape = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value) || 0);
  let authMode = 'login';

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  }
  function notify(message, error = false) {
    const box = $('#notice'); box.textContent = message; box.hidden = false; box.className = `notice is-${error ? 'error' : 'success'}`;
  }
  function renderAccount() {
    const loggedIn = Boolean(token());
    const role = sessionStorage.getItem('fruitRole');
    $('#account-label').hidden = loggedIn;
    $('#cart-trigger').hidden = !loggedIn || role !== 'CUSTOMER';
    $('#account-logout').hidden = !loggedIn;
    $('#customer-panel').hidden = !loggedIn || role !== 'CUSTOMER';
    $('#categories-tab').hidden = !loggedIn || !['ADMIN', 'SHOP_OWNER'].includes(role);
    document.querySelectorAll('.add-cart').forEach((button) => { button.hidden = loggedIn && role !== 'CUSTOMER'; });
  }
  function setAuthMode(mode) {
    authMode = mode;
    const registering = mode === 'register';
    $('#name-row').hidden = !registering;
    $('#account-name').required = registering;
    $('#account-password').autocomplete = registering ? 'new-password' : 'current-password';
    $('#account-password').minLength = registering ? 8 : 0;
    $('#account-submit').textContent = registering ? 'Tạo tài khoản' : 'Đăng nhập';
    $('#auth-title').textContent = registering ? 'Tạo tài khoản của bạn' : 'Chào mừng bạn trở lại';
    $('#auth-intro').textContent = registering ? 'Đăng ký miễn phí để lưu giỏ hàng và theo dõi đơn.' : 'Đăng nhập để tiếp tục mua sắm và theo dõi đơn hàng.';
    $('#auth-hint').textContent = registering ? 'Mật khẩu cần có ít nhất 8 ký tự.' : 'Dùng email và mật khẩu đã đăng ký.';
    $('#auth-message').textContent = '';
    $('#login-mode').classList.toggle('is-active', !registering);
    $('#register-mode').classList.toggle('is-active', registering);
    $('#login-mode').setAttribute('aria-selected', String(!registering));
    $('#register-mode').setAttribute('aria-selected', String(registering));
  }
  function openAuth(mode = 'login', message = '') {
    setAuthMode(mode);
    $('#auth-dialog').showModal();
    $('#auth-message').textContent = message;
    window.setTimeout(() => (mode === 'register' ? $('#account-name') : $('#account-email')).focus(), 0);
  }
  async function loadCustomer() {
    if (!token() || sessionStorage.getItem('fruitRole') !== 'CUSTOMER') return;
    try {
      const [cart, orders] = await Promise.all([api('/cart'), api('/orders')]);
      const cartCount = (cart.data.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      $('#cart-count').textContent = String(cartCount);
      $('#cart-content').innerHTML = cart.data.items?.length ? cart.data.items.map((item) => {
        const product = item.productId;
        return product && typeof product === 'object' ? `<article class="cart-item"><span>${escape(product.productName)} × ${item.quantity}</span><strong>${money(product.price * item.quantity)}</strong><button type="button" class="button button-text remove-cart" data-id="${escape(product._id)}">Xóa</button></article>` : '';
      }).join('') : '<p>Giỏ hàng đang trống.</p>';
      $('#orders-content').innerHTML = orders.data.length ? orders.data.map((order) => `<article class="order-card"><strong>${escape(order.shopId?.shopName || 'Shop')} · ${money(order.totalAmount)}</strong><span>${escape(order.orderStatus)} · ${escape(order.paymentStatus)}</span>${order.paymentMethod === 'MOCK_ONLINE' && order.paymentStatus === 'UNPAID' ? `<button class="button button-text pay-simulate" data-id="${escape(order._id)}" type="button">Giả lập thanh toán</button>` : ''}</article>`).join('') : '<p>Chưa có đơn hàng.</p>';
    } catch (error) { notify(error.message, true); }
  }

  $('#account-label').addEventListener('click', () => {
    if (!token()) return openAuth('login');
    if (['ADMIN', 'SHOP_OWNER'].includes(sessionStorage.getItem('fruitRole'))) return $('#categories-tab').click();
    $('#customer-panel').scrollIntoView({ behavior: 'smooth' });
  });
  $('#cart-trigger').addEventListener('click', () => $('#customer-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('#login-mode').addEventListener('click', () => setAuthMode('login'));
  $('#register-mode').addEventListener('click', () => setAuthMode('register'));
  $('#auth-close').addEventListener('click', () => $('#auth-dialog').close());
  $('#auth-dialog').addEventListener('click', (event) => { if (event.target === $('#auth-dialog')) $('#auth-dialog').close(); });
  $('#account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#account-submit'); submit.disabled = true; $('#auth-message').textContent = '';
    try {
      const email = $('#account-email').value.trim();
      const password = $('#account-password').value;
      if (authMode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ fullName: $('#account-name').value.trim(), email, password }) });
        setAuthMode('login');
        $('#account-email').value = email;
        $('#account-password').value = '';
        $('#auth-message').textContent = 'Tạo tài khoản thành công. Đăng nhập để tiếp tục.';
        return;
      }
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      sessionStorage.setItem(tokenKey, result.data.token);
      sessionStorage.setItem('fruitName', result.data.user.fullName);
      sessionStorage.setItem('fruitRole', result.data.user.role);
      $('#auth-dialog').close(); renderAccount(); await loadCustomer();
      notify(`Xin chào ${result.data.user.fullName}.`);
    } catch (error) { $('#auth-message').textContent = error.message; }
    finally { submit.disabled = false; }
  });
  $('#account-logout').addEventListener('click', () => {
    [tokenKey, 'fruitName', 'fruitRole'].forEach((key) => sessionStorage.removeItem(key));
    renderAccount(); notify('Bạn đã đăng xuất.');
  });

  const grid = $('#product-grid');
  const addButtons = () => grid.querySelectorAll('.product-card[data-product-id]').forEach((card) => {
    if (card.querySelector('.add-cart')) return;
    const button = document.createElement('button'); button.className = 'button button-primary add-cart'; button.type = 'button'; button.dataset.id = card.dataset.productId; button.textContent = 'Thêm vào giỏ';
    button.hidden = Boolean(token()) && sessionStorage.getItem('fruitRole') !== 'CUSTOMER';
    card.querySelector('.product-info')?.append(button);
  });
  new MutationObserver(addButtons).observe(grid, { childList: true, subtree: true });
  grid.addEventListener('click', async (event) => {
    const button = event.target.closest('.add-cart'); if (!button) return;
    if (!token()) { openAuth('login', 'Đăng nhập hoặc tạo tài khoản để thêm hàng vào giỏ.'); return; }
    try { await api('/cart/items', { method: 'POST', body: JSON.stringify({ productId: button.dataset.id, quantity: 1 }) }); await loadCustomer(); notify('Đã thêm sản phẩm vào giỏ.'); }
    catch (error) { notify(error.message, true); }
  });
  $('#customer-panel').addEventListener('click', async (event) => {
    const remove = event.target.closest('.remove-cart'), pay = event.target.closest('.pay-simulate');
    try {
      if (remove) await api(`/cart/items/${encodeURIComponent(remove.dataset.id)}`, { method: 'DELETE' });
      if (pay) { await api(`/orders/${encodeURIComponent(pay.dataset.id)}/pay-simulate`, { method: 'POST' }); notify('Thanh toán mô phỏng thành công.'); }
      if (remove || pay) await loadCustomer();
    } catch (error) { notify(error.message, true); }
  });
  $('#checkout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const result = await api('/orders/checkout', { method: 'POST', body: JSON.stringify({ shippingAddress: $('#shipping-address').value, paymentMethod: $('#payment-method').value }) }); notify(result.message); await loadCustomer(); }
    catch (error) { notify(error.message, true); }
  });
  $('#shop-request-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await api('/shop-requests', { method: 'POST', body: JSON.stringify({ shopName: $('#request-shop-name').value, description: $('#request-shop-description').value }) }); notify('Đã gửi yêu cầu mở shop. Quản trị viên sẽ duyệt yêu cầu.'); event.target.reset(); }
    catch (error) { notify(error.message, true); }
  });
  $('#refresh-customer').addEventListener('click', loadCustomer);
  renderAccount(); loadCustomer();
})();
