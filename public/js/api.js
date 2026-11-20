// MONGOLIAN MEDIA — API Client & Session Manager

window.API = {
  baseUrl: window.location.origin,

  getDeviceId() {
    let devId = localStorage.getItem('mm_device_id');
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('mm_device_id', devId);
    }
    return devId;
  },

  getDeviceName() {
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (/iPhone/i.test(navigator.userAgent)) return 'Apple iPhone';
    if (/iPad/i.test(navigator.userAgent)) return 'Apple iPad';
    if (/Android/i.test(navigator.userAgent)) return 'Android Утас';
    return 'Компьютер хөтөч';
  },

  getToken() {
    return localStorage.getItem('mm_auth_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('mm_auth_token', token);
    } else {
      localStorage.removeItem('mm_auth_token');
    }
  },

  async request(endpoint, method = 'GET', body = null, retries = 2) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Device-ID': this.getDeviceId()
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const opts = { method, headers };
    if (body) {
      opts.body = JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${endpoint}`, opts);
        const text = await res.text();
        let data = {};
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          data = { message: text || `Серверийн хариу: ${res.status}` };
        }
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        console.warn(`[API Error - Оролдлого ${attempt + 1}]`, endpoint, err);
        if (attempt < retries) {
          // Wait 2.5 seconds before retrying (Render cold start handling)
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }
        return {
          ok: false,
          status: 0,
          data: {
            error: 'network_error',
            message: 'Сервер холбогдож байна (сервер түр унтсан байж магадгүй). 5-10 секундын дараа дахин оролдоно уу.'
          }
        };
      }
    }
  },

  // Auth APIs
  async codeLogin(name, code) {
    const res = await this.request('/api/auth/code-login', 'POST', {
      name,
      code,
      device_id: this.getDeviceId(),
      device_name: this.getDeviceName()
    });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
      if (res.data.user) {
        try { localStorage.setItem('mm_user_profile', JSON.stringify(res.data.user)); } catch (e) {}
      }
      if (res.data.entitlement) {
        try { localStorage.setItem('mm_entitlement', JSON.stringify(res.data.entitlement)); } catch (e) {}
      }
    }
    return res;
  },

  async adminLogin(email, password) {
    const res = await this.request('/api/auth/admin-login', 'POST', {
      email,
      password,
      device_id: this.getDeviceId(),
      device_name: this.getDeviceName()
    });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
      if (res.data.user) {
        try { localStorage.setItem('mm_user_profile', JSON.stringify(res.data.user)); } catch (e) {}
      }
      if (res.data.entitlement) {
        try { localStorage.setItem('mm_entitlement', JSON.stringify(res.data.entitlement)); } catch (e) {}
      }
    }
    return res;
  },

  async requestOtp(email, name) {
    return this.request('/api/auth/request-otp', 'POST', { email, name });
  },

  async verifyOtp(email, otp) {
    const res = await this.request('/api/auth/verify-otp', 'POST', {
      email,
      otp,
      device_id: this.getDeviceId(),
      device_name: this.getDeviceName()
    });
    if (res.ok && res.data.token) {
      this.setToken(res.data.token);
      if (res.data.user) {
        try { localStorage.setItem('mm_user_profile', JSON.stringify(res.data.user)); } catch (e) {}
      }
      if (res.data.entitlement) {
        try { localStorage.setItem('mm_entitlement', JSON.stringify(res.data.entitlement)); } catch (e) {}
      }
    }
    return res;
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  async logout() {
    this.setToken('');
    try {
      localStorage.removeItem('mm_user_profile');
      localStorage.removeItem('mm_entitlement');
    } catch (e) {}
    return { ok: true };
  },

  // Payment Submission
  async submitPayment(referenceNo, notes, amount) {
    return this.request('/api/payment/submit', 'POST', {
      reference_no: referenceNo,
      notes,
      amount
    });
  },

  // Protected Content Fetch
  async fetchCurriculum() {
    return this.request('/api/content/curriculum');
  },

  // User Progress Sync
  async saveProgress(state) {
    return this.request('/api/progress/save', 'POST', { state });
  },

  async getProgress() {
    return this.request('/api/progress/get');
  },

  // Redeem 1-time personalized invite
  async redeemInvite(inviteToken) {
    return this.request('/api/invite/redeem', 'POST', { invite_token: inviteToken });
  },

  // App General Info
  async getInfo() {
    return this.request('/api/info');
  },

  // Admin APIs
  async adminGetUsers(status = 'all') {
    return this.request(`/api/admin/users?status=${status}`);
  },

  async adminApprovePayment(userId) {
    return this.request('/api/admin/approve-payment', 'POST', { user_id: userId });
  },

  async adminRejectPayment(userId, reason) {
    return this.request('/api/admin/reject-payment', 'POST', { user_id: userId, reason });
  },

  async adminToggleStatus(userId, status) {
    return this.request('/api/admin/toggle-status', 'POST', { user_id: userId, status });
  },

  async adminApproveDevice(userId) {
    return this.request('/api/admin/approve-device', 'POST', { user_id: userId });
  },

  async adminDeleteUser(userId) {
    return this.request('/api/admin/delete-user', 'POST', { user_id: userId });
  },

  async adminCreateInvite(email) {
    return this.request('/api/admin/create-invite', 'POST', { email });
  },

  async adminCreateCode(count = 1, customCode = '') {
    return this.request('/api/admin/create-code', 'POST', {
      count,
      custom_code: customCode
    });
  },

  async adminDeleteCode(codeId) {
    return this.request('/api/admin/delete-code', 'POST', {
      code_id: codeId
    });
  },

  async adminGetInvites() {
    return this.request('/api/admin/invites');
  },

  async adminGetNotifications() {
    return this.request('/api/admin/notifications');
  },

  async adminGetAuditLogs() {
    return this.request('/api/admin/audit-logs');
  }
};
